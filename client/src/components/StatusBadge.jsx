export default function StatusBadge({ status }) {
  const s = status || 'pending'
  return (
    <span className={`badge badge--${s}`}>
      <span className="badge__dot" />
      {s}
    </span>
  )
}
