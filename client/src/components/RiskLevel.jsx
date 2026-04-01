export default function RiskLevel({ level }) {
  const l = level || 'low'
  return (
    <span className={`risk risk--${l}`}>
      <span className="risk__bar">
        <span /><span /><span />
      </span>
      {l}
    </span>
  )
}
