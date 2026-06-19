import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { offlineInsert, isOnline } from '../lib/offline'
import { revertFoundLog } from '../lib/revert'
import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'
import type { ItemWithStatus } from '../types'
import { useNavigate } from 'react-router-dom'

export default function InventoryPage() {
  const [items, setItems] = useState<ItemWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<ItemWithStatus[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'found' | 'pending'>('all')
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportColumns, setExportColumns] = useState([
    { key: 'storage_type', label: 'Storage Type', enabled: true },
    { key: 'storage_bin', label: 'Storage Bin', enabled: true },
    { key: 'material_no', label: 'Material No', enabled: true },
    { key: 'material_description', label: 'Material Description', enabled: true },
    { key: 'batch', label: 'Batch', enabled: true },
    { key: 'storage_unit', label: 'Storage Unit', enabled: true },
    { key: 'quantity', label: 'Quantity', enabled: true },
    { key: 'unit_of_quantity', label: 'Unit of Qty', enabled: true },
    { key: 'status', label: 'Status', enabled: true },
    { key: 'found_by', label: 'Found By', enabled: true },
    { key: 'found_at', label: 'Found At', enabled: true },
  ])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchQueryRef = useRef('')
  const [flaggingItem, setFlaggingItem] = useState<ItemWithStatus | null>(null)
  const [flagging, setFlagging] = useState(false)
  const [flaggedItemIds, setFlaggedItemIds] = useState<Set<string>>(new Set())
  const [resolvedItemIds, setResolvedItemIds] = useState<Set<string>>(new Set())
  const [showBlockedItem, setShowBlockedItem] = useState<ItemWithStatus | null>(null)
  const [showResolvedItem, setShowResolvedItem] = useState<ItemWithStatus | null>(null)
  const [resolvedVarianceDetails, setResolvedVarianceDetails] = useState<Record<string, {
    root_cause: string | null
    notes: string | null
    assigned_to_name: string | null
    resolved_at: string | null
  }>>({})
  const user = useAuthStore((s) => s.user)
  const activeDataset = useAppStore((s) => s.activeDataset)
  const datasetId = activeDataset?.id
  const navigate = useNavigate()

  const loadItems = useCallback(async () => {
    if (!datasetId) {
      setLoading(false)
      return
    }

    const countRes = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('dataset_id', datasetId)
    if (countRes.count !== null) setTotalCount(countRes.count)

    const itemsRes = await supabase
      .from('items')
      .select('id,dataset_id,storage_unit,storage_bin,storage_type,material_no,material_description,batch,quantity,unit_of_quantity')
      .eq('dataset_id', datasetId)
      .order('storage_unit')

    if (itemsRes.data && itemsRes.data.length > 0) {
      const logsRes = await supabase
        .from('found_logs')
        .select('id,item_id,found_by_name,created_at')
        .eq('dataset_id', datasetId)
        .is('reverted_at', null)
        .not('item_id', 'is', null)
      const logMap = new Map(logsRes.data?.map((l) => [l.item_id, l]) ?? [])

      const [variancesRes, usersRes] = await Promise.all([
        supabase
          .from('variances')
          .select('id, item_id, status, root_cause, notes, assigned_to, resolved_at')
          .eq('dataset_id', datasetId)
          .not('item_id', 'is', null),
        supabase
          .from('users')
          .select('id, display_name'),
      ])
      const allUsers = usersRes.data ?? []
      const userMap = new Map(allUsers.map((u) => [u.id, u.display_name]))

      const activeSet = new Set(
        variancesRes.data?.filter((v) => v.status !== 'resolved').map((v) => v.item_id) ?? []
      )
      const resolvedSet = new Set(
        variancesRes.data?.filter((v) => v.status === 'resolved').map((v) => v.item_id) ?? []
      )
      const resolvedDetails: Record<string, { root_cause: string | null; notes: string | null; assigned_to_name: string | null; resolved_at: string | null }> = {}
      for (const v of variancesRes.data ?? []) {
        if (v.status === 'resolved' && v.item_id) {
          resolvedDetails[v.item_id] = {
            root_cause: v.root_cause,
            notes: v.notes,
            assigned_to_name: v.assigned_to ? userMap.get(v.assigned_to) ?? null : null,
            resolved_at: v.resolved_at,
          }
        }
      }
      setFlaggedItemIds(activeSet)
      setResolvedItemIds(resolvedSet)
      setResolvedVarianceDetails(resolvedDetails)

      const merged: ItemWithStatus[] = itemsRes.data.map((item) => {
        const log = logMap.get(item.id)
        return {
          ...item,
          found_by_name: log?.found_by_name ?? null,
          found_at: log?.created_at ?? null,
          found_log_id: log?.id ?? null,
        }
      })

      setItems(merged)
    } else {
      setItems([])
    }
    setLoading(false)
  }, [datasetId])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // Real-time: when a found_log is inserted/deleted/updated, reload
  useEffect(() => {
    const channel = supabase
      .channel('inventory-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'found_logs', filter: `dataset_id=eq.${datasetId}` }, () => loadItems())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'found_logs', filter: `dataset_id=eq.${datasetId}` }, () => loadItems())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'found_logs', filter: `dataset_id=eq.${datasetId}` }, () => loadItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [datasetId, loadItems])

  async function handleToggle(item: ItemWithStatus) {
    if (!datasetId || !user || togglingId) return
    if (!item.found_at && flaggedItemIds.has(item.id)) {
      setShowBlockedItem(item)
      return
    }
    if (!item.found_at && resolvedItemIds.has(item.id)) {
      setShowResolvedItem(item)
      return
    }
    setTogglingId(item.id)

    try {
      if (item.found_at) {
        const update = (prev: ItemWithStatus[]) => prev.map((i) =>
          i.id === item.id ? { ...i, found_by_name: null, found_at: null, found_log_id: null } : i
        )
        setItems(update)
        setSearchResults((prev) => prev !== null ? update(prev) : prev)
        if (item.found_log_id) {
          await revertFoundLog(item.found_log_id)
        } else {
          await supabase.from('found_logs').delete().eq('item_id', item.id)
        }
      } else {
        const now = new Date().toISOString()
        const update = (prev: ItemWithStatus[]) => prev.map((i) =>
          i.id === item.id ? { ...i, found_by_name: user.display_name, found_at: now } : i
        )
        setItems(update)
        setSearchResults((prev) => prev !== null ? update(prev) : prev)
        await offlineInsert('found_logs', {
          item_id: item.id,
          dataset_id: datasetId,
          found_by: user.id,
          found_by_name: user.display_name,
          material_no: item.material_no,
          material_description: item.material_description,
          storage_unit: item.storage_unit,
          storage_bin: item.storage_bin,
          batch: item.batch,
          quantity: item.quantity,
          unit_of_quantity: item.unit_of_quantity,
          is_manual: false,
        })
      }
    } finally {
      setTogglingId(null)
    }

    loadItems()
  }

  async function handleQuickCount(item: ItemWithStatus) {
    setShowResolvedItem(null)
    if (!datasetId || !user || togglingId) return
    setTogglingId(item.id)

    try {
      const now = new Date().toISOString()
      const update = (prev: ItemWithStatus[]) => prev.map((i) =>
        i.id === item.id ? { ...i, found_by_name: user.display_name, found_at: now } : i
      )
      setItems(update)
      setSearchResults((prev) => prev !== null ? update(prev) : prev)
      await offlineInsert('found_logs', {
        item_id: item.id,
        dataset_id: datasetId,
        found_by: user.id,
        found_by_name: user.display_name,
        material_no: item.material_no,
        material_description: item.material_description,
        storage_unit: item.storage_unit,
        storage_bin: item.storage_bin,
        batch: item.batch,
        quantity: item.quantity,
        unit_of_quantity: item.unit_of_quantity,
        is_manual: false,
      })
    } finally {
      setTogglingId(null)
    }

    loadItems()
  }

  function handleExport() {
    const enabled = exportColumns.filter((c) => c.enabled)
    const rowMap: Record<string, (item: ItemWithStatus) => string | number | null> = {
      storage_unit: (i) => i.storage_unit,
      storage_bin: (i) => i.storage_bin,
      storage_type: (i) => i.storage_type,
      material_no: (i) => i.material_no,
      material_description: (i) => i.material_description,
      batch: (i) => i.batch,
      quantity: (i) => i.quantity,
      unit_of_quantity: (i) => i.unit_of_quantity,
      status: (i) => (i.found_at ? 'Found' : 'Pending'),
      found_by: (i) => i.found_by_name || '',
      found_at: (i) => (i.found_at ? new Date(i.found_at).toLocaleString() : ''),
    }

    const rows = items.map((item) => {
      const row: Record<string, any> = {}
      for (const col of enabled) {
        row[col.label] = rowMap[col.key]?.(item) ?? ''
      }
      return row
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
    XLSX.writeFile(wb, `stocktake-${activeDataset?.name || 'export'}-${new Date().toISOString().slice(0, 10)}.xlsx`)
    setShowExportModal(false)
  }

  function toggleColumn(key: string) {
    setExportColumns((prev) => prev.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c)))
  }

  function moveColumn(index: number, direction: 'up' | 'down') {
    setExportColumns((prev) => {
      const next = [...prev]
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function handleDragStart(index: number) {
    setDragIndex(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    setExportColumns((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDragIndex(index)
  }

  function handleDragEnd() {
    setDragIndex(null)
  }

  const query = search.trim()

  // Server-side search when query changes
  useEffect(() => {
    searchQueryRef.current = query
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!query || !datasetId) {
      setSearchResults(null)
      return
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      const safe = query.replace(/[%_]/g, '\\$&')
      const pattern = `%${safe}%`
      const { data: itemsData } = await supabase
        .from('items')
        .select('id,dataset_id,storage_unit,storage_bin,storage_type,material_no,material_description,batch,quantity,unit_of_quantity')
        .eq('dataset_id', datasetId)
        .or(
          `storage_unit.ilike.${pattern},material_no.ilike.${pattern},material_description.ilike.${pattern},storage_bin.ilike.${pattern},batch.ilike.${pattern}`
        )
        .limit(200)
      if (itemsData && searchQueryRef.current === query) {
        const { data: logsData } = await supabase
          .from('found_logs')
          .select('id,item_id,found_by_name,created_at')
          .eq('dataset_id', datasetId)
          .is('reverted_at', null)
          .not('item_id', 'is', null)
        const logMap = new Map(logsData?.map((l) => [l.item_id, l]) ?? [])
        const merged: ItemWithStatus[] = itemsData.map((item) => {
          const log = logMap.get(item.id)
          return {
            ...item,
            found_by_name: log?.found_by_name ?? null,
            found_at: log?.created_at ?? null,
            found_log_id: log?.id ?? null,
          }
        })
        setSearchResults(merged)
      }
      setSearching(false)
    }, 200)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [query, datasetId])

  // Client-side filter for the paginated view (no search query)
  const filteredItems = useMemo(() => {
    let result = items
    if (statusFilter === 'found') result = result.filter((i) => i.found_at)
    else if (statusFilter === 'pending') result = result.filter((i) => !i.found_at)
    return result
  }, [items, statusFilter])

  // Display items: search results when query active, paginated items otherwise
  const displayItems = useMemo(() => {
    if (searchResults !== null) {
      let result = searchResults
      if (statusFilter === 'found') result = result.filter((i) => i.found_at)
      else if (statusFilter === 'pending') result = result.filter((i) => !i.found_at)
      return result
    }
    return filteredItems
  }, [searchResults, filteredItems, statusFilter])

  const summary = {
    total: totalCount,
    found: items.filter((i) => i.found_at).length,
    remaining: totalCount - items.filter((i) => i.found_at).length,
    filtered: displayItems.length,
    filteredFound: displayItems.filter((i) => i.found_at).length,
    loadedFound: items.filter((i) => i.found_at).length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-muted text-sm animate-pulse">Loading inventory...</div>
      </div>
    )
  }

  if (!datasetId) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-xs">
          <p className="text-xs text-muted">No dataset selected. Go to Dashboard first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-screen-lg mx-auto space-y-4 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Inventory</h1>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${!isOnline() ? 'bg-warning/15 text-warning' : 'bg-positive/15 text-positive'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline() ? 'bg-positive' : 'bg-warning'}`} />
            {isOnline() ? 'Online' : 'Offline'}
          </span>
          {items.length > 0 && (
            <button
              onPointerDown={() => setShowExportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-surface text-xs font-semibold active:scale-[0.97] transition-all"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 text-xs bg-surface-light rounded-2xl px-4 py-3 border border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full border-2 border-muted flex items-center justify-center">
            <span className="text-[10px] text-muted font-bold">{summary.remaining}</span>
          </div>
          <span className="text-muted">Remaining</span>
        </div>
        <div className="w-px h-6 bg-border" />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3 text-accent">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
            <span className="text-accent font-semibold">{summary.loadedFound}</span>
            <span className="text-muted">found / {summary.total} total</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search storage unit, material, bin..."
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-surface-light border border-border text-white text-xs placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors"
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

      {query && (
        <div className="text-[11px] text-muted">
          Showing <span className="text-white font-medium">{summary.filteredFound}</span> found /{" "}
          <span className="text-white font-medium">{summary.filtered}</span> of{" "}
          <span className="text-white font-medium">{summary.total}</span> items
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-1.5">
        {(['all', 'found', 'pending'] as const).map((f) => (
          <button
            key={f}
            onPointerDown={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.96] ${
              statusFilter === f
                ? 'bg-accent text-surface shadow-sm'
                : 'bg-surface-light text-muted border border-border hover:text-white hover:border-accent/50'
            }`}
          >
            {f === 'all' && 'All'}
            {f === 'found' && '✓ Counted'}
            {f === 'pending' && '○ Pending'}
          </button>
        ))}
      </div>

      {!isOnline() && (
        <div className="px-3 py-2 rounded-xl bg-warning/15 border border-warning/30 text-xs text-warning font-medium">
          Offline — changes are queued and will sync when connection returns
        </div>
      )}

      {searching && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted">
          <span className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Searching...
        </div>
      )}

      {displayItems.length === 0 && !loading ? (
        <div className="text-sm text-muted italic py-8 text-center">
          {query ? 'No items match your search.' : 'No inventory data. Upload an Excel dataset first.'}
        </div>
      ) : displayItems.length > 0 ? (
        <div className="space-y-1">
          {displayItems.map((item) => {
            const isFound = !!item.found_at
            const isToggling = togglingId === item.id
            return (
              <motion.div
                key={item.id}
                layout
                className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-colors ${
                  isFound
                    ? 'bg-positive/5 border-positive/20'
                    : 'bg-surface-light border-border hover:border-muted/30'
                }`}
              >
                {/* iPhone-style checkbox */}
                <button
                  onPointerDown={() => handleToggle(item)}
                  disabled={isToggling || (!isFound && flaggedItemIds.has(item.id))}
                  className={`shrink-0 active:scale-90 transition-transform disabled:opacity-50 group ${
                    !isFound && flaggedItemIds.has(item.id) ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}
                  title={
                    !isFound && flaggedItemIds.has(item.id)
                      ? 'Under investigation — resolve variance first'
                      : !isFound && resolvedItemIds.has(item.id)
                        ? 'Investigation resolved — ready to count'
                        : undefined
                  }
                >
                  <AnimatePresence mode="wait">
                    {isFound ? (
                      resolvedItemIds.has(item.id) ? (
                        <motion.div
                          key="checked-resolved"
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          className="w-6 h-6 rounded-full bg-positive flex items-center justify-center"
                        >
                          {isToggling ? (
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3.5 h-3.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="checked"
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          className="w-6 h-6 rounded-full bg-accent flex items-center justify-center"
                        >
                          {isToggling ? (
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3.5 h-3.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </motion.div>
                      )
                    ) : flaggedItemIds.has(item.id) ? (
                      <motion.div
                        key="flagged"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        className="w-6 h-6 rounded-full bg-warning/20 border-2 border-warning flex items-center justify-center"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3 text-warning">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </motion.div>
                    ) : resolvedItemIds.has(item.id) ? (
                      <motion.div
                        key="resolved-unchecked"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        className="w-6 h-6 rounded-full bg-positive/10 border-2 border-positive/60 flex items-center justify-center group-hover:bg-positive/20 group-hover:border-positive transition-colors"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-positive">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="unchecked"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        className="w-6 h-6 rounded-full border-2 border-muted flex items-center justify-center"
                      >
                        {isToggling && (
                          <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-white">{item.storage_unit}</span>
                    {item.storage_bin && (
                      <span className="text-[10px] text-muted bg-surface-lighter px-1.5 py-0.5 rounded">{item.storage_bin}</span>
                    )}
                    {item.storage_type && (
                      <span className="text-[10px] text-muted">{item.storage_type}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-white">{item.material_no}</span>
                    {item.material_description && (
                      <span className="text-muted truncate">{item.material_description}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted">
                    {item.batch && <span>Batch: {item.batch}</span>}
                    <span>Qty: {item.quantity ?? '—'}</span>
                    {item.unit_of_quantity && <span>{item.unit_of_quantity}</span>}
                    {isFound && item.found_by_name && (
                      <span className="text-accent">by {item.found_by_name}</span>
                    )}
                  </div>
                </div>

                {/* Flag indicator — right side */}
                {resolvedItemIds.has(item.id) ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-4 h-4 rounded-sm bg-positive/15 border border-positive/40 flex items-center justify-center" title="Investigation resolved">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-2.5 h-2.5 text-positive">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-positive/60">
                      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                      <line x1="4" y1="22" x2="4" y2="15" />
                    </svg>
                  </div>
                ) : flaggedItemIds.has(item.id) && !isFound ? (
                    <div className="w-9 h-9 rounded-full bg-warning/15 border border-warning/30 flex items-center justify-center shrink-0" title="Flagged for investigation">
                      <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" className="w-4 h-4 text-warning">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                        <line x1="4" y1="22" x2="4" y2="15" />
                      </svg>
                    </div>
                  ) : !isFound ? (
                    <button
                      onPointerDown={() => setFlaggingItem(item)}
                      className="w-9 h-9 rounded-full bg-surface-lighter border border-border flex items-center justify-center shrink-0 text-muted hover:text-warning hover:border-warning/50 hover:bg-warning/5 transition-colors active:scale-90"
                      title="Flag for variance investigation"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                        <line x1="4" y1="22" x2="4" y2="15" />
                      </svg>
                    </button>
                  ) : null
                }
              </motion.div>
            )
          })}

        </div>
      ) : null}

      {/* Export column picker modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onPointerDown={() => setShowExportModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface border border-border rounded-2xl p-5 max-w-sm w-full shadow-2xl max-h-[80vh] flex flex-col"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-white mb-1">Customize Export</h3>
            <p className="text-[11px] text-muted mb-4">Toggle columns and drag to reorder.</p>

            <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
              {exportColumns.map((col, index) => (
                <div
                  key={col.key}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors cursor-grab active:cursor-grabbing ${
                    dragIndex === index ? 'border-accent bg-accent/5' : 'border-border bg-surface-lighter'
                  }`}
                >
                  {/* Drag handle */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-muted shrink-0">
                    <line x1="8" y1="6" x2="16" y2="6" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                    <line x1="8" y1="18" x2="16" y2="18" />
                  </svg>

                  {/* Move up/down buttons (fallback for touch) */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onPointerDown={(e) => { e.stopPropagation(); moveColumn(index, 'up') }}
                      disabled={index === 0}
                      className="text-muted hover:text-white disabled:opacity-20 transition-colors leading-none"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                    <button
                      onPointerDown={(e) => { e.stopPropagation(); moveColumn(index, 'down') }}
                      disabled={index === exportColumns.length - 1}
                      className="text-muted hover:text-white disabled:opacity-20 transition-colors leading-none"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>

                  {/* Toggle */}
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); toggleColumn(col.key) }}
                    className={`w-9 h-5 rounded-full transition-colors shrink-0 relative border ${
                      col.enabled ? 'bg-accent border-accent' : 'bg-surface-lighter border-border'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      col.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>

                  <span className={`text-xs font-medium ${col.enabled ? 'text-white' : 'text-muted line-through'}`}>
                    {col.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t border-border">
              <button
                onPointerDown={() => setShowExportModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium text-muted bg-surface-lighter border border-border hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onPointerDown={handleExport}
                className="flex-[2] py-2.5 rounded-xl text-xs font-semibold text-surface bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export ({exportColumns.filter((c) => c.enabled).length} columns)
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Flag for investigation modal */}
      <AnimatePresence>
        {flaggingItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setFlaggingItem(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface border border-border rounded-2xl p-5 max-w-sm w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold mb-3">Flag for Investigation</h3>
              <div className="bg-surface-light rounded-xl p-3 border border-border mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning/15 text-warning">missing</span>
                  <span className="text-xs font-mono font-semibold text-white">{flaggingItem.storage_unit}</span>
                </div>
                <div className="text-xs text-white">
                  {flaggingItem.material_no}
                  {flaggingItem.material_description && (
                    <span className="text-muted ml-1">— {flaggingItem.material_description}</span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted mb-4">
                This item is in the dataset but was not found during count. Create a variance investigation to track it.
              </p>
              <div className="flex gap-2">
                <button
                  onPointerDown={() => setFlaggingItem(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium text-muted bg-surface-lighter border border-border hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!datasetId || !user || !flaggingItem) return
                    setFlagging(true)
                    const { error } = await supabase.from('variances').insert({
                      dataset_id: datasetId,
                      item_id: flaggingItem.id,
                      variance_type: 'missing',
                      status: 'investigating',
                      created_by: user.id,
                    })
                    setFlagging(false)
                    if (error) {
                      alert('Failed to create investigation: ' + error.message)
                      return
                    }
                    setFlaggingItem(null)
                    loadItems()
                  }}
                  disabled={flagging}
                  className="flex-[2] py-2.5 rounded-xl text-xs font-semibold text-surface bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {flagging ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                        <line x1="4" y1="22" x2="4" y2="15" />
                      </svg>
                      Flag & Investigate
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Blocked toggle modal */}
      <AnimatePresence>
        {showBlockedItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowBlockedItem(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface border border-border rounded-2xl p-5 max-w-sm w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-warning/15 flex items-center justify-center mx-auto mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-warning">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-center mb-1">Under Investigation</h3>
              <p className="text-[11px] text-muted text-center mb-4">
                This item is flagged for a variance investigation. Resolve or delete the investigation in the Variances page before marking it as found.
              </p>
              <div className="bg-surface-light rounded-xl p-3 border border-border mb-4 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Storage Unit</span>
                  <span className="text-white font-mono font-semibold">{showBlockedItem.storage_unit}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Material</span>
                  <span className="text-white">{showBlockedItem.material_no}</span>
                </div>
                {showBlockedItem.material_description && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Description</span>
                    <span className="text-white truncate max-w-[200px]">{showBlockedItem.material_description}</span>
                  </div>
                )}
                {showBlockedItem.batch && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Batch</span>
                    <span className="text-white">{showBlockedItem.batch}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBlockedItem(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium text-muted bg-surface-lighter border border-border hover:text-white transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => { setShowBlockedItem(null); navigate('/variances') }}
                  className="flex-[2] py-2.5 rounded-xl text-xs font-semibold text-surface bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all"
                >
                  Go to Variances
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Resolved item popup */}
      <AnimatePresence>
        {showResolvedItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowResolvedItem(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface border border-border rounded-2xl p-5 max-w-sm w-full shadow-2xl max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="w-12 h-12 rounded-full bg-positive/15 flex items-center justify-center mx-auto mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-positive">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-center mb-1">Investigation Resolved</h3>
              <p className="text-[11px] text-muted text-center mb-4">
                This item had a variance investigation that was already resolved.
              </p>

              {/* Resolved status detail */}
              {resolvedVarianceDetails[showResolvedItem.id] && (
                <div className="bg-positive/5 border border-positive/20 rounded-xl p-3 mb-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-positive font-semibold flex items-center gap-1">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Resolved
                    </span>
                    {resolvedVarianceDetails[showResolvedItem.id].resolved_at && (
                      <span className="text-muted text-[10px]">
                        {new Date(resolvedVarianceDetails[showResolvedItem.id].resolved_at!).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {resolvedVarianceDetails[showResolvedItem.id].root_cause && (
                    <div>
                      <span className="text-[10px] text-muted font-medium uppercase tracking-wider">Root Cause</span>
                      <p className="text-[11px] text-white mt-0.5">{resolvedVarianceDetails[showResolvedItem.id].root_cause}</p>
                    </div>
                  )}
                  {resolvedVarianceDetails[showResolvedItem.id].assigned_to_name && (
                    <div className="text-[11px] text-muted">
                      Assigned to: <span className="text-white">{resolvedVarianceDetails[showResolvedItem.id].assigned_to_name}</span>
                    </div>
                  )}
                  {resolvedVarianceDetails[showResolvedItem.id].notes && (
                    <div>
                      <span className="text-[10px] text-muted font-medium uppercase tracking-wider">Notes</span>
                      <p className="text-[11px] text-white mt-0.5 whitespace-pre-wrap">{resolvedVarianceDetails[showResolvedItem.id].notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Item details */}
              <div className="bg-surface-light rounded-xl p-3 border border-border mb-4 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Storage Unit</span>
                  <span className="text-white font-mono font-semibold">{showResolvedItem.storage_unit}</span>
                </div>
                {showResolvedItem.storage_bin && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Storage Bin</span>
                    <span className="text-white">{showResolvedItem.storage_bin}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Material</span>
                  <span className="text-white">{showResolvedItem.material_no}</span>
                </div>
                {showResolvedItem.material_description && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Description</span>
                    <span className="text-white truncate max-w-[200px]">{showResolvedItem.material_description}</span>
                  </div>
                )}
                {showResolvedItem.batch && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Batch</span>
                    <span className="text-white">{showResolvedItem.batch}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Quantity</span>
                  <span className="text-white">{showResolvedItem.quantity ?? '—'} {showResolvedItem.unit_of_quantity ?? ''}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResolvedItem(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium text-muted bg-surface-lighter border border-border hover:text-white transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => handleQuickCount(showResolvedItem)}
                  disabled={togglingId === showResolvedItem.id}
                  className="flex-[2] py-2.5 rounded-xl text-xs font-semibold text-surface bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {togglingId === showResolvedItem.id ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Count Item
                    </>
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
