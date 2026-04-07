import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Upload, History, LayoutDashboard, BarChart3, FileText, LogOut, Menu, X, Bell, Bot, FolderOpen, User, PieChart, Download } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/claims/upload': 'Submit Receipt',
  '/claims/batch': 'Batch Upload',
  '/claims/history': 'My Claims',
  '/policy/chat': 'Ask Policy',
  '/auditor/dashboard': 'Claims Review',
  '/auditor/analytics': 'Analytics',
  '/auditor/policy': 'Policy Management',
  '/auditor/export': 'Export Data',
  '/profile': 'Profile & Settings',
}

export default function AppShell() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)
  const socketRef = useRef(null)
  const notifRef = useRef(null)
  const isEmployee = user?.role === 'employee'
  const isAuditor = user?.role === 'auditor' || user?.role === 'admin'

  const pageTitle = PAGE_TITLES[location.pathname] || 'Dashboard'

  // Close notif dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Socket.IO connection for real-time notifications
  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      if (user?._id) socket.emit('join_room', user._id)
    })

    socket.on('claim_updated', (data) => {
      setNotifications(prev => [{ ...data, id: Date.now(), read: false, timestamp: new Date() }, ...prev].slice(0, 30))
      if (data.message) toast.success(data.message, { icon: '🔔' })
    })

    return () => { socket.disconnect() }
  }, [user?._id])

  const handleLogout = () => {
    socketRef.current?.disconnect()
    logout()
    navigate('/login')
  }

  const closeSidebar = () => setSidebarOpen(false)

  const unreadCount = notifications.filter(n => !n.read).length

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const clearAll = () => {
    setNotifications([])
    setNotifOpen(false)
  }

  // Keyboard shortcut: ESC to close sidebar
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { setSidebarOpen(false); setNotifOpen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const statusColors = {
    approved: 'var(--green)', flagged: 'var(--amber)', rejected: 'var(--red)',
  }

  return (
    <div className="app-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 45, backdropFilter: 'blur(2px)' }}
          onClick={closeSidebar}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <h1>Audit<span>Lens</span></h1>
          <p>Expense Intelligence</p>
        </div>

        <nav className="sidebar__nav">
          {isEmployee && (
            <>
              <div className="sidebar__section-label">Overview</div>
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={closeSidebar}
              >
                <PieChart /> Dashboard
              </NavLink>

              <div className="sidebar__section-label">Expenses</div>
              <NavLink
                to="/claims/upload"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={closeSidebar}
              >
                <Upload /> Submit Receipt
              </NavLink>
              <NavLink
                to="/claims/batch"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={closeSidebar}
              >
                <FolderOpen /> Batch Upload
              </NavLink>
              <NavLink
                to="/claims/history"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={closeSidebar}
              >
                <History /> My Claims
              </NavLink>

              <div className="sidebar__section-label">Help</div>
              <NavLink
                to="/policy/chat"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={closeSidebar}
              >
                <Bot /> Ask Policy
              </NavLink>
            </>
          )}

          {isAuditor && (
            <>
              <div className="sidebar__section-label">Audit</div>
              <NavLink
                to="/auditor/dashboard"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={closeSidebar}
              >
                <LayoutDashboard /> Claims Review
              </NavLink>
              <NavLink
                to="/auditor/analytics"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={closeSidebar}
              >
                <BarChart3 /> Analytics
              </NavLink>
              <NavLink
                to="/auditor/policy"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={closeSidebar}
              >
                <FileText /> Policy
              </NavLink>
              <NavLink
                to="/auditor/export"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={closeSidebar}
              >
                <Download /> Export
              </NavLink>
            </>
          )}

          <div className="sidebar__section-label">Account</div>
          <NavLink
            to="/profile"
            className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
            onClick={closeSidebar}
          >
            <User /> Profile
          </NavLink>
        </nav>

        <div className="sidebar__footer">
          <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
            <div className="avatar">{user?.name?.charAt(0)?.toUpperCase() || '?'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="text-sm truncate" style={{ fontWeight: 550 }}>{user?.name}</div>
              <div className="text-xs text-muted" style={{ textTransform: 'capitalize' }}>{user?.role}</div>
            </div>
          </div>
          <button className="btn btn--ghost btn--sm w-full" onClick={handleLogout}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div className="flex items-center gap-3">
            <button className="btn btn--ghost btn--icon mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="topbar__breadcrumb">{pageTitle}</div>
          </div>
          <div className="topbar__actions">
            {/* Notification center */}
            <div className="notif-badge" ref={notifRef} style={{ position: 'relative' }}>
              <button className="btn btn--ghost btn--icon" onClick={() => setNotifOpen(!notifOpen)} title="Notifications">
                <Bell size={17} />
              </button>
              {unreadCount > 0 && (
                <span className="notif-badge__count">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}

              {/* Dropdown */}
              {notifOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 8,
                  width: 340, maxHeight: 420, overflowY: 'auto',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                  zIndex: 100,
                }}>
                  <div style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Notifications</span>
                    <div className="flex gap-2">
                      {unreadCount > 0 && (
                        <button className="btn btn--ghost btn--sm" onClick={markAllRead} style={{ fontSize: '0.7rem' }}>
                          Mark read
                        </button>
                      )}
                      {notifications.length > 0 && (
                        <button className="btn btn--ghost btn--sm" onClick={clearAll} style={{ fontSize: '0.7rem' }}>
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {notifications.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                      <Bell size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
                      <div className="text-sm text-muted">No notifications yet</div>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          padding: '10px 16px',
                          borderBottom: '1px solid var(--border-subtle)',
                          background: n.read ? 'transparent' : 'var(--accent-subtle)',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onClick={() => {
                          setNotifications(prev => prev.map(nn => nn.id === n.id ? { ...nn, read: true } : nn))
                          if (n.claimId) {
                            setNotifOpen(false)
                            // Navigate to claims
                          }
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-inset)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = n.read ? 'transparent' : 'var(--accent-subtle)'}
                      >
                        <div className="flex items-center gap-2">
                          {!n.read && (
                            <div style={{
                              width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0,
                            }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="text-sm" style={{ fontWeight: n.read ? 400 : 550 }}>
                              {n.message || `Claim updated${n.newStatus ? `: ${n.newStatus.toUpperCase()}` : ''}`}
                            </div>
                            {n.newStatus && (
                              <span style={{
                                display: 'inline-block', marginTop: 2, padding: '1px 6px',
                                borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
                                background: `${statusColors[n.newStatus] || 'var(--text-muted)'}22`,
                                color: statusColors[n.newStatus] || 'var(--text-muted)',
                                textTransform: 'uppercase',
                              }}>
                                {n.newStatus}
                              </span>
                            )}
                            <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                              {n.timestamp ? formatDistanceToNow(new Date(n.timestamp), { addSuffix: true }) : ''}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="page-container">
          <Outlet />
        </div>
      </main>

      <style>{`
        .mobile-menu-btn { display: none !important; }
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
