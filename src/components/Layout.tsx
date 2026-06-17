import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'
import { useThemeStore } from '../stores/themeStore'
import { useFoundLogsSubscription } from '../hooks/useFoundLogsSubscription'
import MiniLiveLog from './MiniLiveLog'

const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/datasets',
    label: 'Datasets',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    to: '/inventory',
    label: 'Inventory',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    to: '/history',
    label: 'History',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed')
    return saved ? JSON.parse(saved) : false
  })
  const user = useAuthStore((s) => s.user)
  const activeDataset = useAppStore((s) => s.activeDataset)
  const keyboardVisible = useThemeStore((s) => s.keyboardVisible)
  const setKeyboardVisible = useThemeStore((s) => s.setKeyboardVisible)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const location = useLocation()
  const isDashboard = location.pathname === '/'

  useFoundLogsSubscription()

  const toggleCollapse = () => {
    setSidebarCollapsed((prev: boolean) => {
      const next = !prev
      localStorage.setItem('sidebarCollapsed', JSON.stringify(next))
      return next
    })
  }

  return (
    <div className="h-dvh flex bg-surface text-white overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onPointerDown={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          ${sidebarCollapsed ? 'w-16' : 'w-56'}
          bg-surface-light border-r border-border
          transform transition-all duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:flex md:flex-col
        `}
      >
        {/* Sidebar header */}
        <div className="flex items-center h-12 border-b border-border shrink-0">
          {sidebarCollapsed ? (
            <div className="flex-1 flex justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-accent shrink-0">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" />
              </svg>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-accent shrink-0">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" />
              </svg>
              <span className="font-semibold text-sm truncate">StockTake</span>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center rounded-lg font-medium transition-colors
                  ${sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5 text-sm'}
                  ${isActive
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted hover:text-white hover:bg-surface-lighter'
                  }
                `}
                title={sidebarCollapsed ? item.label : undefined}
              >
                {item.icon}
                {!sidebarCollapsed && <span>{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>

        {/* Sidebar footer: toggle + user info */}
        <div className={`border-t border-border flex items-center ${sidebarCollapsed ? 'flex-col py-2 gap-2' : 'px-4 py-3 gap-2'}`}>
          <button
            onPointerDown={toggleCollapse}
            className="shrink-0 p-1.5 rounded-lg text-muted hover:text-white hover:bg-surface-lighter transition-colors hidden md:block"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`}>
              <line x1="18" y1="6" x2="6" y2="12" />
              <line x1="18" y1="18" x2="6" y2="12" />
            </svg>
          </button>
          {sidebarCollapsed ? (
            <span className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0" title={user?.display_name || 'User'}>
              {user?.display_name?.charAt(0).toUpperCase() || '?'}
            </span>
          ) : (
            <>
              <span className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">
                {user?.display_name?.charAt(0).toUpperCase() || '?'}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{user?.display_name || 'User'}</div>
                {activeDataset && (
                  <div className="text-[10px] text-muted truncate">{activeDataset.name}</div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-3 h-12 border-b border-border shrink-0 bg-surface">
          <div className="flex items-center gap-2">
            {/* Hamburger */}
            <button
              onPointerDown={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-muted hover:text-white hover:bg-surface-lighter transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="text-sm font-semibold md:hidden">StockTake</span>
            {activeDataset && (
              <span className="text-xs text-muted ml-1 hidden sm:inline">
                / {activeDataset.name}
              </span>
            )}
          </div>
          <div className="hidden md:flex flex-1 min-w-0 px-3">
            <MiniLiveLog />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onPointerDown={() => toggleTheme()}
              className="p-1.5 rounded-lg text-muted hover:text-white hover:bg-surface-lighter transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            {isDashboard && (
              <button
                onPointerDown={() => setKeyboardVisible(!keyboardVisible)}
                className="p-1.5 rounded-lg text-muted hover:text-white hover:bg-surface-lighter transition-colors active:bg-accent/20"
                title={keyboardVisible ? 'Hide keyboard' : 'Show keyboard'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="6" y1="8" x2="6.01" y2="8" />
                  <line x1="10" y1="8" x2="10.01" y2="8" />
                  <line x1="14" y1="8" x2="14.01" y2="8" />
                  <line x1="18" y1="8" x2="18.01" y2="8" />
                  <line x1="6" y1="12" x2="6.01" y2="12" />
                  <line x1="10" y1="12" x2="10.01" y2="12" />
                  <line x1="14" y1="12" x2="14.01" y2="12" />
                  <line x1="18" y1="12" x2="18.01" y2="12" />
                  <line x1="6" y1="16" x2="18" y2="16" />
                </svg>
              </button>
            )}
            <span className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium md:hidden">
              {user?.display_name?.charAt(0).toUpperCase() || '?'}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
