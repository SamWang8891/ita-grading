import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionContext.jsx'

export default function Header() {
  const { session, logout } = useSession()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsNarrow(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => { if (!isNarrow) setDrawerOpen(false) }, [isNarrow])

  const handleLogout = async () => {
    await logout()
    setDrawerOpen(false)
    navigate('/', { replace: true })
  }

  const userLabel = session
    ? (session.role === 'student'
        ? `${session.name}（${session.actor_id}）`
        : session.role === 'teacher'
          ? `${session.name} 老師`
          : '管理員')
    : ''

  return (
    <header className="app-header">
      <Link to="/" className="brand">
        <span className="logo" aria-hidden="true">★</span>
        <span className="title">學生報告互評系統</span>
      </Link>

      {!session ? null : isNarrow ? (
        <>
          <button
            type="button"
            className="ghost hamburger"
            aria-label="Menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            ☰
          </button>
          {drawerOpen && (
            <div className="drawer" role="menu">
              <div className="drawer-user">{userLabel}</div>
              <button type="button" className="primary" onClick={handleLogout}>登出</button>
            </div>
          )}
        </>
      ) : (
        <div className="user">
          <span className="user-label">{userLabel}</span>
          <button type="button" className="ghost" onClick={handleLogout}>登出</button>
        </div>
      )}
    </header>
  )
}
