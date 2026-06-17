import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../stores/appStore'

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
  const logsEndRef = useRef<HTMLDivElement>(null)

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
            recentLogs.slice(0, 50).map((log) => {
              const isReverted = !!log.reverted_at
              return (
                <motion.div
                  key={log.id}
                  layout
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, x: 100 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className={`flex items-start gap-2 px-3 py-1.5 rounded-xl bg-surface-lighter/80 border ${
                    isReverted
                      ? 'border-negative/20 opacity-50'
                      : 'border-border'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                    isReverted
                      ? 'bg-negative'
                      : 'bg-accent shadow-[0_0_6px_rgba(245,158,11,0.6)]'
                  }`} />

                  <div className="flex-1 min-w-0 space-y-0.5">
                    {/* Line 1: identity */}
                    <div className="flex items-center gap-1.5 text-xs min-w-0">
                      <span className={`font-mono font-semibold shrink-0 ${isReverted ? 'text-muted line-through' : 'text-white'}`}>
                        {highlightLast5(log.storage_unit)}
                      </span>
                      <span className="text-muted shrink-0">·</span>
                      <span className={`truncate ${isReverted ? 'text-muted line-through' : 'text-white'}`}>
                        {log.material_no}
                      </span>
                      {log.material_description && (
                        <span className="text-muted truncate hidden sm:inline">— {log.material_description}</span>
                      )}
                    </div>

                    {/* Line 2: metadata badges */}
                    <div className="flex items-center gap-1.5 text-[10px] text-muted flex-wrap">
                      {isReverted ? (
                        <span className="text-negative font-medium bg-negative/10 px-1.5 py-0.5 rounded">Reverted</span>
                      ) : (
                        <>
                          {log.storage_bin && (
                            <span className="bg-surface-lighter px-1.5 py-0.5 rounded">{log.storage_bin}</span>
                          )}
                          {log.batch && (
                            <span className="bg-surface-lighter px-1.5 py-0.5 rounded">Batch: {log.batch}</span>
                          )}
                          {log.is_manual && (
                            <span className="text-warning">(manual)</span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Line 3: attribution */}
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className={`font-medium ${isReverted ? 'text-negative' : 'text-accent'}`}>
                        {log.found_by_name}
                      </span>
                      <span className="text-muted">·</span>
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
