import { useState, useEffect } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Legend,
} from 'recharts'
import { TrendingUp, Users, Clock, AlertTriangle, Home, Plane } from 'lucide-react'
import { analyticsAPI } from '../../services/api'
import { formatBase, BASE_SYMBOL } from '../../utils/currencyUtils'

const PALETTE = ['#22c55e', '#eab308', '#ef4444', '#6b7280', '#3b82f6']
const CAT_PALETTE = ['#5fa08e', '#5fb870', '#d4564e', '#5b8dd4', '#d4a843', '#78c4af']
const tooltipStyle = { background: '#152a24', border: '1px solid #264035', borderRadius: 8, fontSize: '0.82rem', color: '#d5ede4' }

export default function Analytics() {
  const [data, setData] = useState(null)
  const [offenders, setOffenders] = useState([])
  const [range, setRange] = useState('30')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [overview, topOff] = await Promise.all([
          analyticsAPI.overview({ range }),
          analyticsAPI.topOffenders(),
        ])
        setData(overview.data)
        setOffenders(topOff.data)
      } catch { /* handled */ }
      setLoading(false)
    }
    load()
  }, [range])

  if (loading) return (
    <div>
      <div className="page-header"><h2>Analytics</h2></div>
      <div className="card-grid mb-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton skeleton-card" />)}
      </div>
    </div>
  )

  const statusData = Object.entries(data?.byStatus || {}).map(([name, value]) => ({ name, value }))
  const categoryData = (data?.byCategory || []).map(c => ({ name: c._id || 'Other', claims: c.count, amount: Math.round(c.totalAmount || 0) }))
  const trendData = (data?.monthlyTrend || []).map(t => ({ date: t._id, claims: t.count, amount: Math.round(t.amount || 0) }))
  const tripData = (data?.byTripType || []).map(t => ({
    name: t._id === 'international' ? 'International' : 'Domestic',
    count: t.count,
    amount: Math.round(t.totalAmount || 0),
  }))

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ width: '100%' }}>
          <div>
            <h2>Analytics</h2>
            <p>Expense insights and compliance overview</p>
          </div>
          <select className="form-select" value={range} onChange={e => setRange(e.target.value)} style={{ width: 140 }}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {/* Top stats */}
      <div className="card-grid mb-6">
        <div className="stat-card">
          <div className="stat-card__label"><TrendingUp size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Total Spend</div>
          <div className="stat-card__value">{formatBase(data?.totalSpend || 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Total Claims</div>
          <div className="stat-card__value">{data?.totalClaims || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label"><Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Avg Processing</div>
          <div className="stat-card__value">{data?.avgProcessingMs ? `${(data.avgProcessingMs / 1000).toFixed(1)}s` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label"><AlertTriangle size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Flag Rate</div>
          <div className="stat-card__value" style={{ color: 'var(--amber)' }}>
            {data?.totalClaims ? `${Math.round(((data.byStatus?.flagged || 0) + (data.byStatus?.rejected || 0)) / data.totalClaims * 100)}%` : '0%'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Status distribution */}
        <div className="card">
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Status Distribution</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none">
                {statusData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex gap-3" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            {statusData.map((s, i) => (
              <div key={s.name} className="flex items-center gap-2 text-xs" style={{ textTransform: 'capitalize' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE[i % PALETTE.length] }} />
                {s.name} ({s.value})
              </div>
            ))}
          </div>
        </div>

        {/* Trip type breakdown */}
        <div className="card">
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>
            <Home size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
            Domestic vs
            <Plane size={13} style={{ display: 'inline', verticalAlign: -2, marginLeft: 8, marginRight: 4 }} />
            International
          </div>
          {tripData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tripData} barSize={50}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2e27" />
                <XAxis dataKey="name" tick={{ fill: '#4d8770', fontSize: 11 }} axisLine={{ stroke: '#1a2e27' }} />
                <YAxis tick={{ fill: '#4d8770', fontSize: 11 }} axisLine={{ stroke: '#1a2e27' }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [name === 'amount' ? formatBase(v) : v, name === 'amount' ? 'Amount' : 'Claims']} />
                <Bar dataKey="count" fill="#5fa08e" radius={[6, 6, 0, 0]} name="Claims" />
                <Bar dataKey="amount" fill="#5b8dd4" radius={[6, 6, 0, 0]} name="Amount" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: '40px 0' }}><p className="text-sm text-muted">No trip data yet</p></div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Category breakdown */}
        <div className="card">
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Spend by Category</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={categoryData} layout="vertical" barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2e27" />
              <XAxis type="number" tick={{ fill: '#4d8770', fontSize: 11 }} axisLine={{ stroke: '#1a2e27' }} tickFormatter={v => `${BASE_SYMBOL}${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#4d8770', fontSize: 10 }} axisLine={{ stroke: '#1a2e27' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatBase(v), 'Amount']} />
              <Bar dataKey="amount" fill="#5fa08e" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Trend */}
        <div className="card">
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Daily Trend</div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2e27" />
                <XAxis dataKey="date" tick={{ fill: '#4d8770', fontSize: 9 }} axisLine={{ stroke: '#1a2e27' }} />
                <YAxis yAxisId="left" tick={{ fill: '#4d8770', fontSize: 10 }} axisLine={{ stroke: '#1a2e27' }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#4d8770', fontSize: 10 }} axisLine={{ stroke: '#1a2e27' }} tickFormatter={v => `${BASE_SYMBOL}${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [name === 'amount' ? formatBase(v) : v, name === 'amount' ? 'Amount' : 'Claims']} />
                <Line yAxisId="left" type="monotone" dataKey="claims" stroke="#5fa08e" strokeWidth={2} dot={false} name="Claims" />
                <Line yAxisId="right" type="monotone" dataKey="amount" stroke="#5b8dd4" strokeWidth={2} dot={false} name="Amount" />
                <Legend wrapperStyle={{ fontSize: 11, color: '#4d8770' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: '40px 0' }}><p className="text-sm text-muted">Not enough data yet</p></div>
          )}
        </div>
      </div>

      {/* Top offenders */}
      <div className="card">
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>
          <Users size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
          Top Offenders
        </div>
        {offenders.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}><p className="text-sm text-muted">No flagged claims yet</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Flagged</th>
                  <th>Total ({BASE_SYMBOL})</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {offenders.map((o, i) => (
                  <tr key={o._id}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 550 }}>{o.name}</td>
                    <td className="text-muted">{o.department || '—'}</td>
                    <td><span style={{ color: 'var(--red)', fontWeight: 600 }}>{o.flaggedCount}</span></td>
                    <td className="mono">{formatBase(o.totalAmount)}</td>
                    <td>
                      <span style={{
                        fontWeight: 600,
                        color: (o.complianceScore || 0) >= 80 ? 'var(--green)' : (o.complianceScore || 0) >= 50 ? 'var(--amber)' : 'var(--red)',
                      }}>
                        {o.complianceScore ?? '—'}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
