import { useState, useEffect } from 'react'
import { Download, FileSpreadsheet, Calendar, Loader2, IndianRupee, CheckCircle2, ArrowRight } from 'lucide-react'
import { exportAPI } from '../../services/api'
import { BASE_SYMBOL } from '../../utils/currencyUtils'
import toast from 'react-hot-toast'

const CATEGORIES = ['all', 'Meals', 'Transport', 'Lodging', 'Entertainment', 'Office Supplies', 'Other']
const STATUSES = ['approved', 'flagged', 'rejected', 'all']

export default function ExportData() {
  const [format, setFormat] = useState('standard')
  const [status, setStatus] = useState('approved')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [tripType, setTripType] = useState('all')
  const [category, setCategory] = useState('all')
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => fetchSummary(), 300)
    return () => clearTimeout(timer)
  }, [status, dateFrom, dateTo, tripType, category])

  const fetchSummary = async () => {
    setLoading(true)
    try {
      const params = { status, tripType, category }
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const { data } = await exportAPI.summary(params)
      setSummary(data)
    } catch {
      setSummary({ count: 0, totalAmount: 0, categories: [] })
    }
    setLoading(false)
  }

  const handleExport = async () => {
    if (!summary?.count) return toast.error('No claims match the selected filters')
    setDownloading(true)
    try {
      const params = new URLSearchParams({ format, status, tripType, category })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const token = localStorage.getItem('token')

      // Fetch CSV data through Vite proxy (same-origin)
      const res = await fetch(`/api/export/claims?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })

      if (!res.ok) throw new Error('Export failed')

      // Get CSV as text and create a blob
      const csvText = await res.text()
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })

      // Client-controlled filename — no reliance on server headers
      const filename = format === 'tally'
        ? `tally_vouchers_${new Date().toISOString().split('T')[0]}.csv`
        : `claims_export_${new Date().toISOString().split('T')[0]}.csv`

      // Use File System Access API if available (modern Chrome)
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'CSV File', accept: { 'text/csv': ['.csv'] } }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          toast.success(`Exported ${summary.count} claims as ${format === 'tally' ? 'Tally CSV' : 'CSV'}`)
          setDownloading(false)
          return
        } catch (pickerErr) {
          // User cancelled the save dialog — fall through to anchor method
          if (pickerErr.name === 'AbortError') { setDownloading(false); return }
        }
      }

      // Fallback: anchor download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Long delay before revoking — Chrome needs time to start the download
      setTimeout(() => URL.revokeObjectURL(url), 60000)

      toast.success(`Exported ${summary.count} claims as ${format === 'tally' ? 'Tally CSV' : 'CSV'}`)
    } catch (err) {
      toast.error(err.message || 'Export failed')
    }
    setDownloading(false)
  }

  const formatFeatures = format === 'tally' ? [
    'Payment voucher format (Dr/Cr ledgers)',
    'Auto-mapped expense categories',
    'GST amount separated for ITC',
    'Cost centre & department tagging',
    'DD-MM-YYYY Indian date format',
  ] : [
    'All 30+ data fields per claim',
    'Line items & tax breakdown',
    'AI flags and audit explanations',
    'Compatible with Excel, Sheets, SAP',
  ]

  return (
    <div>
      <div className="page-header">
        <h2>Export Data <FileSpreadsheet size={18} style={{ display: 'inline', color: 'var(--accent)', verticalAlign: -2 }} /></h2>
        <p>Download expense claims for your accounting software</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-6)', alignItems: 'start' }}>

        {/* ─── Left Column: Filters ─── */}
        <div className="card">
          {/* Format Toggle */}
          <div className="form-group">
            <label className="form-label">Export Format</label>
            <div className="flex gap-3">
              <button
                type="button"
                className={`btn btn--sm ${format === 'standard' ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => setFormat('standard')}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <FileSpreadsheet size={14} /> Standard CSV
              </button>
              <button
                type="button"
                className={`btn btn--sm ${format === 'tally' ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => setFormat('tally')}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <IndianRupee size={14} /> Tally Format
              </button>
            </div>
            <div className="form-hint">
              {format === 'standard'
                ? 'Full data export — compatible with Excel, Google Sheets'
                : 'Payment voucher format — import into Tally Prime / ERP 9'}
            </div>
          </div>

          {/* Status */}
          <div className="form-group">
            <label className="form-label" htmlFor="export-status">Claim Status</label>
            <select
              id="export-status"
              className="form-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="form-group">
            <label className="form-label">
              <Calendar size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
              Date Range
            </label>
            <div className="flex gap-3 items-center">
              <input
                type="date"
                className="form-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ flex: 1 }}
              />
              <ArrowRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="date"
                className="form-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div className="form-hint">Leave empty for all dates</div>
          </div>

          {/* Trip Type */}
          <div className="form-group">
            <label className="form-label" htmlFor="export-trip">Trip Type</label>
            <select id="export-trip" className="form-select" value={tripType} onChange={(e) => setTripType(e.target.value)}>
              <option value="all">All Trips</option>
              <option value="domestic">Domestic Only</option>
              <option value="international">International Only</option>
            </select>
          </div>

          {/* Category */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="export-cat">Category</label>
            <select id="export-cat" className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ─── Right Column: Preview + Download ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

          {/* Preview Card */}
          <div className="card">
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--sp-4)', color: 'var(--text-secondary)' }}>
              Export Preview
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 'var(--sp-8)' }}>
                <Loader2 size={22} style={{ animation: 'spin 0.6s linear infinite', color: 'var(--accent)' }} />
              </div>
            ) : summary ? (
              <>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)',
                }}>
                  <div style={{
                    padding: 'var(--sp-5)', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', textAlign: 'center',
                  }}>
                    <div style={{
                      fontSize: '2rem', fontWeight: 700, color: 'var(--accent)',
                      animation: 'countUp 0.3s ease', lineHeight: 1.2,
                    }}>
                      {summary.count}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>Claims</div>
                  </div>
                  <div style={{
                    padding: 'var(--sp-5)', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', textAlign: 'center',
                  }}>
                    <div style={{
                      fontSize: '1.5rem', fontWeight: 700, color: 'var(--green)',
                      animation: 'countUp 0.3s ease', lineHeight: 1.2,
                    }}>
                      {BASE_SYMBOL}{summary.totalAmount?.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>
                      Total ({summary.currency || 'INR'})
                    </div>
                  </div>
                </div>

                {summary.categories?.filter(Boolean).length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>
                      Categories
                    </div>
                    <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                      {summary.categories.filter(Boolean).map(c => (
                        <span key={c} style={{
                          padding: '3px 10px', borderRadius: 'var(--radius-full)',
                          fontSize: '0.72rem', fontWeight: 500,
                          background: 'var(--accent-subtle)', color: 'var(--accent)',
                          border: '1px solid var(--accent-muted)',
                        }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Select filters to preview
              </div>
            )}
          </div>

          {/* Format Details */}
          <div className="card" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--sp-3)', color: 'var(--text-secondary)' }}>
              {format === 'tally' ? 'Tally Format' : 'Standard CSV'} — Includes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {formatFeatures.map((feat, i) => (
                <div key={i} className="flex items-center gap-2" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <CheckCircle2 size={13} style={{ color: 'var(--green)', flexShrink: 0 }} />
                  {feat}
                </div>
              ))}
            </div>
          </div>

          {/* Download Button */}
          <button
            className="btn btn--primary"
            onClick={handleExport}
            disabled={downloading || !summary?.count}
            style={{
              padding: 'var(--sp-4) var(--sp-6)', fontSize: '0.9rem', fontWeight: 600,
              justifyContent: 'center', width: '100%', borderRadius: 'var(--radius-md)',
            }}
          >
            {downloading ? (
              <><Loader2 size={16} style={{ animation: 'spin 0.6s linear infinite' }} /> Exporting...</>
            ) : (
              <><Download size={16} /> Export {summary?.count || 0} Claims as {format === 'tally' ? 'Tally CSV' : 'CSV'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
