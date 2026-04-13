import { useTheme } from './ThemeContext.jsx'

export default function ThemeToggle() {
  const { resolved, cycle } = useTheme()
  const isDark = resolved === 'dark'
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={isDark ? '切換為亮色模式' : '切換為暗色模式'}
      title={isDark ? '切換為亮色模式' : '切換為暗色模式'}
      onClick={cycle}
    >
      <span className="material-symbols-rounded" aria-hidden="true">
        {isDark ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  )
}
