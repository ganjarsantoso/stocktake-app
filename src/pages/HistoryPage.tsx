import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import type { FoundLog } from '../types'

const PAGE_SIZE = 50

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

type StatusFilter = 'all' | 'scan' | 'manual' | 'reverted'

export default function HistoryPage() {
  const [logs, setLogs] = useState<FoundLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const activeDataset = useAppStore((s) => s.activeDataset)

  const loadLogs = useCallback(async (reset: boolean) => {
    if (!activeDataset) {
      setLogs([])
      setLoading(false)
      setTotalCount(0)
      return
    }

    if (reset) setLoading(true)
    else setLoadingMore(true)

    const start = reset ? 0 : logs.length
    const end = start + PAGE_SIZE - 1

    const [countRes, dataRes] = await Promise.all([
      supabase
        .from('found_logs')
        .select('*', { count: 'exact', head: true })
        .eq('dataset_id', activeDataset.id),
      supabase
        .from('found_logs')
        .select('*')
        .eq('dataset_id', activeDataset.id)
        .order('created_at', { ascending: false })
        .range(start, end),
    ])

    if (countRes.count !== null) setTotalCount(countRes.count)
    if (dataRes.data) {
      setLogs(reset ? dataRes.data : [...logs, ...dataRes.data])
      setHasMore((reset ? 0 : logs.length) + dataRes.data.length < (countRes.count ?? 0))
    }
    setLoading(false)
    setLoadingMore(false)
  }, [activeDataset])

  useEffect(() => {
    setLogs([])
    setHasMore(true)
    loadLogs(true)
  }, [loadLogs])

  const filtered = logs.filter((l) => {
    // Status filter
    if (statusFilter === 'reverted' && !l.reverted_at) return false
    if (statusFilter === 'manual' && (!l.is_manual || l.reverted_at)) return false
    if (statusFilter === 'scan' && (l.is_manual || l.reverted_at)) return false
    // Text search
    if (search) {
      const q = search.toLowerCase()
      return (
        (l.found_by_name?.toLowerCase().includes(q) ?? false) ||
        (l.material_no?.toLowerCase().includes(q) ?? false) ||
        (l.material_description?.toLowerCase().includes(q) ?? false) ||
        (l.storage_unit?.toLowerCase().includes(q) ?? false) ||
        (l.storage_bin?.toLowerCase().includes(q) ?? false) ||
        (l.batch?.toLowerCase().includes(q) ?? false)
      )
    }
    return true
  })

  function formatDate(t: string) {
    const d = new Date(t)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) {
      return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const counts = {
    all: totalCount,
    scan: logs.filter((l) => !l.is_manual && !l.reverted_at).length,
    manual: logs.filter((l) => l.is_manual && !l.reverted_at).length,
    reverted: logs.filter((l) => l.reverted_at).length,
  }

  if (!activeDataset) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-sm text-muted">Select a dataset to view history.</p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3 max-w-screen-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">History</h1>
        <span className="text-[11px] text-muted">{counts.all} events</span>
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search storage unit, material, user, batch..."
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-surface-light border border-border text-white text-xs placeholder:text-muted/50 focus:outline-none focus:border-accent"
        />
        {search && (
          <button onPointerDown={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Status filter */}
      <div className="flex gap-1.5 flex-wrap">
        {(Object.entries(counts) as [StatusFilter, number][]).map(([f, c]) => (
          <button
            key={f}
            onPointerDown={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.96] ${
              statusFilter === f
                ? 'bg-accent text-surface shadow-sm'
                : 'bg-surface-light text-muted border border-border hover:text-white hover:border-accent/50'
            }`}
          >
            {f === 'all' && `All`}
            {f === 'scan' && 'Scan'}
            {f === 'manual' && 'Manual'}
            {f === 'reverted' && 'Reverted'}
            <span className="ml-1 opacity-60">{c}</span>
          </button>
        ))}
      </div>

      {search && (
        <div className="text-[11px] text-muted">
          Showing <span className="text-white font-medium">{filtered.length}</span> of{" "}
          <span className="text-white font-medium">{totalCount}</span> events
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted">
          {search ? 'No results match your search.' : 'No items found yet.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((log) => {
            const isReverted = !!log.reverted_at
            return (
              <div
                key={log.id}
                className={`flex items-start gap-2.5 px-3 py-2.5 rounded-2xl border ${
                  isReverted
                    ? 'bg-surface-lighter/50 border-negative/15 opacity-60'
                    : 'bg-surface-light border-border'
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                    isReverted
                      ? 'bg-negative'
                      : log.is_manual
                        ? 'bg-warning'
                        : 'bg-positive'
                  } ${isReverted ? '' : 'shadow-[0_0_6px_rgba(34,197,94,0.4)]'}`}
                />

                <div className="flex-1 min-w-0 space-y-1">
                  {/* Storage Unit + badges */}
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-semibold ${isReverted ? 'text-muted line-through' : 'text-white'}`}>
                      {highlightLast5(log.storage_unit)}
                    </span>
                    {log.storage_bin && !isReverted && (
                      <span className="text-[10px] text-muted bg-surface-lighter px-1.5 py-0.5 rounded">{log.storage_bin}</span>
                    )}
                    {log.is_manual && !isReverted && (
                      <span className="text-[10px] text-warning font-medium">manual</span>
                    )}
                    {isReverted && (
                      <span className="text-[10px] text-negative font-medium bg-negative/10 px-1.5 py-0.5 rounded">Reverted</span>
                    )}
                  </div>

                  {/* Material */}
                  <div className={`text-xs truncate ${isReverted ? 'text-muted line-through' : 'text-white'}`}>
                    {log.material_no}
                    {log.material_description && (
                      <span className="text-muted ml-1">— {log.material_description}</span>
                    )}
                  </div>

                  {/* Batch + tags */}
                  <div className="flex items-center gap-2 text-[10px] text-muted flex-wrap">
                    {log.batch && !isReverted && (
                      <span className="bg-surface-lighter px-1.5 py-0.5 rounded">Batch: {log.batch}</span>
                    )}
                    {!!log.quantity && !isReverted && (
                      <span className="bg-surface-lighter px-1.5 py-0.5 rounded">
                        Qty: {log.quantity}{log.unit_of_quantity ? ` ${log.unit_of_quantity}` : ''}
                      </span>
                    )}
                  </div>

                  {/* Found by + timestamp + revert time */}
                  <div className="flex items-center gap-2 text-[10px] flex-wrap">
                    <span className={`font-medium ${isReverted ? 'text-negative' : 'text-accent'}`}>
                      {log.found_by_name}
                    </span>
                    <span className="text-muted">{formatDate(log.created_at)}</span>
                    {isReverted && log.reverted_at && (
                      <span className="text-negative/70">
                        reverted {formatDate(log.reverted_at)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {/* Load more */}
          {hasMore && !search && (
            <button
              onPointerDown={() => loadLogs(false)}
              disabled={loadingMore}
              className="w-full py-3 rounded-2xl bg-surface-light border border-border text-xs text-muted hover:text-white hover:border-accent/30 transition-colors font-medium disabled:opacity-50"
            >
              {loadingMore ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  Loading...
                </span>
              ) : (
                `Load more (${totalCount - logs.length} remaining)`
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
