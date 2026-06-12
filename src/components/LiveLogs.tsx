import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../stores/appStore'
import { supabase } from '../lib/supabase'
import { revertFoundLog } from '../lib/revert'

function highlightLast5(unit: string | null) {
  if (!unit || unit.length < 5) return <span>{unit}</span>
  const head = unit.slice(0, -5)
  const tail = unit.slice(-5)
  return (
    <span>
      {head}<span className="text-accent font-bold">{tail}</span>
    </span>
  )
}

interface Props {
  onRevert?: () => void
}

export default function LiveLogs({ onRevert }: Props) {
  const recentLogs = useAppStore((s) => s.recentLogs)
  const prependLog = useAppStore((s) => s.prependLog)
  const setRecentLogs = useAppStore((s) => s.setRecentLogs)
  const [reverting, setReverting] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const channel = supabase
      .channel('realtime-live-logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'found_logs' },
        (payload) => {
          const n = payload.new as any
          prependLog({
            id: n.id,
            item_id: n.item_id,
            dataset_id: n.dataset_id,
            found_by: n.found_by,
            found_by_name: n.found_by_name,
            material_no: n.material_no,
            material_description: n.material_description,
            storage_unit: n.storage_unit,
            storage_bin: n.storage_bin,
            batch: n.batch,
            is_manual: n.is_manual,
            reverted_at: n.reverted_at,
            created_at: n.created_at,
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'found_logs' },
        (payload) => {
          const u = payload.new as any
          useAppStore.setState((s) => ({
            recentLogs: s.recentLogs.map((l) =>
              l.id === u.id ? { ...l, reverted_at: u.reverted_at, item_id: u.item_id } : l
            ),
          }))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [prependLog, setRecentLogs])

  async function handleRevert(logId: string) {
    setConfirmId(null)
    setReverting(logId)

    // Mark as reverted locally immediately (optimistic)
    useAppStore.setState((s) => ({
      recentLogs: s.recentLogs.map((l) =>
        l.id === logId ? { ...l, reverted_at: new Date().toISOString(), item_id: null } : l
      ),
    }))

    const result = await revertFoundLog(logId)
    if (!result.success) {
      // Revert failed — restore original state
      const { data: log } = await supabase.from('found_logs').select('*').eq('id', logId).single()
      if (log) {
        useAppStore.setState((s) => ({
          recentLogs: s.recentLogs.map((l) => (l.id === logId ? { ...log } : l)),
        }))
      }
    }
    setReverting(null)
    onRevert?.()
  }

  function timeAgo(t: string) {
    const diff = Date.now() - new Date(t).getTime()
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s ago`
    const m = Math.floor(s / 60)
    return `${m}m ago`
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted font-medium uppercase tracking-wider">Live Logs</span>
        <span className="text-[10px] text-muted">{recentLogs.length} events</span>
      </div>

      <div className="space-y-1 overflow-y-auto" ref={logsEndRef}>
        <AnimatePresence mode="popLayout">
          {recentLogs.length === 0 ? (
            <div className="text-xs text-muted italic py-4 text-center">
              No items found yet. Start scanning!
            </div>
          ) : (
            recentLogs.slice(0, 20).map((log) => {
              const isReverted = !!log.reverted_at
              return (
                <motion.div
                  key={log.id}
                  layout
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, x: 100 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className={`flex items-start gap-2 px-3 py-2.5 rounded-xl bg-surface-lighter/80 border ${
                    isReverted
                      ? 'border-negative/20 opacity-50'
                      : 'border-border'
                  }`}
                >
                  {isReverted ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-negative mt-2 shrink-0" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
                  )}

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono font-semibold ${isReverted ? 'text-muted line-through' : 'text-white'}`}>
                        {highlightLast5(log.storage_unit)}
                      </span>
                      {isReverted && (
                        <span className="text-[10px] text-negative font-medium bg-negative/10 px-1.5 py-0.5 rounded">Reverted</span>
                      )}
                    </div>

                    <div className={`text-xs truncate ${isReverted ? 'text-muted line-through' : 'text-white'}`}>
                      {log.material_no}
                      {log.material_description && (
                        <span className="text-muted ml-1">— {log.material_description}</span>
                      )}
                      {log.is_manual && !isReverted && (
                        <span className="text-warning ml-1.5 text-[10px]">(manual)</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      {log.storage_bin && !isReverted && (
                        <span className="bg-surface-lighter px-1.5 py-0.5 rounded">{log.storage_bin}</span>
                      )}
                      {log.batch && !isReverted && (
                        <span className="bg-surface-lighter px-1.5 py-0.5 rounded">Batch: {log.batch}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[10px]">
                      <span className={`font-medium ${isReverted ? 'text-negative' : 'text-accent'}`}>
                        {log.found_by_name}
                      </span>
                      <span className="text-muted">{timeAgo(log.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1 shrink-0 mt-1">
                    {isReverted ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-negative">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    ) : (
                      <button
                        onPointerDown={() => setConfirmId(log.id)}
                        disabled={reverting === log.id}
                        className="p-1 rounded text-muted hover:text-negative hover:bg-negative/10 transition-colors disabled:opacity-30"
                        title="Revert (undo found)"
                      >
                        {reverting === log.id ? (
                          <span className="w-3 h-3 border-2 border-negative border-t-transparent rounded-full animate-spin block" />
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                            <polyline points="1 4 1 10 7 10" />
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>

      {/* Confirmation dialog */}
      {confirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onPointerDown={() => setConfirmId(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface border border-border rounded-2xl p-5 mx-4 max-w-sm w-full shadow-2xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-white mb-2">Revert this item?</h3>
            <p className="text-xs text-muted mb-5">
              This will mark the item as not found. It can be re-scanned afterward.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onPointerDown={() => setConfirmId(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted bg-surface-lighter border border-border hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onPointerDown={() => handleRevert(confirmId)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-negative hover:bg-negative/90 transition-colors"
              >
                Yes, Revert
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
