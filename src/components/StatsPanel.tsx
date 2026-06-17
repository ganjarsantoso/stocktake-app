import ProgressRing from './ProgressRing'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'

interface Props {
  loading?: boolean
}

export default function StatsPanel({ loading }: Props) {
  const stats = useAppStore((s) => s.stats)
  const user = useAuthStore((s) => s.user)
  const progress = stats.totalItems > 0 ? (stats.foundItems / stats.totalItems) * 100 : 0
  const userCount = stats.perUser[user?.display_name || ''] || 0

  return (
    <div className="space-y-3 relative">
      {loading && (
        <div className="absolute inset-0 z-10 bg-surface-light/60 rounded-2xl flex items-center justify-center">
          <span className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {/* Progress Ring */}
      <div className="flex justify-center">
        <ProgressRing progress={progress} size={100} strokeWidth={6} />
      </div>

      {/* Counts */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-surface-lighter rounded-xl p-2">
          <div className="text-lg font-bold">{stats.totalItems}</div>
          <div className="text-[10px] text-muted">Total</div>
        </div>
        <div className="bg-surface-lighter rounded-xl p-2">
          <div className="text-lg font-bold text-positive">{stats.foundItems}</div>
          <div className="text-[10px] text-muted">Found</div>
        </div>
        <div className="bg-surface-lighter rounded-xl p-2">
          <div className="text-lg font-bold text-accent">{userCount}</div>
          <div className="text-[10px] text-muted">Your count</div>
        </div>
        <div className="bg-surface-lighter rounded-xl p-2">
          <div className="text-lg font-bold text-warning">{stats.totalItems - stats.foundItems}</div>
          <div className="text-[10px] text-muted">Remaining</div>
        </div>
      </div>

      {/* Per-user */}
      <div className="space-y-1">
        <div className="text-[11px] text-muted font-medium uppercase tracking-wider">By User</div>
        {Object.entries(stats.perUser).length === 0 ? (
          <div className="text-xs text-muted italic">No items found yet</div>
        ) : (
          Object.entries(stats.perUser).map(([name, count]) => (
            <div
              key={name}
              className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs ${
                name === user?.display_name ? 'bg-accent/10 text-accent' : 'text-white'
              }`}
            >
              <span className="truncate">{name}</span>
              <span className="font-mono font-bold">{count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
