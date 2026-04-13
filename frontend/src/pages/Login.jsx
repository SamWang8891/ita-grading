import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useSession } from '../auth/SessionContext.jsx'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [stage, setStage] = useState('identify') // 'identify' | 'password'
  const [role, setRole] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
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
        navigate('/', { replace: true })
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
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.status === 401 ? '密碼錯誤' :
               err.status === 429 ? '嘗試次數過多，請稍後再試' : err.message)
    } finally { setBusy(false) }
  }

  return (
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
    </main>
  )
}
