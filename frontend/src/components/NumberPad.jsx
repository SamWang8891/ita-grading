import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Floating on-screen numeric pad for desktop + tablet with a precise pointer.
 * Positions itself beside the focused input, choosing the first non-colliding slot
 * among {right, below, screen-corner}.
 *
 * Props:
 *  - targetEl: the focused input element (or null to hide)
 *  - avoidEls: other elements the pad must not overlap (array)
 *  - onKey: ('0'..'9' | 'back' | 'del') => void
 *  - onClose: () => void
 */
const EMPTY_AVOIDS = []

export default function NumberPad({ targetEl, avoidEls = EMPTY_AVOIDS, onKey, onClose }) {
  const padRef = useRef(null)
  const [pos, setPos] = useState(null)
  const [portalNode] = useState(() => {
    if (typeof document === 'undefined') return null
    const node = document.createElement('div')
    node.setAttribute('data-numpad-portal', '')
    return node
  })

  useEffect(() => {
    if (!portalNode) return
    document.body.appendChild(portalNode)
    return () => { portalNode.remove() }
  }, [portalNode])

  const avoidRef = useRef(avoidEls)
  avoidRef.current = avoidEls

  useLayoutEffect(() => {
    if (!targetEl) { setPos(null); return }
    const compute = () => {
      const next = computePosition(targetEl, padRef.current, avoidRef.current)
      setPos((prev) => (prev && prev.left === next.left && prev.top === next.top ? prev : next))
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [targetEl])

  useEffect(() => {
    if (!targetEl) return
    const onDown = (ev) => {
      const inTarget = targetEl.contains(ev.target)
      const inPad = padRef.current && padRef.current.contains(ev.target)
      if (!inTarget && !inPad) onClose?.()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [targetEl, onClose])

  if (!portalNode || !targetEl) return null

  const keys = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['back','0','del'],
  ]
  const label = (k) => k === 'back' ? '←' : k === 'del' ? 'Del' : k

  return createPortal(
    <div
      ref={padRef}
      className="numpad"
      style={{
        position: 'fixed',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label="數字盤"
    >
      {keys.map((row, i) => (
        <div key={i} className="row">
          {row.map((k) => (
            <button
              key={k}
              type="button"
              className={`key ${k === 'back' || k === 'del' ? 'aux' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); onKey?.(k) }}
            >
              {label(k)}
            </button>
          ))}
        </div>
      ))}
    </div>,
    portalNode,
  )
}

function computePosition(targetEl, padEl, avoidEls) {
  const tRect = targetEl.getBoundingClientRect()
  const padW = padEl?.offsetWidth || 192
  const padH = padEl?.offsetHeight || 224
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = 8
  const candidates = [
    { left: tRect.right + gap, top: tRect.top },
    { left: tRect.left, top: tRect.bottom + gap },
    { left: Math.max(16, vw - padW - 16), top: 16 },
  ]
  for (const c of candidates) {
    if (c.left + padW > vw - 4) continue
    if (c.top + padH > vh - 4) continue
    if (c.left < 4 || c.top < 4) continue
    const rect = { left: c.left, top: c.top, right: c.left + padW, bottom: c.top + padH }
    if (overlapsAny(rect, avoidEls, targetEl)) continue
    return c
  }
  return { left: Math.max(16, vw - padW - 16), top: 16 }
}

function overlapsAny(rect, els, skip) {
  for (const el of els) {
    if (!el || el === skip) continue
    const r = el.getBoundingClientRect()
    const overlap = !(rect.right < r.left || rect.left > r.right || rect.bottom < r.top || rect.top > r.bottom)
    if (overlap) return true
  }
  return false
}
