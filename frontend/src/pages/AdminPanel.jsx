import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
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
      <ImportStudents onDone={load} />

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

function ImportStudents({ onDone }) {
  const [filename, setFilename] = useState('')
  const [sheets, setSheets] = useState([])      // [{ name, rows: string[][] }]
  const [sheetIdx, setSheetIdx] = useState(0)
  const [headerRow, setHeaderRow] = useState(1) // 1-indexed
  const [cols, setCols] = useState({ student_id: -1, name: -1, class_name: -1 })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const currentSheet = sheets[sheetIdx]
  const maxCols = useMemo(
    () => currentSheet ? Math.max(0, ...currentSheet.rows.map((r) => r.length)) : 0,
    [currentSheet],
  )
  const headerCells = useMemo(() => {
    if (!currentSheet) return []
    const row = currentSheet.rows[headerRow - 1] || []
    return Array.from({ length: maxCols }, (_, i) =>
      (row[i] ?? '').toString().trim() || `第 ${i + 1} 欄`
    )
  }, [currentSheet, headerRow, maxCols])

  const dataRows = useMemo(() => {
    if (!currentSheet) return []
    return currentSheet.rows.slice(headerRow)
  }, [currentSheet, headerRow])

  const mapped = useMemo(() => {
    if (cols.student_id < 0 || cols.name < 0 || cols.class_name < 0) return []
    return dataRows
      .map((r) => ({
        student_id: (r[cols.student_id] ?? '').toString().trim(),
        name: (r[cols.name] ?? '').toString().trim(),
        class_name: (r[cols.class_name] ?? '').toString().trim(),
      }))
      .filter((s) => s.student_id)
  }, [dataRows, cols])

  const pickFile = async (file) => {
    setMsg(null)
    if (!file) return
    setFilename(file.name)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const next = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }),
      }))
      setSheets(next)
      setSheetIdx(0)
      setHeaderRow(1)
      setCols({ student_id: -1, name: -1, class_name: -1 })
    } catch (err) {
      setMsg({ kind: 'err', text: `讀檔失敗：${err.message}` })
    }
  }

  const tryAuto = () => {
    // auto-detect by header keywords
    const hit = (keywords) => headerCells.findIndex(
      (h) => keywords.some((k) => h.toString().includes(k))
    )
    const sid = hit(['學號', 'student', 'id', 'ID'])
    const nm = hit(['姓名', 'name', '名字'])
    const cls = hit(['班級', 'class', '系級'])
    setCols({
      student_id: sid >= 0 ? sid : cols.student_id,
      name: nm >= 0 ? nm : cols.name,
      class_name: cls >= 0 ? cls : cols.class_name,
    })
  }

  const handleImport = async () => {
    if (!mapped.length) return
    setBusy(true); setMsg(null)
    try {
      const r = await api.post('/api/admin/students/import', { students: mapped })
      setMsg({
        kind: 'ok',
        text: `匯入 ${r.inserted} 筆，略過 ${r.skipped} 筆${r.skipped ? `（已存在：${r.skipped_ids.slice(0, 10).join(', ')}${r.skipped_ids.length > 10 ? '…' : ''}）` : ''}。`,
      })
      onDone?.()
    } catch (err) {
      setMsg({ kind: 'err', text: err.message })
    } finally { setBusy(false) }
  }

  const colOptions = [
    <option key="-1" value={-1}>— 選擇欄 —</option>,
    ...headerCells.map((h, i) => <option key={i} value={i}>{`${i + 1}. ${h}`}</option>),
  ]

  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>從 Excel 批次匯入</h3>
      <p className="muted" style={{ margin: 0 }}>
        支援 .xls / .xlsx。重複學號會自動略過，不會覆蓋。
      </p>
      <div className="row">
        <label className="button-like">
          <input type="file" accept=".xls,.xlsx" style={{ display: 'none' }}
            onChange={(e) => pickFile(e.target.files?.[0])} />
          選擇檔案
        </label>
        {filename && <span className="muted">{filename}</span>}
      </div>

      {currentSheet && (
        <>
          <div className="row">
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted">工作表</span>
              <select value={sheetIdx} onChange={(e) => setSheetIdx(Number(e.target.value))}>
                {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
              </select>
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted">標題在第幾列</span>
              <input type="number" min={1} max={20} style={{ width: 80 }}
                value={headerRow}
                onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <button type="button" className="ghost" onClick={tryAuto} style={{ alignSelf: 'end' }}>
              自動對應欄位
            </button>
          </div>

          <div className="row">
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted">學號欄</span>
              <select value={cols.student_id}
                onChange={(e) => setCols((c) => ({ ...c, student_id: Number(e.target.value) }))}>
                {colOptions}
              </select>
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted">姓名欄</span>
              <select value={cols.name}
                onChange={(e) => setCols((c) => ({ ...c, name: Number(e.target.value) }))}>
                {colOptions}
              </select>
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted">班級欄</span>
              <select value={cols.class_name}
                onChange={(e) => setCols((c) => ({ ...c, class_name: Number(e.target.value) }))}>
                {colOptions}
              </select>
            </label>
          </div>

          {mapped.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>預覽（前 5 筆 / 共 {mapped.length} 筆）</th></tr>
                  <tr><th>學號</th><th>姓名</th><th>班級</th></tr>
                </thead>
                <tbody>
                  {mapped.slice(0, 5).map((s, i) => (
                    <tr key={i}>
                      <td>{s.student_id}</td>
                      <td>{s.name}</td>
                      <td>{s.class_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="row">
            <button className="primary" onClick={handleImport}
              disabled={busy || !mapped.length}>
              {busy ? '匯入中…' : `匯入 ${mapped.length} 筆`}
            </button>
          </div>
        </>
      )}

      {msg && <div className={msg.kind === 'err' ? 'err' : 'ok'}>{msg.text}</div>}
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
