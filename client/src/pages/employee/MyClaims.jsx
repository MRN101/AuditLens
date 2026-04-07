import { useState, useEffect } from 'react'
import { Clock, Search, Filter, Eye, Trash2, RefreshCw, Home, Plane, Loader2, AlertTriangle } from 'lucide-react'
import { claimsAPI } from '../../services/api'
import { formatBase, formatConversion } from '../../utils/currencyUtils'
import ClaimDetailModal from '../../components/ClaimDetailModal'
import toast from 'react-hot-toast'

const STATUS_BADGES = {
  pending: { label: 'Pending', color: '#6b7280' },
  processing: { label: 'Processing', color: '#3b82f6' },
  approved: { label: 'Approved', color: '#22c55e' },
  flagged: { label: 'Flagged', color: '#eab308' },
  rejected: { label: 'Rejected', color: '#ef4444' },
}

const TRIP_ICONS = {
  domestic: <Home size={12} />,
  international: <Plane size={12} />,
}

export default function MyClaims() {
  const [claims, setClaims] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selectedClaim, setSelectedClaim] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [tripFilter, setTripFilter] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [reauditing, setReauditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchClaims = async () => {
    setLoading(true)
    try {
      const params = { page, limit: 10 }
      if (statusFilter) params.status = statusFilter
      if (tripFilter) params.tripType = tripFilter
      const { data } = await claimsAPI.getMyClaims(params)
      setClaims(data.claims || [])
      setTotalPages(data.pages || 1)
    } catch {
      toast.error('Failed to load claims')
    }
    setLoading(false)
  }

  useEffect(() => { fetchClaims() }, [page, statusFilter, tripFilter])

  // Poll for status updates every 30s
  useEffect(() => {
    const interval = setInterval(fetchClaims, 30000)
    return () => clearInterval(interval)
  }, [page, statusFilter, tripFilter])

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await claimsAPI.deleteClaim(deleteTarget)
      toast.success('Claim deleted')
      fetchClaims()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed')
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  const handleReaudit = async (id) => {
    setReauditing(id)
    try {
      await claimsAPI.reaudit(id)
      toast.success('Re-audit triggered! Refreshing...')
      setTimeout(fetchClaims, 2000)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Re-audit failed')
    }
    setReauditing(null)
  }

  const filteredClaims = searchQ
    ? claims.filter(c =>
      (c.extractedData?.merchantName || '').toLowerCase().includes(searchQ.toLowerCase()) ||
      (c.businessPurpose || '').toLowerCase().includes(searchQ.toLowerCase())
    )
    : claims

  return (
    <div>
      <div className="page-header">
        <h2>My Claims</h2>
        <p>{claims.length > 0 ? `${claims.length} claim(s) on this page` : 'No claims yet'}</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input className="form-input" placeholder="Search merchant or purpose..." value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ margin: 0, flex: 1, border: 'none', background: 'transparent' }} />
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
          </div>
        </div>
      </div>

      {loading && claims.length === 0 ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : filteredClaims.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <Clock size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 600 }}>No claims found</div>
          <p className="text-sm text-muted">Submit your first expense receipt to get started</p>
          <a href="/claims/upload" className="btn btn--primary" style={{ marginTop: 16 }}>Submit Receipt</a>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredClaims.map(claim => {
            const st = STATUS_BADGES[claim.auditStatus] || STATUS_BADGES.pending
            const ext = claim.extractedData || {}
            const canDelete = true
            const canReaudit = ['flagged', 'rejected'].includes(claim.auditStatus) && !claim.auditorOverride?.isOverridden

            return (
              <div
                key={claim._id}
                className="card card--hoverable"
                style={{ padding: '14px 18px', cursor: 'pointer' }}
                onClick={() => setSelectedClaim(claim)}
              >
                <div className="flex items-center justify-between" style={{ gap: 16 }}>
                  <div className="flex items-center gap-3" style={{ flex: 1, minWidth: 0 }}>
                    {/* Trip type icon */}
                    <div style={{
                      width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: claim.tripType === 'international' ? 'rgba(91,141,212,0.15)' : 'var(--accent-subtle)',
                      color: claim.tripType === 'international' ? '#5b8dd4' : 'var(--accent)',
                      flexShrink: 0,
                    }}>
                      {TRIP_ICONS[claim.tripType] || TRIP_ICONS.domestic}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="text-sm truncate" style={{ fontWeight: 550 }}>
                        {ext.merchantName || 'Processing...'}
                      </div>
                      <div className="text-xs text-muted truncate">{claim.businessPurpose}</div>
                    </div>
                  </div>

                  <div className="text-sm mono" style={{ fontWeight: 600, textAlign: 'right', minWidth: 85 }}>
                    {ext.amountBase ? formatBase(ext.amountBase) : ext.amount ? `${ext.currency} ${ext.amount}` : '—'}
                  </div>

                  <div className="text-xs" style={{ minWidth: 70, textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 4, fontWeight: 600, background: `${st.color}18`, color: st.color }}>
                      {st.label}
                    </span>
                  </div>

                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button className="btn btn--ghost btn--icon" onClick={() => setSelectedClaim(claim)} title="View">
                      <Eye size={14} />
                    </button>
                    {canReaudit && (
                      <button className="btn btn--ghost btn--icon" onClick={() => handleReaudit(claim._id)} disabled={reauditing === claim._id} title="Re-audit">
                        {reauditing === claim._id ? <Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> : <RefreshCw size={14} />}
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn btn--ghost btn--icon" onClick={() => setDeleteTarget(claim._id)} title="Delete" style={{ color: 'var(--red)' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Flags */}
                {claim.flags && Object.entries(claim.flags).filter(([, v]) => v).length > 0 && (
                  <div className="flex gap-2" style={{ marginTop: 8 }}>
                    {Object.entries(claim.flags).filter(([, v]) => v).map(([key]) => (
                      <span key={key} className="text-xs" style={{
                        padding: '1px 6px', borderRadius: 4, fontWeight: 500,
                        background: 'rgba(234,179,8,0.1)', color: 'var(--amber)',
                      }}>
                        {key.replace(/([A-Z])/g, ' $1')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3" style={{ marginTop: 24 }}>
          <button className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className="text-sm text-muted">Page {page} of {totalPages}</span>
          <button className="btn btn--secondary btn--sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {selectedClaim && (
        <ClaimDetailModal
          claim={selectedClaim}
          onClose={() => setSelectedClaim(null)}
          onUpdate={fetchClaims}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            style={{
              background: 'var(--bg-elevated)', borderRadius: 12,
              padding: '28px 24px', width: '90%', maxWidth: 380,
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(239,68,68,0.12)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <AlertTriangle size={24} style={{ color: '#ef4444' }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: 6 }}>Delete this claim?</div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
              This action cannot be undone. The claim and its receipt data will be permanently removed.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn--secondary"
                style={{ flex: 1 }}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: '#ef4444', color: '#fff', fontWeight: 600,
                  cursor: 'pointer', fontSize: '0.85rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#dc2626'}
                onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? <Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> : <Trash2 size={14} />}
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
