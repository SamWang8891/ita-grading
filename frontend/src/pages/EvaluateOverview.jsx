import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, downloadFile } from '../api/client'

export default function EvaluateOverview() {
  const { period } = useParams()
  const [targets, setTargets] = useState([])
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    api.get('/api/student/targets', { query: { period } }).then(setTargets)
  }
  useEffect(load, [period])

  const handleUpload = async (file) => {
    if (!file) return
    setReport(null); setBusy(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const res = await api.post('/api/student/submissions/batch', parsed)
      setReport(res)
      load()
    } catch (err) {
      setReport({ error: err.message, failed: [], created: [] })
    } finally { setBusy(false) }
  }

  const periodLabel = period === 'midterm' ? '期中報告' : period === 'final' ? '期末報告' : period

  return (
    <main className="page stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>{periodLabel} · 總覽</h1>
          <p className="muted">這裡顯示所有可評對象與你是否已評分。</p>
        </div>
        <Link to="/me"><button className="ghost">回首頁</button></Link>
      </div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>批次工具</h3>
          <div className="row">
            <button onClick={() => downloadFile(`/api/student/submissions/${period}.json`)}>下載目前全部 JSON</button>
            <label className="button-like">
              <input type="file" accept="application/json" style={{ display: 'none' }}
                onChange={(e) => handleUpload(e.target.files?.[0])} />
              {busy ? '上傳中…' : '批次上傳 JSON'}
            </label>
          </div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          上傳檔案格式同下載：<code>{'{ period, entries: [{target_student_id, scores, comment}] }'}</code>
        </p>
        {report && (
          <div className="stack">
            {report.error && <div className="err">{report.error}</div>}
            {Array.isArray(report.created) && (
              <div className="ok">成功建立 {report.created.length} 筆。</div>
            )}
            {Array.isArray(report.failed) && report.failed.length > 0 && (
              <table>
                <thead><tr><th>#</th><th>對象</th><th>原因</th></tr></thead>
                <tbody>
                  {report.failed.map((f) => (
                    <tr key={f.index}><td>{f.index}</td><td>{f.target_student_id}</td><td>{f.error}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>學號</th><th>姓名</th><th>班級</th><th>狀態</th><th>目前總分</th><th></th></tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.student_id}>
                <td>{t.student_id}</td>
                <td>{t.name}</td>
                <td>{t.class_name}</td>
                <td>{t.evaluated ? <span className="tag evaluated">✓ 已評分</span> : <span className="muted">未評分</span>}</td>
                <td>{t.total ?? '—'}</td>
                <td><Link to={`/evaluate/${period}`}><button className="ghost">前往評分</button></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
