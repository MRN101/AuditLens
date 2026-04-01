import { useState, useEffect, useRef } from 'react'
import { History, Eye, ChevronLeft, ChevronRight, Trash2, RotateCcw, AlertTriangle, X } from 'lucide-react'
import { claimsAPI } from '../../services/api'
import ClaimDetailModal from '../../components/ClaimDetailModal'
import StatusBadge from '../../components/StatusBadge'
import RiskLevel from '../../components/RiskLevel'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function MyClaims() {
  const { user } = useAuthStore()
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [activeFilter, setActiveFilter] = useState('')
  const [selectedClaim, setSelectedClaim] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const pollRef = useRef(null)

  const loadClaims = async () => {
    try {
      const params = { page, limit: 10 }
      if (activeFilter) params.status = activeFilter
      const { data } = await claimsAPI.getMyClaims(params)
      setClaims(data.claims)
      setPages(data.pages)
    } catch { /* handled by interceptor */ }
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    loadClaims()
  }, [page, activeFilter])

  // Poll for processing claims
  useEffect(() => {
    const hasProcessing = claims.some(c => c.auditStatus === 'processing' || c.auditStatus === 'pending')
    if (hasProcessing) {
      pollRef.current = setInterval(loadClaims, 5000)
    }
    return () => clearInterval(pollRef.current)
  }, [claims])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await claimsAPI.deleteClaim(deleteTarget)
      toast.success('Claim deleted')
      setDeleteTarget(null)
      loadClaims()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed')
    }
    setDeleting(false)
  }

  const filters = [
    { label: 'All', value: '' },
    { label: 'Pending', value: 'pending' },
    { label: 'Approved', value: 'approved' },
    { label: 'Flagged', value: 'flagged' },
    { label: 'Rejected', value: 'rejected' },
  ]

  const SkeletonRow = () => (
    <tr><td colSpan={7}><div className="skeleton skeleton-row" /></td></tr>
  )

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h2>My Claims</h2>
          <p>Track the status of your submitted expenses</p>
        </div>
        {user?.complianceScore != null && (
          <div className="stat-card" style={{ padding: '12px 20px', minWidth: 140, textAlign: 'center' }}>
            <div className="stat-card__label">Compliance</div>
            <div className="stat-card__value" style={{
              fontSize: '1.4rem',
              color: user.complianceScore >= 80 ? 'var(--green)' : user.complianceScore >= 50 ? 'var(--amber)' : 'var(--red)'
            }}>
              {user.complianceScore}%
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6" style={{ flexWrap: 'wrap' }}>
        {filters.map((f) => (
          <button
            key={f.value}
            className={`btn btn--sm ${activeFilter === f.value ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => { setActiveFilter(f.value); setPage(1) }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Amount</th><th>Status</th><th>Risk</th><th></th></tr></thead>
            <tbody>{[1,2,3,4].map(i => <SkeletonRow key={i} />)}</tbody>
          </table>
        </div>
      ) : claims.length === 0 ? (
        <div className="empty-state">
          <History size={48} />
          <p>No claims found</p>
          <a href="/claims/upload" className="btn btn--primary btn--sm">Submit your first expense</a>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Risk</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c._id}>
                    <td>{c.claimedDate ? format(new Date(c.claimedDate), 'MMM dd, yyyy') : '—'}</td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {c.extractedData?.merchantName || (c.auditStatus === 'processing' ? (
                        <span className="flex items-center gap-2"><span className="spinner" style={{ width: 12, height: 12 }} /> Processing...</span>
                      ) : 'Pending...')}
                    </td>
                    <td>{c.extractedData?.category || '—'}</td>
                    <td className="amount-cell">
                      {c.extractedData?.amount
                        ? `${c.extractedData.currency === 'USD' ? '$' : c.extractedData.currency + ' '}${c.extractedData.amount.toLocaleString()}`
                        : '—'}
                    </td>
                    <td><StatusBadge status={c.effectiveStatus || c.auditStatus} /></td>
                    <td><RiskLevel level={c.riskLevel} /></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn--ghost btn--icon" title="View details" onClick={() => setSelectedClaim(c._id)}>
                          <Eye size={15} />
                        </button>
                        {['pending', 'flagged'].includes(c.auditStatus) && (
                          <button className="btn btn--ghost btn--icon" title="Delete claim" onClick={(e) => { e.stopPropagation(); setDeleteTarget(c._id) }}>
                            <Trash2 size={14} style={{ color: 'var(--red)' }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between mt-4" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              <span>Page {page} of {pages}</span>
              <div className="flex gap-2">
                <button className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft size={14} /> Prev
                </button>
                <button className="btn btn--secondary btn--sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal__body">
              <div className="confirm-dialog">
                <AlertTriangle className="confirm-dialog__icon" />
                <div className="confirm-dialog__title">Delete this claim?</div>
                <div className="confirm-dialog__text">This will permanently remove the claim and its receipt. This cannot be undone.</div>
                <div className="flex gap-3" style={{ justifyContent: 'center' }}>
                  <button className="btn btn--danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? <span className="spinner" /> : 'Delete'}
                  </button>
                  <button className="btn btn--secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedClaim && (
        <ClaimDetailModal
          claimId={selectedClaim}
          onClose={() => setSelectedClaim(null)}
          onUpdate={loadClaims}
        />
      )}
    </div>
  )
}
