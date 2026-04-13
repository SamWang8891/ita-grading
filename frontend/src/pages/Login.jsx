import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useSession } from '../auth/SessionContext.jsx'

function NoticeModal({ onConfirm }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(16, 24, 40, 0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div className="card stack" style={{ maxWidth: 400, width: '100%', gap: 20 }}>
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <span className="material-symbols-rounded warn" style={{ fontSize: 28, flexShrink: 0, marginTop: 2 }}>
            warning
          </span>
          <div>
            <h2 style={{ marginBottom: 8 }}>注意事項</h2>
            <p style={{ margin: 0, lineHeight: 1.7 }}>
              您的任何操作紀錄將會被紀錄，請勿未經過他人授權使用他人帳號登入！
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="primary" onClick={onConfirm} autoFocus>
            我已了解
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [stage, setStage] = useState('identify') // 'identify' | 'password'
  const [role, setRole] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showNotice, setShowNotice] = useState(false)
  const { refresh } = useSession()
  const navigate = useNavigate()

  const handleIdentify = async (e) => {
    e.preventDefault()
    if (!identifier.trim()) return
    setBusy(true); setError('')
    try {
      const res = await api.post('/api/auth/identify', { identifier: identifier.trim() })
      if (res.need_password) {
        setRole(res.role)
        setStage('password')
      } else {
        await refresh()
        setShowNotice(true)
      }
    } catch (err) {
      setError(err.status === 429 ? '嘗試次數過多，請稍後再試' :
               err.status === 404 ? '找不到此帳號或學號' : err.message)
    } finally { setBusy(false) }
  }

  const handlePassword = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api.post('/api/auth/password', { identifier: identifier.trim(), password })
      await refresh()
      setShowNotice(true)
    } catch (err) {
      setError(err.status === 401 ? '密碼錯誤' :
               err.status === 429 ? '嘗試次數過多，請稍後再試' : err.message)
    } finally { setBusy(false) }
  }

  return (
    <>
      {showNotice && (
        <NoticeModal onConfirm={() => navigate('/', { replace: true })} />
      )}
      <main className="page" style={{ maxWidth: 440 }}>
        <div className="card stack">
          <div>
            <h1>登入</h1>
            <p className="muted">學生輸入學號即可；老師 / 管理員請接著輸入密碼。</p>
          </div>

          {stage === 'identify' ? (
            <form onSubmit={handleIdentify} className="stack">
              <label className="stack" style={{ gap: 6 }}>
                <span>帳號 / 學號</span>
                <input
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="例如 B11123456"
                  maxLength={32}
                />
              </label>
              {error && <div className="err">{error}</div>}
              <button type="submit" className="primary" disabled={busy || !identifier.trim()}>
                {busy ? '請稍候…' : '下一步'}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePassword} className="stack">
              <div className="muted">{role === 'admin' ? '管理員' : '老師'}：{identifier}</div>
              <label className="stack" style={{ gap: 6 }}>
                <span>密碼</span>
                <input
                  autoFocus
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={128}
                />
              </label>
              {error && <div className="err">{error}</div>}
              <div className="row">
                <button type="button" className="ghost" onClick={() => {
                  setStage('identify'); setPassword(''); setError('')
                }}>返回</button>
                <button type="submit" className="primary" disabled={busy || !password}>
                  {busy ? '請稍候…' : '登入'}
                </button>
              </div>
            </form>
          )}
        </div>

        <footer style={{
          marginTop: 24,
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--color-muted)',
        }}>
          <a
            href="https://github.com/SamWang8891/ita-grading"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-muted)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
            </svg>
            SamWang8891/ita-grading
          </a>
        </footer>
      </main>
    </>
  )
}
