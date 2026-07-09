interface Props {
  label: string
  value: string
  note?: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}

export function StatCard({ label, value, note, tone = 'neutral' }: Props) {
  return (
    <div className={`stat-tile ${tone === 'neutral' ? '' : tone}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {note && <div className="note">{note}</div>}
    </div>
  )
}
