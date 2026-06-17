import { useAppStore } from '../stores/appStore'

function timeAgo(t: string) {
  const diff = Date.now() - new Date(t).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  return `${m}m ago`
}

function last5(unit: string | null) {
  if (!unit || unit.length < 5) return unit ?? ''
  return unit.slice(-5)
}

export default function MiniLiveLog() {
  const recentLogs = useAppStore((s) => s.recentLogs)
  const log = recentLogs[0]

  if (!log) return null

  const isReverted = !!log.reverted_at

  return (
    <div className="flex items-center gap-1.5 truncate text-[10px] leading-none">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isReverted ? 'bg-negative' : 'bg-accent'
        }`}
      />
      <span className={`font-mono font-semibold ${isReverted ? 'text-muted line-through' : 'text-white'}`}>
        {last5(log.storage_unit)}
      </span>
      <span className="text-muted">·</span>
      <span className={`truncate ${isReverted ? 'text-muted line-through' : 'text-white'}`}>
        {log.material_no}
      </span>
      <span className="text-muted">·</span>
      <span className="text-muted shrink-0">{timeAgo(log.created_at)}</span>
      <span className="text-muted">·</span>
      <span className="text-accent shrink-0">{log.found_by_name}</span>
    </div>
  )
}
