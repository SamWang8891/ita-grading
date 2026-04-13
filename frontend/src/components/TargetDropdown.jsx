export default function TargetDropdown({ value, onChange, targets, disabled }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{ minWidth: 280 }}
    >
      <option value="">— 請選擇評分對象 —</option>
      {targets.map((t) => {
        const mark = t.evaluated ? '✓' : ''
        const tail = t.evaluated && t.total != null ? `（目前 ${t.total}）` : ''
        return (
          <option key={t.student_id} value={t.student_id}>
            {mark} {t.student_id} {t.name} · {t.class_name}{tail}
          </option>
        )
      })}
    </select>
  )
}
