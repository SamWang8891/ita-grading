import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Evaluate from './Evaluate.jsx'
import { SessionContext } from '../auth/SessionContext.jsx'

// The Context module exports only the provider & hook publicly; re-import via
// the file so the same context instance is used in the component tree.
vi.mock('../auth/SessionContext.jsx', async (orig) => {
  const mod = await orig()
  return { ...mod }
})

function renderEvaluate({ session, initialPath = '/evaluate/midterm' }) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <FakeSession value={session}>
        <Routes>
          <Route path="/evaluate/:period" element={<Evaluate />} />
        </Routes>
      </FakeSession>
    </MemoryRouter>,
  )
}

// The shipped provider fetches /api/auth/me on mount, which complicates tests.
// For Evaluate tests we don't need the real provider — we only need useSession
// to return a session. So we emulate the context value.
import { SessionContext as ImportedCtx } from '../auth/SessionContext.jsx'
function FakeSession({ value, children }) {
  return <ImportedCtx.Provider value={{ session: value, loading: false, refresh: () => {}, logout: () => {}, setSession: () => {} }}>{children}</ImportedCtx.Provider>
}

const SESSION = { role: 'student', actor_id: 'B001', name: 'Alice', class_name: 'A', periods: [] }

const mockFetch = (paths) => vi.fn(async (url, init) => {
  const u = typeof url === 'string' ? url : url.toString()
  const method = (init?.method || 'GET').toUpperCase()
  const key = `${method} ${u.split('?')[0]}`
  const handler = paths[key]
  if (!handler) throw new Error(`unexpected fetch: ${key}`)
  const r = await handler(init)
  const isJson = typeof r === 'object' && r !== null
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': isJson ? 'application/json' : 'text/plain' }),
    async json() { return r },
    async text() { return isJson ? JSON.stringify(r) : String(r) },
  }
})

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() {}, media: '' }),
  })
})

afterEach(() => { vi.restoreAllMocks() })

describe('Evaluate page', () => {
  it('prefills fields from latest submission and POSTs the expected body on submit', async () => {
    const postBodies = []
    const handlers = {
      'GET /api/student/periods': async () => ([{ code: 'midterm', label: '期中', is_open: 1 }]),
      'GET /api/student/targets': async () => ([
        { student_id: 'B002', name: 'Bob', class_name: 'A', evaluated: true, total: 88 },
      ]),
      'GET /api/student/submissions/midterm/B002/detail': async () => ({
        latest: {
          id: 7, period_code: 'midterm', grader_student_id: 'B001', target_student_id: 'B002',
          score_topic: 28, score_content: 27, score_narrative: 18, score_presentation: 9, score_teamwork: 6,
          comment: 'OK', self_note: 'inner', submitted_at: '2026-01-01 00:00:00', source: 'form', total: 88,
        },
        versions: [{ id: 7, submitted_at: '2026-01-01 00:00:00', source: 'form',
                     score_topic: 28, score_content: 27, score_narrative: 18,
                     score_presentation: 9, score_teamwork: 6, comment: 'OK', self_note: 'inner' }],
      }),
      'POST /api/student/submissions': async (init) => {
        postBodies.push(JSON.parse(init.body))
        return { id: 8 }
      },
    }
    global.fetch = mockFetch(handlers)

    renderEvaluate({ session: SESSION })

    // wait for targets then choose B002
    const select = await screen.findByRole('combobox')
    await userEvent.selectOptions(select, 'B002')
    expect(await screen.findByTestId('total')).toHaveTextContent('88')

    // hit submit
    await userEvent.click(screen.getByRole('button', { name: '送出評分' }))
    await waitFor(() => expect(postBodies.length).toBe(1))
    expect(postBodies[0]).toEqual({
      period: 'midterm',
      target_student_id: 'B002',
      scores: { topic: 28, content: 27, narrative: 18, presentation: 9, teamwork: 6 },
      comment: 'OK',
      self_note: 'inner',
    })
  })

  it('persists a draft in localStorage and clears it after submit', async () => {
    const handlers = {
      'GET /api/student/periods': async () => ([{ code: 'midterm', label: '期中', is_open: 1 }]),
      'GET /api/student/targets': async () => ([
        { student_id: 'B002', name: 'Bob', class_name: 'A', evaluated: false, total: null },
      ]),
      'GET /api/student/submissions/midterm/B002/detail': async () => ({ latest: null, versions: [] }),
      'POST /api/student/submissions': async () => ({ id: 1 }),
    }
    global.fetch = mockFetch(handlers)

    renderEvaluate({ session: SESSION })
    const select = await screen.findByRole('combobox')
    await userEvent.selectOptions(select, 'B002')

    const topic = await screen.findByLabelText('主題掌握')
    await userEvent.type(topic, '25')
    await waitFor(() => {
      expect(localStorage.getItem('draft:B001:midterm:B002')).toMatch(/25/)
    })

    // Fill remaining fields so submit becomes enabled
    await userEvent.type(screen.getByLabelText('內容豐富'), '25')
    await userEvent.type(screen.getByLabelText('敘事技巧'), '15')
    await userEvent.type(screen.getByLabelText('簡報技巧與互動'), '8')
    await userEvent.type(screen.getByLabelText('團隊表現'), '7')

    await userEvent.click(screen.getByRole('button', { name: '送出評分' }))
    await waitFor(() => expect(localStorage.getItem('draft:B001:midterm:B002')).toBeNull())
  })
})
