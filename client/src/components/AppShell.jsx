import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Upload, History, LayoutDashboard, BarChart3, FileText, LogOut, Menu, X, Bell } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'

const PAGE_TITLES = {
  '/claims/upload': 'Submit Receipt',
  '/claims/history': 'My Claims',
  '/auditor/dashboard': 'Claims Review',
  '/auditor/analytics': 'Analytics',
  '/auditor/policy': 'Policy Management',
}

export default function AppShell() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const socketRef = useRef(null)
  const isEmployee = user?.role === 'employee'
  const isAuditor = user?.role === 'auditor' || user?.role === 'admin'

  const pageTitle = PAGE_TITLES[location.pathname] || 'Dashboard'

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
      setNotifications(prev => [{ ...data, id: Date.now(), read: false }, ...prev].slice(0, 20))
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

  // Keyboard shortcut: ESC to close sidebar
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
              <div className="sidebar__section-label">Expenses</div>
              <NavLink
                to="/claims/upload"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={closeSidebar}
              >
                <Upload /> Submit Receipt
              </NavLink>
              <NavLink
                to="/claims/history"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={closeSidebar}
              >
                <History /> My Claims
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
            </>
          )}
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
            <div className="notif-badge">
              <button className="btn btn--ghost btn--icon" onClick={markAllRead} title="Notifications">
                <Bell size={17} />
              </button>
              {unreadCount > 0 && (
                <span className="notif-badge__count">{unreadCount > 9 ? '9+' : unreadCount}</span>
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
