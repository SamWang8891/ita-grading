import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useSession } from '../auth/SessionContext.jsx'

export default function StudentHome() {
  const { session } = useSession()
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/student/periods').then((p) => {
      setPeriods(p); setLoading(false)
    })
  }, [])

  return (
    <main className="page stack">
      <div>
        <h1>歡迎，{session?.name}</h1>
        <p className="muted">學號 {session?.actor_id}，{session?.class_name} 班</p>
      </div>

      <section className="stack">
        <h2>評分場次</h2>
        <div className="row" style={{ alignItems: 'stretch' }}>
          {loading ? <div className="card">載入中…</div> : periods.map((p) => (
            <div key={p.code} className="card stack" style={{ flex: '1 1 260px' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>{p.label}</h3>
                <span className={`tag ${p.is_open ? 'open' : 'closed'}`}>
                  {p.is_open ? '開放中' : '已關閉'}
                </span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {p.is_open
                  ? '可以開始評分或修改已評分的項目。'
                  : '場次已關閉，僅能檢視歷史紀錄。'}
              </p>
              <div className="row">
                <Link to={`/evaluate/${p.code}`}><button className="primary">進入評分頁</button></Link>
                <Link to={`/evaluate/${p.code}/overview`}><button>評分總覽</button></Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Link to="/my-records"><button>我的活動紀錄</button></Link>
      </section>
    </main>
  )
}
