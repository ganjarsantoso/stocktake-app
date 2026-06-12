import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import { supabase } from '../lib/supabase'

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const keyboardVisible = useThemeStore((s) => s.keyboardVisible)
  const setKeyboardVisible = useThemeStore((s) => s.setKeyboardVisible)
  const keyboardSize = useThemeStore((s) => s.keyboardSize)
  const setKeyboardSize = useThemeStore((s) => s.setKeyboardSize)

  const [editName, setEditName] = useState(false)
  const [nameValue, setNameValue] = useState(user?.display_name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSaveName() {
    if (!user || !nameValue.trim()) return
    setSaving(true)

    const { data } = await supabase
      .from('users')
      .update({ display_name: nameValue.trim() })
      .eq('id', user.id)
      .select()
      .single()

    if (data) {
      setUser(data)
      setEditName(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }

    setSaving(false)
  }

  const kbSizeOptions: { value: 'small' | 'medium' | 'large'; label: string }[] = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
  ]

  return (
    <div className="p-3 space-y-3">
      <h1 className="text-base font-bold">Settings</h1>

      {/* Profile */}
      <div className="bg-surface-light rounded-2xl p-3 border border-border space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold shrink-0">
            {user?.display_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            {editName ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  maxLength={50}
                  autoFocus
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-surface-lighter border border-border text-white text-sm focus:outline-none focus:border-accent"
                />
                <button
                  onPointerDown={handleSaveName}
                  disabled={saving || !nameValue.trim()}
                  className="px-3 py-1.5 rounded-lg bg-accent text-surface text-xs font-semibold disabled:opacity-50"
                >
                  {saving ? '...' : 'Save'}
                </button>
                <button
                  onPointerDown={() => { setEditName(false); setNameValue(user?.display_name || '') }}
                  className="px-3 py-1.5 rounded-lg bg-surface-lighter text-muted text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div>
                <div className="text-sm font-medium text-white">{user?.display_name}</div>
                <div className="text-[11px] text-muted">Your credential</div>
              </div>
            )}
          </div>
          {!editName && (
            <button
              onPointerDown={() => setEditName(true)}
              className="text-xs text-accent font-medium"
            >
              Edit
            </button>
          )}
        </div>
        {saved && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-positive text-center"
          >
            Name updated!
          </motion.p>
        )}
      </div>

      {/* Theme */}
      <div className="bg-surface-light rounded-2xl p-3 border border-border space-y-2">
        <div className="text-sm font-medium text-white">Appearance</div>
        <button
          onPointerDown={toggleTheme}
          className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl bg-surface-lighter active:bg-accent/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-accent">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-accent">
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
            )}
            <span className="text-sm text-white">
              {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </span>
          </div>
          <div className={`w-10 h-6 rounded-full transition-colors ${
            theme === 'dark' ? 'bg-accent' : 'bg-surface-lighter'
          } relative`}>
            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
              theme === 'dark' ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`} />
          </div>
        </button>
      </div>

      {/* Keyboard */}
      <div className="bg-surface-light rounded-2xl p-3 border border-border space-y-3">
        <div className="text-sm font-medium text-white">Keyboard</div>

        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-lighter">
          <span className="text-sm text-white">Show on Dashboard</span>
          <button
            onPointerDown={() => setKeyboardVisible(!keyboardVisible)}
            className={`w-10 h-6 rounded-full transition-colors ${
              keyboardVisible ? 'bg-accent' : 'bg-surface-lighter'
            } relative`}
          >
            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
              keyboardVisible ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`} />
          </button>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] text-muted">Key Size</div>
          <div className="flex gap-2">
            {kbSizeOptions.map((opt) => (
              <button
                key={opt.value}
                onPointerDown={() => setKeyboardSize(opt.value)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  keyboardSize === opt.value
                    ? 'bg-accent text-surface'
                    : 'bg-surface-lighter text-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* About */}
      <div className="bg-surface-light rounded-2xl p-3 border border-border text-center">
        <div className="text-xs text-muted">StockTake v1.0.0</div>
        <div className="text-[11px] text-muted/60 mt-0.5">Real-time multi-user stock counting</div>
      </div>
    </div>
  )
}
