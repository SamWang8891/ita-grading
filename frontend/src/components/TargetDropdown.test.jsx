import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TargetDropdown from './TargetDropdown.jsx'

const TARGETS = [
  { student_id: 'B1', name: 'Alice', class_name: 'A', evaluated: false, total: null },
  { student_id: 'B2', name: 'Bob',   class_name: 'A', evaluated: true,  total: 87 },
]

describe('TargetDropdown', () => {
  it('renders all targets and marks evaluated ones with a checkmark + current total', () => {
    render(<TargetDropdown targets={TARGETS} value="" onChange={() => {}} />)
    const opts = screen.getAllByRole('option').map((o) => o.textContent)
    expect(opts[0]).toMatch(/請選擇/)
    expect(opts).toEqual(expect.arrayContaining([expect.stringMatching(/✓\s*B2\s+Bob.*87/)]))
    expect(opts).toEqual(expect.arrayContaining([expect.stringMatching(/B1\s+Alice/)]))
  })

  it('does not include self (targets prop is expected to be filtered by the API)', () => {
    render(<TargetDropdown targets={TARGETS} value="" onChange={() => {}} />)
    for (const opt of screen.getAllByRole('option')) {
      expect(opt.textContent).not.toMatch(/myself/i)
    }
  })

  it('fires onChange', async () => {
    const onChange = vi.fn()
    render(<TargetDropdown targets={TARGETS} value="" onChange={onChange} />)
    const select = screen.getByRole('combobox')
    select.value = 'B2'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(onChange).toHaveBeenCalledWith('B2')
  })
})
