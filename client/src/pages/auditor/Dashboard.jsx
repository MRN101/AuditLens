import { useState, useEffect, useRef, useCallback } from 'react'
import { Eye, Search, Download, RefreshCw } from 'lucide-react'
import { auditorAPI } from '../../services/api'
import ClaimDetailModal from '../../components/ClaimDetailModal'
import StatusBadge from '../../components/StatusBadge'
import RiskLevel from '../../components/RiskLevel'
import { format } from 'date-fns'

function AnimatedNumber({ value, color }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const target = Number(value) || 0
    if (target === 0) { setDisplay(0); return }
    let start = 0
    const duration = 600
    const step = (ts) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      setDisplay(Math.round(progress * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [value])
  return <span style={color ? { color } : {}}>{display.toLocaleString()}</span>
}

export default function Dashboard() {
  const [claims, setClaims] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectedClaim, setSelectedClaim] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const refreshTimer = useRef(null)

  const loadData = useCallback(async () => {
    try {
      const params = { page, limit: 15 }
      if (statusFilter) params.status = statusFilter
      if (riskFilter) params.riskLevel = riskFilter
      if (search.trim()) params.search = search.trim()
      const [claimsRes, statsRes] = await Promise.all([
        auditorAPI.getClaims(params),
        auditorAPI.getStats(),
      ])
      setClaims(claimsRes.data.claims)
      setPages(claimsRes.data.pages)
      setStats(statsRes.data)
    } catch { /* interceptor */ }
    setLoading(false)
  }, [page, statusFilter, riskFilter, search])

  useEffect(() => {
    setLoading(true)
    loadData()
  }, [loadData])

  // Auto-refresh every 30s
  useEffect(() => {
    if (autoRefresh) {
      refreshTimer.current = setInterval(loadData, 30000)
    }
    return () => clearInterval(refreshTimer.current)
  }, [autoRefresh, loadData])

  const exportCSV = () => {
    if (!claims.length) return
    const header = 'Date,Merchant,Category,Amount,Currency,Status,Risk,Employee,Purpose\n'
    const rows = claims.map((c) =>
      [
        c.claimedDate ? format(new Date(c.claimedDate), 'yyyy-MM-dd') : '',
        `"${c.extractedData?.merchantName || ''}"`,
        c.extractedData?.category || '',
        c.extractedData?.amount || '',
        c.extractedData?.currency || '',
        c.auditStatus,
        c.riskLevel,
        `"${c.employee?.name || ''}"`,
        `"${(c.businessPurpose || '').replace(/"/g, '""')}"`,
      ].join(',')
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `claims-export-${format(new Date(), 'yyyyMMdd')}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const statCards = stats ? [
    { label: 'Total Claims', value: Object.values(stats.byStatus).reduce((a, b) => a + b, 0), change: null },
    { label: 'Approved', value: stats.byStatus.approved || 0, color: 'var(--green)' },
    { label: 'Flagged', value: stats.byStatus.flagged || 0, color: 'var(--amber)' },
    { label: 'Rejected', value: stats.byStatus.rejected || 0, color: 'var(--red)' },
  ] : []

  const SkeletonRow = () => (
    <tr><td colSpan={9}><div className="skeleton skeleton-row" /></td></tr>
  )

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h2>Claims Review</h2>
          <p>Review, audit, and manage expense claims</p>
        </div>
        <div className="flex gap-3 items-center">
          {autoRefresh && (
            <span className="text-xs text-muted flex items-center">
              <span className="auto-refresh-dot" />
              Live
            </span>
          )}
          <button className="btn btn--secondary btn--sm" onClick={exportCSV}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn--ghost btn--sm" onClick={loadData} title="Refresh now">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      {stats ? (
        <div className="card-grid mb-6">
          {statCards.map((s, i) => (
            <div className="stat-card" key={s.label} style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="stat-card__label">{s.label}</div>
              <div className="stat-card__value">
                <AnimatedNumber value={s.value} color={s.color} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-grid mb-6">
          {[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-card" />)}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {['', 'pending', 'approved', 'flagged', 'rejected'].map((s) => (
            <button
              key={s}
              className={`btn btn--sm ${statusFilter === s ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => { setStatusFilter(s); setPage(1) }}
            >
              {s || 'All Status'}
            </button>
          ))}
        </div>
        <div className="flex gap-3 items-center">
          <div className="search-input-wrap">
            <Search />
            <input
              className="search-input"
              placeholder="Search employee, merchant..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <div className="flex gap-2">
            {['', 'high', 'medium', 'low'].map((r) => (
              <button
                key={r}
                className={`btn btn--sm ${riskFilter === r ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => { setRiskFilter(r); setPage(1) }}
              >
                {r || 'All Risk'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Claims table */}
      {loading ? (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th><th>Date</th><th>Merchant</th><th>Category</th><th>Amount</th><th>Status</th><th>Risk</th><th>Score</th><th></th>
              </tr>
            </thead>
            <tbody>
              {[1,2,3,4,5].map(i => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      ) : claims.length === 0 ? (
        <div className="empty-state">
          <Search size={48} />
          <p>No claims match your filters</p>
          <button className="btn btn--secondary btn--sm" onClick={() => { setStatusFilter(''); setRiskFilter(''); setSearch('') }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Merchant</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c._id} onClick={() => setSelectedClaim(c._id)}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="avatar" style={{ width: 28, height: 28, fontSize: '0.68rem' }}>
                        {c.employee?.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="text-sm" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{c.employee?.name}</div>
                        <div className="text-xs text-muted">{c.employee?.department}</div>
                      </div>
                    </div>
                  </td>
                  <td>{c.claimedDate ? format(new Date(c.claimedDate), 'MMM dd') : '—'}</td>
                  <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{c.extractedData?.merchantName || '...'}</td>
                  <td>{c.extractedData?.category || '—'}</td>
                  <td className="amount-cell">
                    {c.extractedData?.amount
                      ? `$${(c.extractedData.amountUSD || c.extractedData.amount).toLocaleString()}`
                      : '—'}
                  </td>
                  <td><StatusBadge status={c.effectiveStatus || c.auditStatus} /></td>
                  <td><RiskLevel level={c.riskLevel} /></td>
                  <td className="text-xs mono" style={{ color: c.employee?.complianceScore >= 80 ? 'var(--green)' : c.employee?.complianceScore >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                    {c.employee?.complianceScore ?? '—'}
                  </td>
                  <td>
                    <button className="btn btn--ghost btn--icon"><Eye size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <button className="btn btn--secondary btn--sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}

      {selectedClaim && (
        <ClaimDetailModal
          claimId={selectedClaim}
          onClose={() => setSelectedClaim(null)}
          onUpdate={loadData}
        />
      )}
    </div>
  )
}
