import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, downloadFile } from '../api/client'

export default function TeacherDashboard() {
  const [periods, setPeriods] = useState([])
  const [period, setPeriod] = useState('midterm')
  const [overview, setOverview] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/auth/me').then((me) => {
      setPeriods(me.periods || [])
      const firstOpen = (me.periods || []).find((p) => p.is_open) || (me.periods || [])[0]
      if (firstOpen) setPeriod(firstOpen.code)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    api.get('/api/teacher/overview', { query: { period } }).then((rows) => {
      setOverview(rows); setLoading(false)
    }).catch(() => setLoading(false))
  }, [period])

  const [passwordOpen, setPasswordOpen] = useState(false)
  const [pw, setPw] = useState({ old: '', next: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState(null)

  const submitPassword = async (e) => {
    e.preventDefault()
    setPwMsg(null)
    if (pw.next !== pw.confirm) { setPwMsg({ kind: 'err', text: '兩次新密碼不一致' }); return }
    try {
      await api.post('/api/teacher/password', { old_password: pw.old, new_password: pw.next })
      setPwMsg({ kind: 'ok', text: '已更新密碼' })
      setPw({ old: '', next: '', confirm: '' })
    } catch (err) {
      setPwMsg({ kind: 'err', text: err.status === 401 ? '舊密碼錯誤' : err.message })
    }
  }

  return (
    <main className="page stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>老師 · 評分總覽</h1>
        <div className="row">
          <Link to="/my-records"><button className="ghost">活動紀錄</button></Link>
          <button className="ghost" onClick={() => setPasswordOpen((v) => !v)}>
            {passwordOpen ? '收合密碼' : '修改密碼'}
          </button>
        </div>
      </div>

      {passwordOpen && (
        <form onSubmit={submitPassword} className="card stack" style={{ maxWidth: 420 }}>
          <h3 style={{ margin: 0 }}>修改密碼</h3>
          <input type="password" placeholder="舊密碼" value={pw.old} onChange={(e) => setPw((p) => ({ ...p, old: e.target.value }))} />
          <input type="password" placeholder="新密碼" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
          <input type="password" placeholder="再次輸入新密碼" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
          {pwMsg && <div className={pwMsg.kind === 'err' ? 'err' : 'ok'}>{pwMsg.text}</div>}
          <div><button className="primary" type="submit">儲存</button></div>
        </form>
      )}

      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <label>場次：</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {periods.map((p) => (
                <option key={p.code} value={p.code}>{p.label}{p.is_open ? '（開放中）' : '（關閉）'}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <button onClick={() => downloadFile(`/api/teacher/export.json?period=${period}`)}>下載 JSON</button>
            <button className="primary" onClick={() => downloadFile(`/api/teacher/export.xlsx?period=${period}`)}>下載 Excel</button>
          </div>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>學號</th><th>姓名</th><th>班級</th>
              <th>受評次數</th><th>平均</th><th>中位</th><th>最大</th><th>最小</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={9}>載入中…</td></tr> :
              overview.map((o) => (
                <tr key={o.student_id}>
                  <td>{o.student_id}</td>
                  <td>{o.name}</td>
                  <td>{o.class_name}</td>
                  <td>{o.stats.count}</td>
                  <td>{o.stats.average ?? '—'}</td>
                  <td>{o.stats.median ?? '—'}</td>
                  <td>{o.stats.max ?? '—'}</td>
                  <td>{o.stats.min ?? '—'}</td>
                  <td><Link to={`/teacher/records/${o.student_id}`}><button className="ghost">明細</button></Link></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </main>
  )
}
