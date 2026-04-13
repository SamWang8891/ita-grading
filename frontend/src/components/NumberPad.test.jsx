import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NumberPad from './NumberPad.jsx'

function makeHost() {
  const input = document.createElement('input')
  document.body.appendChild(input)
  input.getBoundingClientRect = () => ({
    left: 100, top: 100, right: 200, bottom: 130,
    width: 100, height: 30, x: 100, y: 100, toJSON: () => ({}),
  })
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 })
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 900 })
  return input
}

describe('NumberPad', () => {
  it('fires digit keys', async () => {
    const onKey = vi.fn()
    const target = makeHost()
    render(<NumberPad targetEl={target} onKey={onKey} />)
    await userEvent.click(screen.getByRole('button', { name: '7' }))
    expect(onKey).toHaveBeenCalledWith('7')
  })

  it('has back and del keys', async () => {
    const onKey = vi.fn()
    const target = makeHost()
    render(<NumberPad targetEl={target} onKey={onKey} />)
    await userEvent.click(screen.getByRole('button', { name: '←' }))
    await userEvent.click(screen.getByRole('button', { name: 'Del' }))
    expect(onKey).toHaveBeenCalledWith('back')
    expect(onKey).toHaveBeenCalledWith('del')
  })

  it('closes when clicking outside', async () => {
    const onClose = vi.fn()
    const target = makeHost()
    render(<NumberPad targetEl={target} onKey={() => {}} onClose={onClose} />)
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onClose).toHaveBeenCalled()
  })
})
