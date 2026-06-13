import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../stores/appStore'
import { supabase } from '../lib/supabase'

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

export default function LiveLogs() {
  const recentLogs = useAppStore((s) => s.recentLogs)
  const prependLog = useAppStore((s) => s.prependLog)
  const setRecentLogs = useAppStore((s) => s.setRecentLogs)
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
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
