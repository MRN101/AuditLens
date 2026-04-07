import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authAPI } from '../../services/api'
import useAuthStore from '../../store/authStore'

function getPasswordStrength(pw) {
  if (!pw) return { level: '', label: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (pw.length >= 12) score++
  
  if (score <= 1) return { level: 'weak', label: 'Weak' }
  if (score === 2) return { level: 'fair', label: 'Fair' }
  if (score === 3) return { level: 'good', label: 'Good' }
  return { level: 'strong', label: 'Strong' }
}

export default function Register() {
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'employee',
    location: '', seniority: 'mid', department: '',
  })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuthStore()

  const pwStrength = useMemo(() => getPasswordStrength(form.password), [form.password])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const validationErrors = useMemo(() => {
    const errors = []
    if (form.name && form.name.length < 2) errors.push('Name must be at least 2 characters')
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.push('Invalid email format')
    if (form.password && form.password.length < 8) errors.push('Password: minimum 8 characters')
    if (form.password && !/[A-Z]/.test(form.password)) errors.push('Password: needs an uppercase letter')
    if (form.password && !/[0-9]/.test(form.password)) errors.push('Password: needs a number')
    return errors
  }, [form.name, form.email, form.password])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.password) return toast.error('Name, email, and password required')
    if (validationErrors.length > 0) return toast.error(validationErrors[0])
    setLoading(true)
    try {
      const { data } = await authAPI.register(form)
      login(data, data.token)
      toast.success('Account created!')
      navigate(data.role === 'employee' ? '/claims/upload' : '/auditor/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-hero">
        <div className="auth-hero__content">
          <div className="auth-hero__badge">Get Started in 30 seconds</div>
          <h1 className="auth-hero__title">
            Join your team on<br />
            <span>AuditLens</span>
          </h1>
          <p className="auth-hero__subtitle">
            Create your account to start submitting expenses or reviewing claims. Our AI handles the heavy lifting — you focus on your work.
          </p>
        </div>
        <div className="auth-hero__glow auth-hero__glow--1" />
        <div className="auth-hero__glow auth-hero__glow--2" />
      </div>

      <div className="auth-form-panel">
      <div className="auth-card" style={{ maxWidth: 420 }}>
        <div className="auth-card__logo">
          <h1>Audit<span>Lens</span></h1>
          <p>Create your account</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full name</label>
            <input id="register-name" className="form-input" placeholder="Jane Doe" value={form.name} onChange={set('name')} />
          </div>

          <div className="form-group">
            <label className="form-label">Work email</label>
            <input id="register-email" className="form-input" type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input id="register-password" className="form-input" type="password" placeholder="Min. 8 characters, 1 uppercase, 1 number" value={form.password} onChange={set('password')} autoComplete="new-password" />
            {form.password && (
              <>
                <div className={`pw-strength pw-strength--${pwStrength.level}`}>
                  <div className="pw-strength__bar" />
                  <div className="pw-strength__bar" />
                  <div className="pw-strength__bar" />
                  <div className="pw-strength__bar" />
                </div>
                <div className="text-xs" style={{
                  marginTop: 4,
                  color: pwStrength.level === 'weak' ? 'var(--red)' :
                         pwStrength.level === 'fair' ? 'var(--amber)' :
                         pwStrength.level === 'good' ? 'var(--blue)' : 'var(--green)'
                }}>
                  {pwStrength.label}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select id="register-role" className="form-select" value={form.role} onChange={set('role')}>
                <option value="employee">Employee</option>
                <option value="auditor">Finance Auditor</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Seniority</label>
              <select className="form-select" value={form.seniority} onChange={set('seniority')}>
                <option value="junior">Junior</option>
                <option value="mid">Mid-level</option>
                <option value="senior">Senior</option>
                <option value="executive">Executive</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input className="form-input" placeholder="New York" value={form.location} onChange={set('location')} />
            </div>
            <div className="form-group">
              <label className="form-label">Department</label>
              <input className="form-input" placeholder="Engineering" value={form.department} onChange={set('department')} />
            </div>
          </div>

          {validationErrors.length > 0 && form.password && (
            <div style={{ marginBottom: 12 }}>
              {validationErrors.map((err, i) => (
                <div key={i} className="form-error">{err}</div>
              ))}
            </div>
          )}

          <button id="register-submit" className="btn btn--primary w-full btn--lg" disabled={loading || validationErrors.length > 0} style={{ marginTop: 4 }}>
            {loading ? <span className="spinner" /> : 'Create account'}
          </button>
        </form>

        <div className="auth-card__footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
      </div>
    </div>
  )
}
