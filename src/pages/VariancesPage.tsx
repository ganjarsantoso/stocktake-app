import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import type { Item, FoundLog, Variance, VarianceWithItem } from '../types'

const ROOT_CAUSES = [
  'Unposted goods receipt / goods issue in SAP',
  'Wrong movement type used',
  'Double issuance of material',
  'Misplacement in wrong bin / storage location',
  'Wrong picking (similar material/packaging)',
  'Unrecorded sample taken (QA/R&D/Production)',
  'Damaged/scrapped without scrapping document',
  'Stock transfer in transit not received',
  'Production backflush failure',
  'Miscount during physical inventory',
  'Unit of Measure (UoM) confusion',
  'Wrong material master / BOM setup',
  'Supplier short-shipment (GR vs actual)',
  'Theft or pilferage',
  'Unauthorized issuance without approval',
  'Cut-off error during stock take',
  'Backdated postings',
  'Returns not booked back to stock',
  'Duplicate material codes',
  'Batch management error',
  'Other',
]

type TypeFilter = 'all' | 'missing' | 'extra'
type StatusFilter = 'all' | 'investigating' | 'resolved'

interface DetectedVariance {
  key: string
  variance_type: 'missing' | 'extra'
  item?: Item
  found_log?: FoundLog
}

export default function VariancesPage() {
  const [loading, setLoading] = useState(true)
  const [variances, setVariances] = useState<VarianceWithItem[]>([])
  const [allItems, setAllItems] = useState<Item[]>([])
  const [allLogs, setAllLogs] = useState<FoundLog[]>([])
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [investigating, setInvestigating] = useState<VarianceWithItem | null>(null)
  const [formStatus, setFormStatus] = useState<Variance['status']>('investigating')
  const [formRootCause, setFormRootCause] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formAssignedTo, setFormAssignedTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState<DetectedVariance | null>(null)
  const [users, setUsers] = useState<{ id: string; display_name: string }[]>([])
  const activeDataset = useAppStore((s) => s.activeDataset)
  const user = useAuthStore((s) => s.user)

  const loadData = useCallback(async () => {
    if (!activeDataset) return
    setLoading(true)

    const [itemsRes, logsRes, variancesRes, usersRes] = await Promise.all([
      supabase
        .from('items')
        .select('*')
        .eq('dataset_id', activeDataset.id),
      supabase
        .from('found_logs')
        .select('*')
        .eq('dataset_id', activeDataset.id)
        .is('reverted_at', null),
      supabase
        .from('variances')
        .select('*')
        .eq('dataset_id', activeDataset.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('users')
        .select('id, display_name'),
    ])

    const items = itemsRes.data ?? []
    const logs = logsRes.data ?? []
    const existingVariances = variancesRes.data ?? []
    const allUsers = usersRes.data ?? []

    setAllItems(items)
    setAllLogs(logs)
    setUsers(allUsers)

    const itemMap = new Map(items.map((i) => [i.id, i]))
    const userMap = new Map(allUsers.map((u) => [u.id, u.display_name]))

    const merged: VarianceWithItem[] = existingVariances.map((v) => ({
      ...v,
      item: v.item_id ? itemMap.get(v.item_id) ?? undefined : undefined,
      found_log: v.found_log_id ? logs.find((l) => l.id === v.found_log_id) ?? undefined : undefined,
      assigned_to_name: v.assigned_to ? userMap.get(v.assigned_to) ?? undefined : undefined,
      created_by_name: v.created_by ? userMap.get(v.created_by) ?? undefined : undefined,
    }))

    setVariances(merged)
    setLoading(false)
  }, [activeDataset])

  useEffect(() => {
    loadData()
  }, [loadData])

  const detectedVariances = useMemo(() => {
    const logItemIds = new Set(allLogs.filter((l) => l.item_id).map((l) => l.item_id))
    const missing: DetectedVariance[] = allItems
      .filter((item) => !logItemIds.has(item.id))
      .map((item) => ({ key: `missing-${item.id}`, variance_type: 'missing' as const, item }))

    const extra: DetectedVariance[] = allLogs
      .filter((log) => !log.item_id)
      .map((log) => ({ key: `extra-${log.id}`, variance_type: 'extra' as const, found_log: log }))

    return [...missing, ...extra]
  }, [allItems, allLogs])

  const hasInvestigation = useCallback(
    (dv: DetectedVariance) => {
      return variances.some((v) => {
        if (dv.variance_type === 'missing' && dv.item) return v.item_id === dv.item.id && v.variance_type === 'missing'
        if (dv.variance_type === 'extra' && dv.found_log) return v.found_log_id === dv.found_log.id && v.variance_type === 'extra'
        return false
      })
    },
    [variances]
  )

  const getInvestigation = useCallback(
    (dv: DetectedVariance) => {
      return variances.find((v) => {
        if (dv.variance_type === 'missing' && dv.item) return v.item_id === dv.item.id && v.variance_type === 'missing'
        if (dv.variance_type === 'extra' && dv.found_log) return v.found_log_id === dv.found_log.id && v.variance_type === 'extra'
        return false
      }) ?? null
    },
    [variances]
  )

  const filtered = useMemo(() => {
    let result = variances

    if (typeFilter !== 'all') result = result.filter((v) => v.variance_type === typeFilter)
    if (statusFilter !== 'all') result = result.filter((v) => v.status === statusFilter)

    if (search) {
      const q = search.toLowerCase()
      result = result.filter((v) => {
        const itemFields = v.item
          ? `${v.item.storage_unit} ${v.item.material_no} ${v.item.material_description} ${v.item.storage_bin} ${v.item.batch}`.toLowerCase()
          : ''
        const logFields = v.found_log
          ? `${v.found_log.storage_unit} ${v.found_log.material_no} ${v.found_log.material_description} ${v.found_log.storage_bin} ${v.found_log.batch}`.toLowerCase()
          : ''
        return itemFields.includes(q) || logFields.includes(q) || v.root_cause?.toLowerCase().includes(q) || v.notes?.toLowerCase().includes(q)
      })
    }

    return result
  }, [variances, typeFilter, statusFilter, search])

  const counts = useMemo(() => ({
    total: variances.length,
    investigating: variances.filter((v) => v.status === 'investigating').length,
    resolved: variances.filter((v) => v.status === 'resolved').length,
    missing: variances.filter((v) => v.variance_type === 'missing').length,
    extra: variances.filter((v) => v.variance_type === 'extra').length,
    detectedMissing: detectedVariances.filter((d) => d.variance_type === 'missing').length,
    detectedExtra: detectedVariances.filter((d) => d.variance_type === 'extra').length,
  }), [variances, detectedVariances])

  function openInvestigation(dv: DetectedVariance) {
    const existing = getInvestigation(dv)
    if (existing) {
      setInvestigating({ ...existing })
      setFormStatus(existing.status)
      setFormRootCause(existing.root_cause ?? '')
      setFormNotes(existing.notes ?? '')
      setFormAssignedTo(existing.assigned_to ?? '')
    } else {
      const base: VarianceWithItem = {
        id: '',
        dataset_id: activeDataset!.id,
        item_id: dv.item?.id ?? null,
        found_log_id: dv.found_log?.id ?? null,
        variance_type: dv.variance_type,
        status: 'investigating',
        root_cause: null,
        notes: null,
        assigned_to: null,
        created_by: user?.id ?? null,
        created_at: '',
        updated_at: '',
        resolved_at: null,
        item: dv.item,
        found_log: dv.found_log,
      }
      setInvestigating(base)
      setFormStatus('open')
      setFormRootCause('')
      setFormNotes('')
      setFormAssignedTo('')
    }
  }

  async function saveInvestigation() {
    if (!investigating || !activeDataset) return
    setSaving(true)

    try {
      const now = new Date().toISOString()
      const isResolved = formStatus === 'resolved'
      const wasResolved = investigating.status === 'resolved'

      const isNew = !investigating.id
      const payload = {
        dataset_id: activeDataset.id,
        item_id: investigating.item_id,
        found_log_id: investigating.found_log_id,
        variance_type: investigating.variance_type,
        status: formStatus,
        root_cause: formRootCause || null,
        notes: formNotes || null,
        assigned_to: formAssignedTo || null,
        updated_at: now,
        resolved_at: isResolved && !wasResolved ? now : investigating.resolved_at,
        created_by: isNew ? user?.id : undefined,
      }

      if (isNew) {
        await supabase.from('variances').insert(payload)
      } else {
        const { created_by: _, ...updatePayload } = payload
        await supabase.from('variances').update(updatePayload).eq('id', investigating.id)
      }

      setInvestigating(null)
      loadData()
    } finally {
      setSaving(false)
    }
  }

  async function createFromModal() {
    if (!showCreateModal || !activeDataset) return
    setSaving(true)

    try {
      await supabase.from('variances').insert({
        dataset_id: activeDataset.id,
        item_id: showCreateModal.item?.id ?? null,
        found_log_id: showCreateModal.found_log?.id ?? null,
        variance_type: showCreateModal.variance_type,
        status: 'investigating',
        created_by: user?.id,
      })
      setShowCreateModal(null)
      loadData()
    } finally {
      setSaving(false)
    }
  }

  function formatDate(t: string) {
    const d = new Date(t)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  if (!activeDataset) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-sm text-muted">Select a dataset to view variances.</p>
      </div>
    )
  }

  return (
    <div className="max-w-screen-lg mx-auto space-y-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Variances</h1>
        <span className="text-[11px] text-muted">{counts.total} tracked</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-light rounded-xl p-2.5 border border-border text-center">
          <div className="text-lg font-bold text-accent">{counts.investigating}</div>
          <div className="text-[10px] text-muted">Investigating</div>
        </div>
        <div className="bg-surface-light rounded-xl p-2.5 border border-border text-center">
          <div className="text-lg font-bold text-positive">{counts.resolved}</div>
          <div className="text-[10px] text-muted">Resolved</div>
        </div>
        <div className="bg-surface-light rounded-xl p-2.5 border border-border text-center">
          <div className="text-lg font-bold text-white">{counts.detectedMissing + counts.detectedExtra}</div>
          <div className="text-[10px] text-muted">Detected</div>
        </div>
      </div>

      {/* Detected but untracked variances */}
      {detectedVariances.filter((dv) => !hasInvestigation(dv)).length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-warning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {detectedVariances.filter((dv) => !hasInvestigation(dv)).length} untracked variances need investigation
          </div>
          <div className="flex flex-wrap gap-1.5">
            {detectedVariances
              .filter((dv) => !hasInvestigation(dv))
              .slice(0, 6)
              .map((dv) => (
                <button
                  key={dv.key}
                  onPointerDown={() => setShowCreateModal(dv)}
                  className="px-2.5 py-1 rounded-full bg-surface-light border border-border text-[11px] text-white hover:border-warning/50 transition-colors"
                >
                  {dv.variance_type === 'missing' ? '○' : '●'}{' '}
                  {dv.item?.storage_unit || dv.found_log?.storage_unit || 'Unknown'}
                </button>
              ))}
            {detectedVariances.filter((dv) => !hasInvestigation(dv)).length > 6 && (
              <span className="px-2.5 py-1 text-[11px] text-muted">
                +{detectedVariances.filter((dv) => !hasInvestigation(dv)).length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search storage unit, material, root cause..."
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

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        <div className="flex gap-1">
          {(['all', 'missing', 'extra'] as const).map((f) => (
            <button
              key={f}
              onPointerDown={() => setTypeFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.96] ${
                typeFilter === f
                  ? 'bg-accent text-surface shadow-sm'
                  : 'bg-surface-light text-muted border border-border hover:text-white hover:border-accent/50'
              }`}
            >
              {f === 'all' && 'All Types'}
              {f === 'missing' && '○ Missing'}
              {f === 'extra' && '● Extra'}
            </button>
          ))}
        </div>
        <div className="w-px h-6 bg-border self-center" />
        <div className="flex gap-1">
          {(['all', 'investigating', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onPointerDown={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                statusFilter === f
                  ? 'bg-accent text-surface'
                  : 'bg-surface-lighter text-muted border border-border hover:text-white'
              }`}
            >
              {f === 'investigating' && 'Investigating'}
              {f === 'resolved' && 'Resolved'}
              {f === 'all' && 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Variance list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted">
          {search || typeFilter !== 'all' || statusFilter !== 'all'
            ? 'No variances match your filters.'
            : 'No variance investigations yet. Detected variances will appear above.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((v) => {
            const itemInfo = v.item ?? v.found_log
            const statusColor = v.status === 'resolved' ? 'text-positive' : 'text-accent'
            const statusBg = v.status === 'resolved' ? 'bg-positive/10' : 'bg-accent/10'

            return (
              <motion.div
                key={v.id}
                layout
                className="bg-surface-light rounded-2xl border border-border px-3 py-2.5"
              >
                <div className="flex items-start gap-2.5">
                  {/* Type indicator */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    v.variance_type === 'missing' ? 'bg-warning/15' : 'bg-negative/15'
                  }`}>
                    <span className={`text-xs font-bold ${v.variance_type === 'missing' ? 'text-warning' : 'text-negative'}`}>
                      {v.variance_type === 'missing' ? '○' : '●'}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-white">
                        {itemInfo?.storage_unit ?? 'Unknown'}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        v.variance_type === 'missing' ? 'bg-warning/15 text-warning' : 'bg-negative/15 text-negative'
                      }`}>
                        {v.variance_type}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusBg} ${statusColor}`}>
                        {v.status}
                      </span>
                    </div>

                    {itemInfo && (
                      <div className="text-xs text-white truncate">
                        {itemInfo.material_no}
                        {'material_description' in itemInfo && itemInfo.material_description && (
                          <span className="text-muted ml-1">— {itemInfo.material_description}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
                      {v.root_cause && <span>Root cause: {v.root_cause}</span>}
                      {v.assigned_to_name && <span>Assigned: {v.assigned_to_name}</span>}
                      {v.created_by_name && <span>by {v.created_by_name}</span>}
                      <span>{formatDate(v.created_at)}</span>
                    </div>

                    {v.notes && (
                      <div className="text-[11px] text-muted italic truncate">{v.notes}</div>
                    )}
                  </div>

                  {/* Action */}
                  <button
                    onPointerDown={() => openInvestigation({ key: v.id, variance_type: v.variance_type, item: v.item, found_log: v.found_log })}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg bg-surface-lighter border border-border text-[11px] text-muted hover:text-white hover:border-accent/50 transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Investigation Panel */}
      <AnimatePresence>
        {investigating && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
            onPointerDown={() => setInvestigating(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold">
                  {investigating.id ? 'Edit Investigation' : 'New Investigation'}
                </h3>
                <button onPointerDown={() => setInvestigating(null)} className="text-muted hover:text-white">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Item info */}
              <div className="bg-surface-light rounded-xl p-3 border border-border mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    investigating.variance_type === 'missing' ? 'bg-warning/15 text-warning' : 'bg-negative/15 text-negative'
                  }`}>
                    {investigating.variance_type}
                  </span>
                  <span className="text-xs font-mono font-semibold text-white">
                    {investigating.item?.storage_unit || investigating.found_log?.storage_unit || 'Unknown'}
                  </span>
                </div>
                <div className="text-xs text-white">
                  {investigating.item?.material_no || investigating.found_log?.material_no}
                  {(investigating.item?.material_description || investigating.found_log?.material_description) && (
                    <span className="text-muted ml-1">
                      — {investigating.item?.material_description || investigating.found_log?.material_description}
                    </span>
                  )}
                </div>
                {(investigating.item?.batch || investigating.found_log?.batch) && (
                  <div className="text-[11px] text-muted mt-1">
                    Batch: {investigating.item?.batch || investigating.found_log?.batch}
                  </div>
                )}
              </div>

              {/* Form or Read-only view */}
              {investigating.status === 'resolved' && (
                <div className="space-y-3">
                  <div className="bg-positive/10 border border-positive/20 rounded-xl p-3 text-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-positive mx-auto mb-1">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <div className="text-xs font-semibold text-positive">Resolved</div>
                    {investigating.resolved_at && (
                      <div className="text-[10px] text-muted mt-0.5">
                        {new Date(investigating.resolved_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                  {investigating.root_cause && (
                    <div>
                      <label className="text-[11px] text-muted font-medium uppercase tracking-wider block mb-1">Root Cause</label>
                      <div className="text-xs text-white bg-surface-light rounded-xl px-3 py-2.5 border border-border">{investigating.root_cause}</div>
                    </div>
                  )}
                  {investigating.assigned_to && (
                    <div>
                      <label className="text-[11px] text-muted font-medium uppercase tracking-wider block mb-1">Assigned To</label>
                      <div className="text-xs text-white bg-surface-light rounded-xl px-3 py-2.5 border border-border">
                        {users.find((u) => u.id === investigating.assigned_to)?.display_name || investigating.assigned_to}
                      </div>
                    </div>
                  )}
                  {investigating.notes && (
                    <div>
                      <label className="text-[11px] text-muted font-medium uppercase tracking-wider block mb-1">Notes</label>
                      <div className="text-xs text-white bg-surface-light rounded-xl px-3 py-2.5 border border-border whitespace-pre-wrap">{investigating.notes}</div>
                    </div>
                  )}
                  <button
                    onPointerDown={() => setInvestigating(null)}
                    className="w-full py-2.5 rounded-xl text-xs font-medium text-muted bg-surface-lighter border border-border hover:text-white transition-colors mt-3"
                  >
                    Close
                  </button>
                </div>
              )}
              {investigating.status !== 'resolved' && (
                <div className="space-y-3">
                  {/* Status */}
                <div>
                  <label className="text-[11px] text-muted font-medium uppercase tracking-wider block mb-1.5">Status</label>
                  <div className="flex gap-1.5">
                    {(['investigating', 'resolved'] as const).map((s) => (
                      <button
                        key={s}
                        onPointerDown={() => setFormStatus(s)}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                          formStatus === s
                            ? s === 'resolved' ? 'bg-positive text-surface' : 'bg-accent text-surface'
                            : 'bg-surface-lighter text-muted border border-border'
                        }`}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Root Cause */}
                <div>
                  <label className="text-[11px] text-muted font-medium uppercase tracking-wider block mb-1.5">Root Cause</label>
                  <select
                    value={formRootCause}
                    onChange={(e) => setFormRootCause(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-lighter border border-border text-white text-xs focus:outline-none focus:border-accent"
                  >
                    <option value="">Select root cause...</option>
                    {ROOT_CAUSES.map((rc) => (
                      <option key={rc} value={rc}>{rc}</option>
                    ))}
                  </select>
                </div>

                {/* Assigned To */}
                <div>
                  <label className="text-[11px] text-muted font-medium uppercase tracking-wider block mb-1.5">Assigned To</label>
                  <select
                    value={formAssignedTo}
                    onChange={(e) => setFormAssignedTo(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-lighter border border-border text-white text-xs focus:outline-none focus:border-accent"
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.display_name}</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-[11px] text-muted font-medium uppercase tracking-wider block mb-1.5">Notes</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Add investigation notes..."
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-lighter border border-border text-white text-xs placeholder:text-muted/50 focus:outline-none focus:border-accent resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onPointerDown={() => setInvestigating(null)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-medium text-muted bg-surface-lighter border border-border hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onPointerDown={saveInvestigation}
                    disabled={saving}
                    className="flex-[2] py-2.5 rounded-xl text-xs font-semibold text-surface bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {saving ? (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {investigating.id ? 'Update' : 'Create Investigation'}
                      </>
                    )}
                  </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onPointerDown={() => setShowCreateModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface border border-border rounded-2xl p-5 max-w-sm w-full shadow-2xl"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold mb-3">Create Investigation</h3>
              <div className="bg-surface-light rounded-xl p-3 border border-border mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    showCreateModal.variance_type === 'missing' ? 'bg-warning/15 text-warning' : 'bg-negative/15 text-negative'
                  }`}>
                    {showCreateModal.variance_type}
                  </span>
                  <span className="text-xs font-mono font-semibold text-white">
                    {showCreateModal.item?.storage_unit || showCreateModal.found_log?.storage_unit || 'Unknown'}
                  </span>
                </div>
                <div className="text-xs text-white">
                  {showCreateModal.item?.material_no || showCreateModal.found_log?.material_no}
                  {(showCreateModal.item?.material_description || showCreateModal.found_log?.material_description) && (
                    <span className="text-muted ml-1">
                      — {showCreateModal.item?.material_description || showCreateModal.found_log?.material_description}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onPointerDown={() => setShowCreateModal(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium text-muted bg-surface-lighter border border-border hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onPointerDown={createFromModal}
                  disabled={saving}
                  className="flex-[2] py-2.5 rounded-xl text-xs font-semibold text-surface bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Create'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
