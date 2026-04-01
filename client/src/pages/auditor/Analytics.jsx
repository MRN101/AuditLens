import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts'
import { TrendingUp, DollarSign, FileCheck, AlertTriangle, Clock, Users } from 'lucide-react'
import { analyticsAPI, auditorAPI } from '../../services/api'

const PALETTE = ['#5fa08e', '#5fb870', '#d4564e', '#5b8dd4', '#d4a843', '#78c4af']

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
  return <>{prefix}{display.toLocaleString()}{suffix}</>
}

export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('30')
  const [offenders, setOffenders] = useState([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [overview, offenderRes] = await Promise.all([
          analyticsAPI.overview({ range }),
          analyticsAPI.topOffenders().catch(() => ({ data: [] })),
        ])
        setData(overview.data)
        setOffenders(offenderRes.data || [])
      } catch { /* interceptor */ }
      setLoading(false)
    }
    load()
  }, [range])

  if (loading) return (
    <div>
      <div className="page-header"><h2>Analytics</h2><p>Loading insights...</p></div>
      <div className="card-grid mb-6">
        {[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-card" />)}
      </div>
    </div>
  )
  if (!data) return <div className="empty-state"><p>No data available yet</p></div>

  const statusData = Object.entries(data.byStatus || {}).map(([name, value]) => ({ name, value }))
  const categoryData = (data.byCategory || []).map((c) => ({ name: c._id || 'Other', claims: c.count, spend: Math.round(c.totalAmount || 0) }))
  const trendData = (data.monthlyTrend || []).map((t) => ({ date: t._id.slice(5), claims: t.count, spend: Math.round(t.amount || 0) }))
  const total = data.totalClaims || 0
  const approvedRate = total > 0 ? Math.round(((data.byStatus?.approved || 0) / total) * 100) : 0

  const tooltipStyle = {
    background: '#152a24', border: '1px solid #264035',
    borderRadius: 8, fontSize: '0.82rem', color: '#d5ede4',
  }

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h2>Analytics</h2>
          <p>Spending patterns, compliance rates, and trend analysis</p>
        </div>
        <div className="flex gap-2">
          {[{ l: '7d', v: '7' }, { l: '30d', v: '30' }, { l: '90d', v: '90' }, { l: 'All', v: 'all' }].map(r => (
            <button
              key={r.v}
              className={`btn btn--sm ${range === r.v ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setRange(r.v)}
            >
              {r.l}
            </button>
          ))}
        </div>
      </div>

      {/* Top stats */}
      <div className="card-grid mb-6">
        <div className="stat-card">
          <div className="stat-card__label"><FileCheck size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Total Claims</div>
          <div className="stat-card__value"><AnimatedNumber value={total} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label"><DollarSign size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Total Spend</div>
          <div className="stat-card__value"><AnimatedNumber value={data.totalSpendUSD || 0} prefix="$" /></div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label"><TrendingUp size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Approval Rate</div>
          <div className="stat-card__value" style={{ color: approvedRate >= 70 ? 'var(--green)' : 'var(--amber)' }}>
            <AnimatedNumber value={approvedRate} suffix="%" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label"><Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Avg Processing</div>
          <div className="stat-card__value">
            <AnimatedNumber value={Math.round((data.avgProcessingMs || 0) / 1000)} suffix="s" />
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Status distribution pie */}
        <div className="card">
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Claim Status Distribution</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {statusData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                formatter={(v) => <span style={{ fontSize: '0.78rem', color: '#8abfaa', textTransform: 'capitalize' }}>{v}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Spending by category */}
        <div className="card">
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Spend by Category</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categoryData} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2e27" />
              <XAxis dataKey="name" tick={{ fill: '#4d8770', fontSize: 11 }} axisLine={{ stroke: '#1a2e27' }} />
              <YAxis tick={{ fill: '#4d8770', fontSize: 11 }} axisLine={{ stroke: '#1a2e27' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`$${v.toLocaleString()}`, 'Spend']} />
              <Bar dataKey="spend" fill="#5fa08e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trend line chart */}
      {trendData.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>
            {range === 'all' ? 'All Time' : `${range}-Day`} Trend
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2e27" />
              <XAxis dataKey="date" tick={{ fill: '#4d8770', fontSize: 11 }} axisLine={{ stroke: '#1a2e27' }} />
              <YAxis yAxisId="claims" tick={{ fill: '#4d8770', fontSize: 11 }} axisLine={{ stroke: '#1a2e27' }} />
              <YAxis yAxisId="spend" orientation="right" tick={{ fill: '#4d8770', fontSize: 11 }} axisLine={{ stroke: '#1a2e27' }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line yAxisId="claims" type="monotone" dataKey="claims" stroke="#5fa08e" strokeWidth={2} dot={false} />
              <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="#5fb870" strokeWidth={2} dot={false} />
              <Legend formatter={(v) => <span style={{ fontSize: '0.78rem', color: '#8abfaa', textTransform: 'capitalize' }}>{v}</span>} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top offenders leaderboard */}
      {offenders.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
            <Users size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Highest-Flag Employees</span>
          </div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Flagged</th>
                  <th>Amount</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {offenders.map((o, i) => (
                  <tr key={i} style={{ cursor: 'default' }}>
                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{o.name}</td>
                    <td>{o.department || '—'}</td>
                    <td><span className="badge badge--flagged">{o.flaggedCount}</span></td>
                    <td className="amount-cell">${(o.totalAmount || 0).toLocaleString()}</td>
                    <td className="mono text-xs" style={{ color: o.complianceScore >= 80 ? 'var(--green)' : o.complianceScore >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                      {o.complianceScore ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
