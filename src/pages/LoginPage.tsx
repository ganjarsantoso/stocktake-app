import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

const BAR_COUNT = 48
const PARTICLE_COUNT = 16

/* ── Animated SSCC constants ── */
const FINAL_SSCC = '006141023891205'
const DIGIT_COUNT = FINAL_SSCC.length
const FINAL_SSCC_SPACED = FINAL_SSCC.split('').join(' ')
const SCRAMBLE_FRAMES = 20
const SCRAMBLE_INTERVAL = 80
const STABILIZE_INTERVAL = 100
const HOLD_DURATION = 3000

function randomDigit(): number {
  return Math.floor(Math.random() * 10)
}
function randomSsccSpaced(): string {
  return Array.from({ length: DIGIT_COUNT }, () => randomDigit()).join(' ')
}

export default function LoginPage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const setUser = useAuthStore((s) => s.setUser)
  const navigate = useNavigate()

  const [displaySscc, setDisplaySscc] = useState(randomSsccSpaced)
  const [scanned, setScanned] = useState(false)

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setDisplaySscc(FINAL_SSCC_SPACED)
      setScanned(true)
      return
    }

    let active = true

    async function loop() {
      while (active) {
        // Phase 1 — scramble all digits
        for (let i = 0; i < SCRAMBLE_FRAMES; i++) {
          if (!active) return
          await new Promise((r) => setTimeout(r, SCRAMBLE_INTERVAL))
          setDisplaySscc(randomSsccSpaced())
        }

        // Phase 2 — stabilize left → right
        for (let i = 0; i < DIGIT_COUNT; i++) {
          if (!active) return
          await new Promise((r) => setTimeout(r, STABILIZE_INTERVAL))
          setDisplaySscc(
            Array.from({ length: DIGIT_COUNT }, (_, j) =>
              j <= i ? FINAL_SSCC[j] : randomDigit(),
            ).join(' '),
          )
        }

        // Phase 3 — hold on final code
        setScanned(true)
        await new Promise((r) => setTimeout(r, HOLD_DURATION))
        if (!active) return
        setScanned(false)
      }
    }

    loop()
    return () => { active = false }
  }, [])

  const bars = useMemo(
    () => Array.from({ length: BAR_COUNT }, (_, i) => (
      <div key={i} className="login-bar" />
    )),
    [],
  )

  const particles = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, (_, i) => (
      <div key={i} className="login-particle" />
    )),
    [],
  )

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
    <div className="grid grid-cols-1 md:grid-cols-2 h-dvh">
      {/* ── Left: Scanning Animation Panel ── */}
      <div className="relative bg-[#0a0f1a] flex items-center justify-center overflow-hidden min-h-[40vh] md:min-h-0">
        {/* Glow rings */}
        <div className="login-scan-glow" />
        <div className="login-scan-glow login-scan-glow--inner" />

        {/* Barcode area */}
        <div className="login-barcode-canvas">
          <div className="login-bars">
            {bars}
          </div>
          <div className="login-laser-line" />
        </div>

        {/* SSCC label */}
        <div className={`login-scan-label${scanned ? ' scanned' : ''}`}>
          {scanned ? 'SCANNED' : 'SCANNING'}
          <span style={scanned ? { color: 'var(--color-positive)' } : undefined}>
            SSCC {displaySscc}
          </span>
        </div>

        {/* Floating particles */}
        <div className="login-particles">
          {particles}
        </div>
      </div>

      {/* ── Right: Login Form ── */}
      <div className="flex flex-col justify-center px-8 md:px-14 py-16 bg-surface">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-accent grid place-items-center font-bold text-sm font-mono text-white select-none">
              ST
            </div>
            <div>
              <span className="font-semibold text-xl tracking-tight text-white">StockTake</span>
              <p className="text-sm text-muted mt-0.5">Real-time stock counting</p>
            </div>
          </div>

          {/* Heading */}
          <h1 className="font-semibold text-2xl md:text-[28px] leading-tight tracking-tight text-white mt-10 mb-1">
            Start counting
          </h1>
          <p className="text-sm text-muted mb-8 max-w-[38ch] leading-relaxed">
            Enter your display name to join the session. No password needed — just pick a name your team will recognise.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="displayName"
                className="text-[13px] font-medium tracking-wide uppercase text-muted"
              >
                Display name
              </label>
              <input
                id="displayName"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (error) setError('')
                }}
                placeholder="e.g. Alice, Bin-3, Ops01"
                maxLength={50}
                autoFocus
                className="w-full max-w-[360px] px-4 py-3.5 rounded-xl bg-surface-light border border-border text-white placeholder:text-muted/50 text-base outline-none transition-all focus:border-accent focus:ring-[3px] focus:ring-accent/15"
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-negative"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-accent text-surface font-medium text-sm disabled:opacity-50 active:scale-[0.97] transition-all hover:bg-accent/80"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-surface border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <>
                  Enter the warehouse
                  <span className="text-lg transition-transform duration-200 group-hover:translate-x-0.5">→</span>
                </>
              )}
            </button>
          </form>

          {/* Online badge */}
          <div className="inline-flex items-center gap-1.5 mt-10 text-xs text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse-dot" />
            Ready to count
          </div>
        </motion.div>
      </div>
    </div>
  )
}
