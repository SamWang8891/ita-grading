import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useSession } from '../auth/SessionContext.jsx'

export default function MyRecords() {
  const { session } = useSession()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = session?.role === 'teacher' ? '/api/teacher/activity' : '/api/student/activity'
    api.get(url).then((r) => { setRows(r); setLoading(false) })
  }, [session?.role])

  const back = session?.role === 'teacher' ? '/teacher' : '/me'

  return (
    <main className="page stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>我的活動紀錄</h1>
        <Link to={back}><button className="ghost">回首頁</button></Link>
      </div>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>時間</th><th>事件</th><th>IP</th><th>UA</th><th>細節</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5}>載入中…</td></tr> : rows.map((r) => (
              <tr key={r.id}>
                <td>{r.ts}</td>
                <td>{r.event_type}</td>
                <td>{r.ip}</td>
                <td className="muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ua}</td>
                <td><pre className="code-scroll">{JSON.stringify(r.detail)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
