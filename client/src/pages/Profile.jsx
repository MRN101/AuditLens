import { useState } from 'react'
import { User, MapPin, Building2, Award, Shield, Lock, Save, Loader2, Check } from 'lucide-react'
import useAuthStore from '../store/authStore'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'

export default function Profile() {
  const { user, setUser } = useAuthStore()
  const [name, setName] = useState(user?.name || '')
  const [location, setLocation] = useState(user?.location || '')
  const [department, setDepartment] = useState(user?.department || '')
  const [seniority, setSeniority] = useState(user?.seniority || 'mid')
  const [saving, setSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPw, setChangingPw] = useState(false)

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await authAPI.updateProfile({ name, location, department, seniority })
      setUser(data)
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile')
    }
    setSaving(false)
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match')
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters')
    setChangingPw(true)
    try {
      await authAPI.changePassword({ currentPassword, newPassword })
      toast.success('Password changed successfully')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password')
    }
    setChangingPw(false)
  }

  const cs = user?.complianceScore ?? 100

  return (
    <div>
      <div className="page-header">
        <h2>Profile & Settings</h2>
        <p>Manage your account information and preferences</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Profile card */}
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="avatar" style={{
            width: 72, height: 72, fontSize: '1.6rem', margin: '0 auto 16px',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-muted))',
          }}>
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{user?.name}</div>
          <div className="text-sm text-muted" style={{ textTransform: 'capitalize' }}>{user?.role}</div>
          <div className="text-xs text-muted" style={{ marginTop: 4 }}>{user?.email}</div>

          <div style={{ marginTop: 20, padding: '16px 0', borderTop: '1px solid var(--border-subtle)' }}>
            <div className="text-xs text-muted" style={{ marginBottom: 8 }}>Compliance Score</div>
            <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto' }}>
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--bg-inset)" strokeWidth="6" />
                <circle cx="40" cy="40" r="34" fill="none"
                  stroke={cs >= 80 ? 'var(--green)' : cs >= 50 ? 'var(--amber)' : 'var(--red)'}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${(cs / 100) * 213.6} 213.6`}
                  transform="rotate(-90 40 40)"
                  style={{ transition: 'stroke-dasharray 1s ease' }}
                />
              </svg>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', fontWeight: 700,
                color: cs >= 80 ? 'var(--green)' : cs >= 50 ? 'var(--amber)' : 'var(--red)',
              }}>
                {cs}%
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <div style={{ padding: '8px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)' }}>
              <div className="text-xs text-muted">Total</div>
              <div className="text-sm" style={{ fontWeight: 600 }}>{user?.totalClaims || 0}</div>
            </div>
            <div style={{ padding: '8px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)' }}>
              <div className="text-xs text-muted">Approved</div>
              <div className="text-sm" style={{ fontWeight: 600, color: 'var(--green)' }}>{user?.approvedClaims || 0}</div>
            </div>
          </div>
        </div>

        {/* Settings forms */}
        <div className="flex flex-col gap-4">
          {/* Profile info */}
          <div className="card">
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>
              <User size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
              Profile Information
            </div>
            <form onSubmit={handleSaveProfile}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label"><MapPin size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: -1 }} /> Location</label>
                  <input className="form-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Mumbai" />
                </div>
                <div className="form-group">
                  <label className="form-label"><Building2 size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: -1 }} /> Department</label>
                  <input className="form-input" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label"><Award size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: -1 }} /> Seniority</label>
                <select className="form-select" value={seniority} onChange={e => setSeniority(e.target.value)}>
                  <option value="junior">Junior</option>
                  <option value="mid">Mid-Level</option>
                  <option value="senior">Senior</option>
                  <option value="executive">Executive</option>
                </select>
              </div>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? <><Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> Saving...</> : <><Save size={14} /> Save Changes</>}
              </button>
            </form>
          </div>

          {/* Change password */}
          <div className="card">
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>
              <Lock size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
              Change Password
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input className="form-input" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input className="form-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm Password</label>
                  <input className="form-input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
              </div>
              <button type="submit" className="btn btn--secondary" disabled={changingPw}>
                {changingPw ? <><Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> Changing...</> : <><Lock size={14} /> Change Password</>}
              </button>
            </form>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 320px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
