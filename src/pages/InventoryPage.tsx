import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { offlineInsert, isOnline } from '../lib/offline'
import { revertFoundLog } from '../lib/revert'
import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'
import type { ItemWithStatus } from '../types'

export default function InventoryPage() {
  const [items, setItems] = useState<ItemWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<ItemWithStatus[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'found' | 'pending'>('all')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const user = useAuthStore((s) => s.user)
  const activeDataset = useAppStore((s) => s.activeDataset)
  const datasetId = activeDataset?.id

  const loadItems = useCallback(async () => {
    if (!datasetId) {
      setLoading(false)
      return
    }

    setLoading(true)

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
      const itemIds = itemsRes.data.map((i) => i.id)
      const logsRes = await supabase
        .from('found_logs')
        .select('id,item_id,found_by_name,created_at')
        .in('item_id', itemIds)
      const logMap = new Map(logsRes.data?.map((l) => [l.item_id, l]) ?? [])

      const merged: ItemWithStatus[] = itemsRes.data.map((item) => {
        const log = logMap.get(item.id)
        return {
          id: item.id,
          dataset_id: item.dataset_id,
          storage_unit: item.storage_unit,
          storage_bin: item.storage_bin,
          storage_type: item.storage_type,
          material_no: item.material_no,
          material_description: item.material_description,
          batch: item.batch,
          quantity: item.quantity,
          unit_of_quantity: item.unit_of_quantity,
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'found_logs' }, () => loadItems())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'found_logs' }, () => loadItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [datasetId, loadItems])

  async function handleToggle(item: ItemWithStatus) {
    if (!datasetId || !user || togglingId) return
    setTogglingId(item.id)

    if (item.found_at) {
      // Uncheck — revert
      if (item.found_log_id) {
        await revertFoundLog(item.found_log_id)
      } else {
        // Fallback: delete by item_id
        await supabase.from('found_logs').delete().eq('item_id', item.id)
      }
    } else {
      // Check — mark as found
      const payload = {
        item_id: item.id,
        dataset_id: datasetId,
        found_by: user.id,
        found_by_name: user.display_name,
        material_no: item.material_no,
        material_description: item.material_description,
        storage_unit: item.storage_unit,
        storage_bin: item.storage_bin,
        batch: item.batch,
        is_manual: false,
      }
      await offlineInsert('found_logs', payload)
    }

    setTogglingId(null)
    loadItems()
  }

  function handleExport() {
    const rows = items.map((item) => ({
      'Storage Unit': item.storage_unit,
      'Storage Bin': item.storage_bin,
      'Storage Type': item.storage_type,
      'Material No': item.material_no,
      'Material Description': item.material_description,
      Batch: item.batch,
      Quantity: item.quantity,
      'Unit of Qty': item.unit_of_quantity,
      Status: item.found_at ? 'Found' : 'Pending',
      'Found By': item.found_by_name || '',
      'Found At': item.found_at ? new Date(item.found_at).toLocaleString() : '',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
    XLSX.writeFile(wb, `stocktake-${activeDataset?.name || 'export'}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const query = search.trim()

  // Server-side search when query changes
  useEffect(() => {
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
      if (itemsData) {
        const itemIds = itemsData.map((i) => i.id)
        const { data: logsData } = await supabase
          .from('found_logs')
          .select('id,item_id,found_by_name,created_at')
          .in('item_id', itemIds)
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
              onPointerDown={handleExport}
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
                  disabled={isToggling}
                  className="shrink-0 active:scale-90 transition-transform disabled:opacity-50"
                >
                  <AnimatePresence mode="wait">
                    {isFound ? (
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
              </motion.div>
            )
          })}

        </div>
      ) : null}
    </div>
  )
}
