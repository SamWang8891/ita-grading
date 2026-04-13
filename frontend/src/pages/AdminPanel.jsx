import { useEffect, useState } from 'react'
import { api } from '../api/client'

const TABS = [
  { key: 'students', label: '學生白名單' },
  { key: 'teachers', label: '老師帳號' },
  { key: 'periods',  label: '場次開關' },
  { key: 'activity', label: '活動紀錄' },
]

export default function AdminPanel() {
  const [tab, setTab] = useState('students')
  return (
    <main className="page stack">
      <h1>管理員後台</h1>
      <div className="row tight">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'primary' : 'ghost'}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>
      {tab === 'students' && <StudentsTab />}
      {tab === 'teachers' && <TeachersTab />}
      {tab === 'periods'  && <PeriodsTab />}
      {tab === 'activity' && <ActivityTab />}
    </main>
  )
}

function StudentsTab() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ student_id: '', name: '', class_name: '' })
  const [msg, setMsg] = useState(null)
  const load = () => api.get('/api/admin/students').then(setRows)
  useEffect(() => { load() }, [])

  const add = async (e) => {
    e.preventDefault()
    setMsg(null)
    try {
      await api.post('/api/admin/students', form)
      setForm({ student_id: '', name: '', class_name: '' })
      load()
    } catch (err) {
      setMsg({ kind: 'err', text: err.status === 409 ? '學號已存在' : err.message })
    }
  }

  const edit = async (row) => {
    const name = window.prompt('新姓名', row.name)
    if (name == null) return
    const class_name = window.prompt('新班級', row.class_name)
    if (class_name == null) return
    try {
      await api.patch(`/api/admin/students/${row.student_id}`, { name, class_name })
      load()
    } catch (err) { setMsg({ kind: 'err', text: err.message }) }
  }

  const askDelete = async (row) => {
    const impact = await api.get(`/api/admin/students/${row.student_id}/impact`)
    if (impact.submission_count > 0) {
      setMsg({ kind: 'err', text: `無法刪除：此學號已有 ${impact.submission_count} 筆評分紀錄。` })
      return
    }
    if (!window.confirm(`確定要刪除 ${row.student_id} ${row.name}？`)) return
    try {
      await api.del(`/api/admin/students/${row.student_id}`)
      load()
    } catch (err) {
      setMsg({ kind: 'err', text: err.status === 409 ? '此學號已有評分紀錄，無法刪除' : err.message })
    }
  }

  return (
    <div className="stack">
      <form onSubmit={add} className="card stack">
        <h3 style={{ margin: 0 }}>新增學生</h3>
        <div className="row">
          <input placeholder="學號" maxLength={32}
            value={form.student_id} onChange={(e) => setForm((f) => ({ ...f, student_id: e.target.value }))} />
          <input placeholder="姓名" maxLength={64}
            value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input placeholder="班級" maxLength={64}
            value={form.class_name} onChange={(e) => setForm((f) => ({ ...f, class_name: e.target.value }))} />
          <button className="primary" type="submit">新增</button>
        </div>
        {msg && <div className={msg.kind === 'err' ? 'err' : 'ok'}>{msg.text}</div>}
      </form>

      <div className="card">
        <table>
          <thead><tr><th>學號</th><th>姓名</th><th>班級</th><th>建立時間</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student_id}>
                <td>{r.student_id}</td>
                <td>{r.name}</td>
                <td>{r.class_name}</td>
                <td className="muted">{r.created_at}</td>
                <td className="row tight">
                  <button className="ghost" onClick={() => edit(r)}>編輯</button>
                  <button className="danger" onClick={() => askDelete(r)}>刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TeachersTab() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ username: '', display_name: '', initial_password: '' })
  const [msg, setMsg] = useState(null)
  const load = () => api.get('/api/admin/teachers').then(setRows)
  useEffect(() => { load() }, [])

  const add = async (e) => {
    e.preventDefault()
    setMsg(null)
    try {
      await api.post('/api/admin/teachers', form)
      setForm({ username: '', display_name: '', initial_password: '' })
      load()
    } catch (err) {
      setMsg({ kind: 'err', text: err.status === 409 ? '帳號已存在' : err.message })
    }
  }

  const resetPw = async (row) => {
    const np = window.prompt(`為 ${row.username} 設定新密碼`)
    if (!np) return
    try {
      await api.post(`/api/admin/teachers/${row.username}/password`, { new_password: np })
      setMsg({ kind: 'ok', text: '已重設密碼' })
    } catch (err) { setMsg({ kind: 'err', text: err.message }) }
  }

  const del = async (row) => {
    if (!window.confirm(`刪除老師 ${row.username}？`)) return
    try { await api.del(`/api/admin/teachers/${row.username}`); load() }
    catch (err) { setMsg({ kind: 'err', text: err.message }) }
  }

  return (
    <div className="stack">
      <form onSubmit={add} className="card stack">
        <h3 style={{ margin: 0 }}>新增老師</h3>
        <div className="row">
          <input placeholder="帳號" maxLength={32}
            value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          <input placeholder="顯示姓名" maxLength={64}
            value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
          <input placeholder="初始密碼" type="password" minLength={4} maxLength={128}
            value={form.initial_password} onChange={(e) => setForm((f) => ({ ...f, initial_password: e.target.value }))} />
          <button className="primary" type="submit">新增</button>
        </div>
        {msg && <div className={msg.kind === 'err' ? 'err' : 'ok'}>{msg.text}</div>}
      </form>

      <div className="card">
        <table>
          <thead><tr><th>帳號</th><th>顯示姓名</th><th>建立時間</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.username}>
                <td>{r.username}</td>
                <td>{r.display_name}</td>
                <td className="muted">{r.created_at}</td>
                <td className="row tight">
                  <button className="ghost" onClick={() => resetPw(r)}>重設密碼</button>
                  <button className="danger" onClick={() => del(r)}>刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PeriodsTab() {
  const [rows, setRows] = useState([])
  const load = () => api.get('/api/admin/periods').then(setRows)
  useEffect(() => { load() }, [])

  const toggle = async (code, next) => {
    await api.patch(`/api/admin/periods/${code}`, { is_open: next })
    load()
  }

  return (
    <div className="card">
      <table>
        <thead><tr><th>代碼</th><th>名稱</th><th>狀態</th><th></th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.code}>
              <td><code>{p.code}</code></td>
              <td>{p.label}</td>
              <td>{p.is_open ? <span className="tag open">開放中</span> : <span className="tag closed">關閉</span>}</td>
              <td>
                {p.is_open
                  ? <button className="danger" onClick={() => toggle(p.code, false)}>關閉</button>
                  : <button className="primary" onClick={() => toggle(p.code, true)}>開啟</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ActivityTab() {
  const [filters, setFilters] = useState({ event_type: '', actor_id: '', from: '', to: '' })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const rows = await api.get('/api/admin/activity', { query: { ...filters, limit: 500 } })
      setRows(rows)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="stack">
      <div className="card row">
        <input placeholder="event_type" value={filters.event_type}
          onChange={(e) => setFilters((f) => ({ ...f, event_type: e.target.value }))} />
        <input placeholder="actor_id" value={filters.actor_id}
          onChange={(e) => setFilters((f) => ({ ...f, actor_id: e.target.value }))} />
        <input placeholder="from (YYYY-MM-DD HH:MM:SS)" value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        <input placeholder="to" value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        <button className="primary" onClick={load}>查詢</button>
      </div>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr><th>時間</th><th>事件</th><th>角色</th><th>對象</th><th>IP</th><th>UA</th><th>細節</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7}>載入中…</td></tr> : rows.map((r) => (
              <tr key={r.id}>
                <td>{r.ts}</td>
                <td>{r.event_type}</td>
                <td>{r.actor_role}</td>
                <td>{r.actor_id ?? '—'}</td>
                <td>{r.ip}</td>
                <td className="muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ua}</td>
                <td><pre className="code-scroll">{JSON.stringify(r.detail)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
