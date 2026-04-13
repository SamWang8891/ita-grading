import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ScoreInput, { shouldShowNumberPad } from './ScoreInput.jsx'

describe('ScoreInput', () => {
  it('exposes inputmode=numeric and pattern for mobile keyboards', () => {
    render(<ScoreInput value={null} max={30} onChange={() => {}} aria-label="topic" />)
    const el = screen.getByLabelText('topic')
    expect(el).toHaveAttribute('inputmode', 'numeric')
    expect(el).toHaveAttribute('pattern', '[0-9]*')
  })

  it('clamps to max and strips non-digits', async () => {
    const onChange = vi.fn()
    render(<ScoreInput value={null} max={30} onChange={onChange} aria-label="topic" />)
    const el = screen.getByLabelText('topic')
    await userEvent.type(el, '9a9')
    expect(onChange).toHaveBeenLastCalledWith(30)
  })

  it('allows clearing to null', async () => {
    const onChange = vi.fn()
    render(<ScoreInput value={5} max={30} onChange={onChange} aria-label="topic" />)
    const el = screen.getByLabelText('topic')
    await userEvent.clear(el)
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('shouldShowNumberPad honors pointer:fine and width gate', () => {
    const prev = window.matchMedia
    let matches = true
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, writable: true,
      value: () => ({ matches, media: '', onchange: null,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {}, dispatchEvent() {} }),
    })

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024, writable: true })
    matches = true; expect(shouldShowNumberPad()).toBe(true)

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500, writable: true })
    matches = true; expect(shouldShowNumberPad()).toBe(false)

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200, writable: true })
    matches = false; expect(shouldShowNumberPad()).toBe(false)

    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: prev })
  })
})
