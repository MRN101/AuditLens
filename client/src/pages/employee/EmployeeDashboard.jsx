import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { TrendingUp, Shield, FileCheck, AlertTriangle, Plane, Home } from 'lucide-react'
import { analyticsAPI, budgetAPI } from '../../services/api'
import { formatBase, BASE_SYMBOL } from '../../utils/currencyUtils'
import useAuthStore from '../../store/authStore'

const PALETTE = ['#5fa08e', '#5fb870', '#d4564e', '#5b8dd4', '#d4a843', '#78c4af']
const tooltipStyle = { background: '#152a24', border: '1px solid #264035', borderRadius: 8, fontSize: '0.82rem', color: '#d5ede4' }

function AnimatedNumber({ value, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const target = Number(value) || 0
    if (target === 0) { setDisplay(0); return }
    let start = 0
    const duration = 700
    const step = (ts) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      setDisplay(Math.round(progress * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [value])
  return <>{prefix}{display.toLocaleString('en-IN')}{suffix}</>
}

export default function EmployeeDashboard() {
  const { user } = useAuthStore()
  const [data, setData] = useState(null)
  const [budget, setBudget] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [analyticsRes, budgetRes] = await Promise.all([
          analyticsAPI.my(),
          budgetAPI.getMy(),
        ])
        setData(analyticsRes.data)
        setBudget(budgetRes.data)
      } catch { /* handled */ }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div>
      <div className="page-header"><h2>Dashboard</h2><p>Loading your insights...</p></div>
      <div className="card-grid mb-6">
        {[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-card" />)}
      </div>
    </div>
  )

  const cs = user?.complianceScore ?? data?.complianceScore ?? 0
  const categoryData = (data?.categoryBreakdown || []).map(c => ({
    name: c._id || 'Other', value: c.count, amount: c.totalAmount || 0,
  }))
  const tripData = (data?.tripTypeBreakdown || []).map(t => ({
    name: t._id === 'international' ? 'International' : 'Domestic',
    count: t.count, amount: Math.round(t.totalAmount || 0),
  }))
  const totalSpent = budget?.summary?.totalSpent || 0
  const approvedRate = data?.totalClaims > 0 ? Math.round((data.approvedClaims / data.totalClaims) * 100) : 100

  return (
    <div>
      <div className="page-header">
        <h2>Welcome back, {user?.name?.split(' ')[0]} 👋</h2>
        <p>Here's your expense overview and compliance status</p>
      </div>

      {/* Top Stats */}
      <div className="card-grid mb-6">
        <div className="stat-card">
          <div className="stat-card__label"><Shield size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Compliance Score</div>
          <div className="stat-card__value" style={{ color: cs >= 80 ? 'var(--green)' : cs >= 50 ? 'var(--amber)' : 'var(--red)' }}>
            <AnimatedNumber value={cs} suffix="%" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label"><FileCheck size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Total Claims</div>
          <div className="stat-card__value"><AnimatedNumber value={data?.totalClaims || 0} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label"><TrendingUp size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Approval Rate</div>
          <div className="stat-card__value" style={{ color: approvedRate >= 70 ? 'var(--green)' : 'var(--amber)' }}>
            <AnimatedNumber value={approvedRate} suffix="%" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label"><AlertTriangle size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> This Month</div>
          <div className="stat-card__value"><AnimatedNumber value={totalSpent} prefix={BASE_SYMBOL} /></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Spending by category */}
        <div className="card">
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Spending by Category</div>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                  {categoryData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name, props) => [`${v} claims (${formatBase(props.payload.amount)})`, name]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: '40px 0' }}><p>No claims yet</p></div>
          )}
          <div className="flex gap-3" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {categoryData.map((c, i) => (
              <div key={c.name} className="flex items-center gap-2 text-xs">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE[i % PALETTE.length] }} />
                {c.name}
              </div>
            ))}
          </div>
        </div>

        {/* Trip type breakdown */}
        <div className="card">
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Trip Type Breakdown</div>
          {tripData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={tripData} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2e27" />
                <XAxis dataKey="name" tick={{ fill: '#4d8770', fontSize: 11 }} axisLine={{ stroke: '#1a2e27' }} />
                <YAxis tick={{ fill: '#4d8770', fontSize: 11 }} axisLine={{ stroke: '#1a2e27' }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatBase(v), 'Amount']} />
                <Bar dataKey="amount" fill="#5fa08e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <div className="flex gap-3">
                <Home size={20} style={{ color: 'var(--text-muted)' }} />
                <Plane size={20} style={{ color: 'var(--text-muted)' }} />
              </div>
              <p>No trip data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Budget Progress */}
      {budget && (
        <div className="card">
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Monthly Budget ({budget.summary?.month})</div>
            <div className="text-xs text-muted">{budget.daysRemaining} days remaining</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {(budget.budget || []).map(b => (
              <div key={b.category} style={{
                padding: '12px 14px', borderRadius: 'var(--radius-md)',
                background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)',
              }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <span className="text-xs" style={{ fontWeight: 600 }}>{b.category}</span>
                  <span className="text-xs text-muted">{b.percentage}%</span>
                </div>
                <div style={{
                  height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 3, transition: 'width 0.8s ease',
                    width: `${Math.min(100, b.percentage)}%`,
                    background: b.status === 'exceeded' ? 'var(--red)' : b.status === 'warning' ? 'var(--amber)' : 'var(--green)',
                  }} />
                </div>
                <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
                  <span className="text-xs text-muted">{formatBase(b.spent)}</span>
                  <span className="text-xs text-muted">/ {formatBase(b.limit)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
