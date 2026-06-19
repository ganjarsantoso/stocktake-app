import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DatasetsPage from './pages/DatasetsPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import InventoryPage from './pages/InventoryPage'
import VariancesPage from './pages/VariancesPage'
import Layout from './components/Layout'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  if (isLoading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function GuestGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  if (isLoading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { setUser, setLoading } = useAuthStore()
  const theme = useThemeStore((s) => s.theme)
  const [dbReady, setDbReady] = useState<boolean | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  useEffect(() => {
    // Check that the database tables exist
    supabase.from('found_logs').select('id').limit(1).then(({ error }) => {
      setDbReady(!error || (error && !error.message?.includes('relation') && !error.message?.includes('does not exist')))
    })
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        loadUser(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadUser(supabaseUid: string) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('supabase_uid', supabaseUid)
      .maybeSingle()

    if (data) {
      setUser(data)
    } else {
      const current = useAuthStore.getState().user
      if (!current) {
        setUser(null)
      }
    }
  }

  // DB not configured — show setup instructions
  if (dbReady === false) {
    return (
      <div className="h-dvh flex items-center justify-center bg-surface text-white p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center mx-auto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-warning">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h1 className="text-lg font-bold">Database Not Configured</h1>
          <p className="text-sm text-muted">
            Open your Supabase SQL Editor and run <code className="text-accent bg-surface-light px-1.5 py-0.5 rounded text-xs">supabase/schema.sql</code>, then apply all files in <code className="text-accent bg-surface-light px-1.5 py-0.5 rounded text-xs">supabase/migrations/</code>.
          </p>
          <button
            onPointerDown={() => setDbReady(null)}
            className="px-4 py-2 rounded-xl bg-accent text-surface text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Still checking — spinner
  if (dbReady === null) {
    return (
      <div className="h-dvh flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestGuard>
            <LoginPage />
          </GuestGuard>
        }
      />
      <Route
        element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/variances" element={<VariancesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
