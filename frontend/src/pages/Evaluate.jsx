import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, downloadFile } from '../api/client'
import NumberPad from '../components/NumberPad.jsx'
import ScoreInput, { shouldShowNumberPad } from '../components/ScoreInput.jsx'
import TargetDropdown from '../components/TargetDropdown.jsx'

const FIELDS = [
  { key: 'topic',        label: '主題掌握',       max: 30 },
  { key: 'content',      label: '內容豐富',       max: 30 },
  { key: 'narrative',    label: '敘事技巧',       max: 20 },
  { key: 'presentation', label: '簡報技巧與互動', max: 10 },
  { key: 'teamwork',     label: '團隊表現',       max: 10 },
]

const EMPTY_SCORES = { topic: null, content: null, narrative: null, presentation: null, teamwork: null }

export default function Evaluate() {
  const { period } = useParams()

  const [periodOpen, setPeriodOpen] = useState(true)
  const [targets, setTargets] = useState([])
  const [targetId, setTargetId] = useState('')
  const [scores, setScores] = useState(EMPTY_SCORES)
  const [comment, setComment] = useState('')
  const [selfNote, setSelfNote] = useState('')
  const [latestTotal, setLatestTotal] = useState(null)
  const [latestSubmittedAt, setLatestSubmittedAt] = useState(null)
  const [versions, setVersions] = useState([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const showPad = useMemo(() => shouldShowNumberPad(), [])
  const inputRefs = useRef({})
  const [focusedKey, setFocusedKey] = useState(null)

  useEffect(() => {
    api.get('/api/student/periods').then((rows) => {
      const match = rows.find((r) => r.code === period)
      setPeriodOpen(!!match && match.is_open === 1)
    })
  }, [period])

  const reloadTargets = useCallback(async () => {
    const rows = await api.get('/api/student/targets', { query: { period } })
    setTargets(rows)
  }, [period])

  useEffect(() => { reloadTargets() }, [reloadTargets])

  const fetchTarget = useCallback(async (tid) => {
    if (!tid) {
      setScores(EMPTY_SCORES); setComment(''); setSelfNote('')
      setLatestTotal(null); setLatestSubmittedAt(null); setVersions([])
      return
    }
    const detail = await api.get(`/api/student/submissions/${period}/${tid}/detail`)

    const latest = detail.latest
    const baseScores = latest
      ? { topic: latest.score_topic, content: latest.score_content, narrative: latest.score_narrative,
          presentation: latest.score_presentation, teamwork: latest.score_teamwork }
      : EMPTY_SCORES
    setLatestTotal(latest?.total ?? null)
    setLatestSubmittedAt(latest?.submitted_at ?? null)
    setVersions(detail.versions ?? [])

    setScores(baseScores)
    setComment(latest?.comment ?? '')
    setSelfNote(latest?.self_note ?? '')
    setNotice(null)
  }, [period])

  useEffect(() => { fetchTarget(targetId) }, [targetId, fetchTarget])

  const total = useMemo(
    () => Object.values(scores).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0),
    [scores],
  )
  const allFilled = Object.values(scores).every((v) => typeof v === 'number')

  const onScoreChange = (field) => (v) => setScores((s) => ({ ...s, [field]: v }))

  const avoidEls = useMemo(() => Object.values(inputRefs.current).filter(Boolean), [focusedKey])
  const focusedEl = focusedKey ? inputRefs.current[focusedKey] : null

  const handleKeyPad = (k) => {
    if (!focusedKey) return
    const current = inputRefs.current[focusedKey]
    if (!current) return
    const field = FIELDS.find((f) => f.key === focusedKey)
    if (!field) return
    const prev = scores[focusedKey]
    const prevStr = prev == null ? '' : String(prev)
    let next
    if (k === 'back') next = prevStr.slice(0, -1)
    else if (k === 'del') next = ''
    else next = prevStr + k
    if (next === '') { onScoreChange(focusedKey)(null); return }
    const parsed = parseInt(next, 10)
    if (Number.isNaN(parsed)) return
    const clamped = Math.min(parsed, field.max)
    onScoreChange(focusedKey)(clamped)
  }

  const handleSubmit = async () => {
    if (!targetId || !allFilled || !periodOpen) return
    setBusy(true); setNotice(null)
    try {
      await api.post('/api/student/submissions', {
        period,
        target_student_id: targetId,
        scores,
        comment,
        self_note: selfNote,
      })
      setNotice({ kind: 'ok', text: '已送出！此次送出為獨立新版本，先前版本保留於歷史紀錄。' })
      await reloadTargets()
      await fetchTarget(targetId)
    } catch (err) {
      const msg = err.status === 409 && err.detail === 'period_closed'
        ? '此場次已關閉，無法送出。'
        : err.message
      setNotice({ kind: 'err', text: msg })
    } finally { setBusy(false) }
  }

  const handleDownload = () => {
    if (!targetId) return
    downloadFile(`/api/student/submissions/${period}/${targetId}.json`)
  }

  const handleUpload = async (file) => {
    if (!file || !targetId) return
    setNotice(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (parsed.period !== period) throw new Error('期別與目前頁面不符')
      if (!Array.isArray(parsed.entries) || parsed.entries.length !== 1) throw new Error('單一對象上傳需 entries.length === 1')
      const entry = parsed.entries[0]
      if (entry.target_student_id !== targetId) throw new Error('目標學號與此頁不符')
      const s = entry.scores || {}
      for (const f of FIELDS) {
        if (typeof s[f.key] !== 'number' || s[f.key] < 0 || s[f.key] > f.max) {
          throw new Error(`${f.label} 超過範圍`)
        }
      }
      setScores({
        topic: s.topic, content: s.content, narrative: s.narrative,
        presentation: s.presentation, teamwork: s.teamwork,
      })
      if (typeof entry.comment === 'string') setComment(entry.comment)
      setNotice({ kind: 'info', text: '已匯入 JSON（尚未送出）。確認無誤後按「送出評分」。' })
    } catch (err) {
      setNotice({ kind: 'err', text: `匯入失敗：${err.message}` })
    }
  }

  const periodLabel = period === 'midterm' ? '期中報告' : period === 'final' ? '期末報告' : period

  return (
    <main className="page stack evaluate-page">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>{periodLabel} · 評分</h1>
          <p className="muted">選擇對象後，若之前已評分會自動帶入（可修改）。</p>
        </div>
        <Link to="/me"><button className="ghost">回首頁</button></Link>
      </div>

      {!periodOpen && (
        <div className="card warn">此場次目前關閉，僅能瀏覽。送出按鈕已停用。</div>
      )}

      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <TargetDropdown
            targets={targets}
            value={targetId}
            onChange={setTargetId}
          />
          <Link to={`/evaluate/${period}/overview`}><button className="ghost">總覽 / 批次上傳</button></Link>
        </div>
        {latestTotal != null && (
          <div className="muted">先前最新提交 · 總分 {latestTotal} · {latestSubmittedAt}</div>
        )}
      </div>

      {targetId && (
        <div className="evaluate-grid">
          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>評分</h3>
              {periodOpen && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    const full = {}
                    for (const f of FIELDS) full[f.key] = f.max
                    setScores(full)
                  }}
                >
                  快速滿分評分
                </button>
              )}
            </div>
            <div className="score-rows">
              {FIELDS.map((f) => (
                <div className="score-row" key={f.key}>
                  <label>{f.label}（總分{f.max}）</label>
                  <ScoreInput
                    ref={(el) => { inputRefs.current[f.key] = el }}
                    value={scores[f.key]}
                    max={f.max}
                    disabled={!periodOpen}
                    onChange={onScoreChange(f.key)}
                    onFocus={() => setFocusedKey(f.key)}
                    aria-label={f.label}
                  />
                </div>
              ))}
              <div className="score-row total-row">
                <strong>總分（滿分100）</strong>
                <strong data-testid="total">{total}</strong>
              </div>
            </div>

            <label className="stack" style={{ gap: 4 }}>
              <span>建議 / 留言（對方會看到）</span>
              <textarea
                rows={3}
                maxLength={4000}
                value={comment}
                disabled={!periodOpen}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span>我的備註（只有你看得到）</span>
              <textarea
                rows={2}
                maxLength={4000}
                value={selfNote}
                disabled={!periodOpen}
                onChange={(e) => setSelfNote(e.target.value)}
              />
            </label>

            <div className="row">
              <button type="button" onClick={handleDownload} disabled={!targetId}>下載 JSON</button>
              <label className="button-like">
                <input type="file" accept="application/json" style={{ display: 'none' }}
                  onChange={(e) => handleUpload(e.target.files?.[0])} />
                上傳 JSON
              </label>
              <button
                type="button"
                className="primary"
                disabled={!allFilled || !periodOpen || busy}
                onClick={handleSubmit}
              >
                {busy ? '送出中…' : '送出評分'}
              </button>
            </div>
            {notice && (
              <div className={notice.kind === 'err' ? 'err' : notice.kind === 'ok' ? 'ok' : 'muted'}>
                {notice.text}
              </div>
            )}
          </div>

          <div className="card stack">
            <h3>歷史版本</h3>
            {versions.length === 0 ? (
              <div className="muted">尚未提交過此對象。</div>
            ) : (
              <ol className="versions">
                {versions.map((v, idx) => {
                  const total = v.score_topic + v.score_content + v.score_narrative
                    + v.score_presentation + v.score_teamwork
                  return (
                    <li key={v.id}>
                      <div><strong>v{versions.length - idx}</strong> 總分 {total} · {v.submitted_at}</div>
                      <div className="muted">
                        主題 {v.score_topic} / 內容 {v.score_content} / 敘事 {v.score_narrative}
                        / 簡報 {v.score_presentation} / 團隊 {v.score_teamwork}
                      </div>
                      {v.comment && <div>「{v.comment}」</div>}
                      {v.self_note && <div className="muted">備註：{v.self_note}</div>}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      )}

      {showPad && focusedEl && (
        <NumberPad
          targetEl={focusedEl}
          avoidEls={avoidEls}
          onKey={handleKeyPad}
          onClose={() => setFocusedKey(null)}
        />
      )}
    </main>
  )
}
