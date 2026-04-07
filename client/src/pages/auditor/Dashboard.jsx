import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, Eye, Download, RefreshCw, CheckSquare, Square, AlertTriangle, Home, Plane, Loader2 } from 'lucide-react'
import { auditorAPI } from '../../services/api'
import { formatBase, BASE_SYMBOL } from '../../utils/currencyUtils'
import ClaimDetailModal from '../../components/ClaimDetailModal'
import toast from 'react-hot-toast'

const STATUS_BADGES = {
  pending: { label: 'Pending', color: '#6b7280' },
  processing: { label: 'Processing', color: '#3b82f6' },
  approved: { label: 'Approved', color: '#22c55e' },
  flagged: { label: 'Flagged', color: '#eab308' },
  rejected: { label: 'Rejected', color: '#ef4444' },
}

export default function Dashboard() {
  const [claims, setClaims] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [tripFilter, setTripFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectedClaim, setSelectedClaim] = useState(null)

  // Bulk selection
  const [selected, setSelected] = useState(new Set())
  const [bulkAction, setBulkAction] = useState(null)
  const [bulkComment, setBulkComment] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)

  const fetchClaims = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: 20 }
      if (statusFilter) params.status = statusFilter
      if (tripFilter) params.tripType = tripFilter
      if (search.trim()) params.search = search.trim()
      const { data } = await auditorAPI.getClaims(params)
      setClaims(data.claims || [])
      setTotalPages(data.pages || 1)
    } catch { toast.error('Failed to load claims') }
    setLoading(false)
  }, [page, statusFilter, tripFilter, search])

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await auditorAPI.getStats()
      setStats(data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchClaims(); fetchStats() }, [fetchClaims, fetchStats])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => { fetchClaims(); fetchStats() }, 30000)
    return () => clearInterval(interval)
  }, [fetchClaims, fetchStats])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === claims.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(claims.map(c => c._id)))
    }
  }

  const handleBulkOverride = async () => {
    if (!bulkAction || !bulkComment.trim()) return toast.error('Select action and enter comment')
    setBulkLoading(true)
    try {
      const { data } = await auditorAPI.bulkOverride({
        claimIds: Array.from(selected),
        status: bulkAction,
        comment: bulkComment.trim(),
      })
      toast.success(`${data.modifiedCount} claims updated!`)
      setSelected(new Set())
      setBulkAction(null)
      setBulkComment('')
      fetchClaims()
      fetchStats()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk override failed')
    }
    setBulkLoading(false)
  }

  const exportCSV = () => {
    const rows = [
      ['ID', 'Employee', 'Merchant', 'Amount', 'Currency', 'Trip Type', 'Category', 'Status', 'Risk', 'Date', 'Business Purpose'],
      ...claims.map(c => [
        c._id,
        c.employee?.name || '',
        c.extractedData?.merchantName || '',
        c.extractedData?.amountBase || c.extractedData?.amount || '',
        'INR',
        c.tripType || 'domestic',
        c.extractedData?.category || '',
        c.effectiveStatus || c.auditStatus,
        c.riskLevel,
        c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : '',
        `"${(c.businessPurpose || '').replace(/"/g, '""')}"`,
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `auditlens-claims-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
    toast.success('CSV exported!')
  }

  const totalAmount = claims.reduce((sum, c) => sum + (c.extractedData?.amountBase || 0), 0)

  return (
    <div>
      <div className="page-header">
        <h2>Claims Review</h2>
        <p style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {stats && (
            <>
              <span className="stat-pill">Total: {Object.values(stats.byStatus || {}).reduce((s, v) => s + v, 0)}</span>
              <span className="stat-pill" style={{ color: '#eab308' }}>⚠ Flagged: {stats.byStatus?.flagged || 0}</span>
              <span className="stat-pill" style={{ color: '#ef4444' }}>✕ Rejected: {stats.byStatus?.rejected || 0}</span>
            </>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              className="form-input"
              placeholder="Search employee, merchant, or purpose..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ margin: 0, flex: 1, border: 'none', background: 'transparent' }}
            />
          </div>
          <div className="flex gap-2">
            <select className="form-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
              <option value="">All Status</option>
              {Object.entries(STATUS_BADGES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select className="form-select" value={tripFilter} onChange={e => { setTripFilter(e.target.value); setPage(1) }}>
              <option value="">All Trips</option>
              <option value="domestic">🇮🇳 Domestic</option>
              <option value="international">🌍 International</option>
            </select>
            <button className="btn btn--ghost btn--icon" onClick={() => { fetchClaims(); fetchStats() }} title="Refresh">
              <RefreshCw size={14} />
            </button>
            <button className="btn btn--secondary btn--sm" onClick={exportCSV}>
              <Download size={13} /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="card" style={{
          marginBottom: 12, padding: '10px 16px',
          background: 'var(--accent-subtle)', borderColor: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        }}>
          <div className="text-sm" style={{ fontWeight: 600 }}>
            {selected.size} claim{selected.size > 1 ? 's' : ''} selected
          </div>
          <div className="flex items-center gap-2">
            <select className="form-select" value={bulkAction || ''} onChange={e => setBulkAction(e.target.value || null)} style={{ width: 120 }}>
              <option value="">Action...</option>
              <option value="approved">Approve All</option>
              <option value="flagged">Flag All</option>
              <option value="rejected">Reject All</option>
            </select>
            <input
              className="form-input"
              placeholder="Comment..."
              value={bulkComment}
              onChange={e => setBulkComment(e.target.value)}
              style={{ margin: 0, width: 200 }}
            />
            <button className="btn btn--primary btn--sm" onClick={handleBulkOverride} disabled={bulkLoading || !bulkAction}>
              {bulkLoading ? <Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> : 'Apply'}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setSelected(new Set())}>Cancel</button>
          </div>
        </div>
      )}

      {/* Claims table */}
      {loading && claims.length === 0 ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : claims.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <Filter size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 600 }}>No claims match your filters</div>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div className="card" style={{ padding: '8px 18px', marginBottom: 2, background: 'var(--bg-elevated)' }}>
            <div className="flex items-center" style={{ gap: 12 }}>
              <button className="btn btn--ghost btn--icon" onClick={toggleSelectAll} style={{ width: 28, height: 28 }}>
                {selected.size === claims.length ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} /> : <Square size={14} />}
              </button>
              <div className="text-xs text-muted" style={{ flex: 2 }}>Employee / Merchant</div>
              <div className="text-xs text-muted" style={{ width: 50, textAlign: 'center' }}>Trip</div>
              <div className="text-xs text-muted" style={{ width: 90, textAlign: 'right' }}>Amount</div>
              <div className="text-xs text-muted" style={{ width: 80, textAlign: 'center' }}>Status</div>
              <div className="text-xs text-muted" style={{ width: 60, textAlign: 'center' }}>Risk</div>
              <div className="text-xs text-muted" style={{ width: 50 }}></div>
            </div>
          </div>

          {claims.map(claim => {
            const ext = claim.extractedData || {}
            const st = STATUS_BADGES[claim.effectiveStatus || claim.auditStatus] || STATUS_BADGES.pending
            const riskColor = { high: '#ef4444', medium: '#eab308', low: '#22c55e' }[claim.riskLevel] || '#6b7280'
            const isSelected = selected.has(claim._id)

            return (
              <div
                key={claim._id}
                className="card card--hoverable"
                style={{
                  padding: '10px 18px', marginBottom: 2, cursor: 'pointer',
                  borderLeftWidth: 3, borderLeftColor: riskColor,
                  background: isSelected ? 'var(--accent-subtle)' : undefined,
                }}
                onClick={() => setSelectedClaim(claim)}
              >
                <div className="flex items-center" style={{ gap: 12 }}>
                  <button
                    className="btn btn--ghost btn--icon"
                    onClick={e => { e.stopPropagation(); toggleSelect(claim._id) }}
                    style={{ width: 28, height: 28 }}
                  >
                    {isSelected ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} /> : <Square size={14} />}
                  </button>

                  <div style={{ flex: 2, minWidth: 0 }}>
                    <div className="text-sm truncate" style={{ fontWeight: 550 }}>
                      {claim.employee?.name || '—'}
                      <span className="text-xs text-muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                        {ext.merchantName || ''}
                      </span>
                    </div>
                    <div className="text-xs text-muted truncate">{claim.businessPurpose}</div>
                  </div>

                  <div style={{ width: 50, textAlign: 'center' }}>
                    <span title={claim.tripType || 'domestic'}>
                      {claim.tripType === 'international' ? '🌍' : '🇮🇳'}
                    </span>
                  </div>

                  <div className="text-sm mono" style={{ fontWeight: 600, width: 90, textAlign: 'right' }}>
                    {ext.amountBase ? formatBase(ext.amountBase) : '—'}
                  </div>

                  <div style={{ width: 80, textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem',
                      fontWeight: 600, background: `${st.color}18`, color: st.color,
                    }}>
                      {st.label}
                    </span>
                  </div>

                  <div style={{ width: 60, textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: '0.65rem',
                      fontWeight: 600, background: `${riskColor}18`, color: riskColor, textTransform: 'uppercase',
                    }}>
                      {claim.riskLevel}
                    </span>
                  </div>

                  <div style={{ width: 50, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn--ghost btn--icon" onClick={() => setSelectedClaim(claim)}>
                      <Eye size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Footer */}
          <div className="flex items-center justify-between" style={{ marginTop: 16, padding: '0 8px' }}>
            <div className="text-xs text-muted">
              Showing {claims.length} claims · Total: {formatBase(totalAmount)}
            </div>
            <div className="flex gap-2">
              <button className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span className="text-sm text-muted" style={{ lineHeight: '32px' }}>Page {page}/{totalPages}</span>
              <button className="btn btn--secondary btn--sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          </div>
        </>
      )}

      {selectedClaim && (
        <ClaimDetailModal
          claim={selectedClaim}
          onClose={() => setSelectedClaim(null)}
          onUpdate={() => { fetchClaims(); fetchStats() }}
          showOverride
        />
      )}
    </div>
  )
}
