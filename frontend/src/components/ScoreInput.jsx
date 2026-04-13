import { forwardRef, useEffect, useRef, useState } from 'react'

const ScoreInput = forwardRef(function ScoreInput(
  { value, onChange, max, min = 0, onFocus, onBlur, disabled, ...rest },
  ref,
) {
  const inputRef = useRef(null)
  useEffect(() => {
    if (typeof ref === 'function') ref(inputRef.current)
    else if (ref) ref.current = inputRef.current
  })

  const [stringValue, setStringValue] = useState(value == null ? '' : String(value))
  useEffect(() => {
    setStringValue(value == null ? '' : String(value))
  }, [value])

  const clamp = (n) => {
    if (Number.isNaN(n)) return min
    if (n > max) return max
    if (n < min) return min
    return n
  }

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    if (raw === '') {
      setStringValue('')
      onChange?.(null)
      return
    }
    const n = clamp(parseInt(raw, 10))
    setStringValue(String(n))
    onChange?.(n)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={String(max).length}
      value={stringValue}
      onChange={handleChange}
      onFocus={onFocus}
      onBlur={onBlur}
      disabled={disabled}
      {...rest}
    />
  )
})

export default ScoreInput

/** Decide whether the desktop number pad should render. */
export function shouldShowNumberPad() {
  if (typeof window === 'undefined') return false
  const finePointer = window.matchMedia('(pointer: fine)').matches
  return finePointer && window.innerWidth >= 768
}
