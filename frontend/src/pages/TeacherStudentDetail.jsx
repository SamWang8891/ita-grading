import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'

export default function TeacherStudentDetail() {
  const { studentId } = useParams()
  const [search, setSearch] = useSearchParams()
  const period = search.get('period') || 'midterm'
  const [periods, setPeriods] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/auth/me').then((me) => setPeriods(me.periods || []))
  }, [])

  useEffect(() => {
    setLoading(true)
    api.get(`/api/teacher/student/${studentId}`, { query: { period } }).then((d) => {
      setData(d); setLoading(false)
    }).catch((err) => { setData({ error: err.message }); setLoading(false) })
  }, [studentId, period])

  return (
    <main className="page stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>{data?.student ? `${data.student.name}（${data.student.student_id}）` : studentId}</h1>
          <p className="muted">{data?.student?.class_name}</p>
        </div>
        <Link to="/teacher"><button className="ghost">返回</button></Link>
      </div>

      <div className="row">
        <label>場次：</label>
        <select value={period} onChange={(e) => setSearch({ period: e.target.value })}>
          {periods.map((p) => (
            <option key={p.code} value={p.code}>{p.label}</option>
          ))}
        </select>
      </div>

      {loading ? <div className="card">載入中…</div> : data?.error ? (
        <div className="card err">{data.error}</div>
      ) : (
        <>
          <section className="card stack">
            <h3>此同學收到的評分（最新版本）</h3>
            <table>
              <thead>
                <tr>
                  <th>評分者</th><th>班級</th>
                  <th>主題</th><th>內容</th><th>敘事</th><th>簡報</th><th>團隊</th>
                  <th>總分</th><th>建議 / 留言</th><th>時間</th>
                </tr>
              </thead>
              <tbody>
                {data.received.length === 0 ? (
                  <tr><td colSpan={10} className="muted">沒有評分紀錄。</td></tr>
                ) : data.received.map((r) => (
                  <tr key={r.id}>
                    <td>{r.grader_name}<div className="muted">{r.grader_student_id}</div></td>
                    <td>{r.grader_class}</td>
                    <td>{r.score_topic}</td><td>{r.score_content}</td><td>{r.score_narrative}</td>
                    <td>{r.score_presentation}</td><td>{r.score_teamwork}</td>
                    <td><strong>{r.total}</strong></td>
                    <td>{r.comment}</td>
                    <td className="muted">{r.submitted_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card stack">
            <h3>此同學送出的評分（最新版本）</h3>
            <table>
              <thead>
                <tr>
                  <th>對象</th><th>班級</th>
                  <th>主題</th><th>內容</th><th>敘事</th><th>簡報</th><th>團隊</th>
                  <th>總分</th><th>建議 / 留言</th><th>時間</th>
                </tr>
              </thead>
              <tbody>
                {data.given.length === 0 ? (
                  <tr><td colSpan={10} className="muted">尚未評過任何對象。</td></tr>
                ) : data.given.map((r) => (
                  <tr key={r.id}>
                    <td>{r.target_name}<div className="muted">{r.target_student_id}</div></td>
                    <td>{r.target_class}</td>
                    <td>{r.score_topic}</td><td>{r.score_content}</td><td>{r.score_narrative}</td>
                    <td>{r.score_presentation}</td><td>{r.score_teamwork}</td>
                    <td><strong>{r.total}</strong></td>
                    <td>{r.comment}</td>
                    <td className="muted">{r.submitted_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  )
}
