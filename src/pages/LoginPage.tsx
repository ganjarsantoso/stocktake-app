import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export default function LoginPage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const setUser = useAuthStore((s) => s.setUser)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter your name')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      let supabaseUid: string

      if (!session) {
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously()
        if (anonError || !anonData.session) {
          setError('Failed to create session. Check your Supabase configuration.')
          setLoading(false)
          return
        }
        supabaseUid = anonData.session.user.id
      } else {
        supabaseUid = session.user.id
      }

      // Check if user exists
      const { data: existing } = await supabase
        .from('users')
        .select('*')
        .eq('supabase_uid', supabaseUid)
        .maybeSingle()

      if (existing) {
        // Update name
        const { data: updated } = await supabase
          .from('users')
          .update({ display_name: trimmed })
          .eq('id', existing.id)
          .select()
          .single()

        if (updated) {
          setUser(updated)
          navigate('/', { replace: true })
        }
      } else {
        // Create new user
        const { data: newUser } = await supabase
          .from('users')
          .insert({
            supabase_uid: supabaseUid,
            display_name: trimmed,
          })
          .select()
          .single()

        if (newUser) {
          setUser(newUser)
          navigate('/', { replace: true })
        }
      }
    } catch (err) {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-dvh flex items-center justify-center bg-surface p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-accent">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">StockTake</h1>
          <p className="text-sm text-muted mt-1">Enter your name to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (e.g. Alice)"
              maxLength={50}
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-surface-lighter border border-border text-white placeholder:text-muted/50 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            />
          </div>
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-negative text-center"
            >
              {error}
            </motion.p>
          )}
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-3 rounded-xl bg-accent text-surface font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-surface border-t-transparent rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              'Enter StockTake'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
