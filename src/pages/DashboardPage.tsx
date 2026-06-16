import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../stores/appStore'
import { useThemeStore } from '../stores/themeStore'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { syncQueue, getQueueSize } from '../lib/offline'
import SSCCInput from '../components/SSCCInput'
import type { SSCCInputHandle } from '../components/SSCCInput'
import T9Keyboard from '../components/T9Keyboard'
import StatsPanel from '../components/StatsPanel'
import LiveLogs from '../components/LiveLogs'
import FoundItemPanel from '../components/FoundItemPanel'
import type { Item, SearchResult } from '../types'

export default function DashboardPage() {
  const [inputResult, setInputResult] = useState<SearchResult | null>(null)
  const [lastFoundItem, setLastFoundItem] = useState<Item | null>(null)
  const [lastFoundByName, setLastFoundByName] = useState<string | undefined>(undefined)
  const [lastFoundLogId, setLastFoundLogId] = useState<string | null>(null)
  const [lastFoundByUserId, setLastFoundByUserId] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(getQueueSize())
  const [statsLoading, setStatsLoading] = useState(false)
  const activeDataset = useAppStore((s) => s.activeDataset)
  const setActiveDataset = useAppStore((s) => s.setActiveDataset)
  const setDatasets = useAppStore((s) => s.setDatasets)
  const setStats = useAppStore((s) => s.setStats)
  const keyboardVisible = useThemeStore((s) => s.keyboardVisible)
  const user = useAuthStore((s) => s.user)
  const inputRef = useRef<SSCCInputHandle>(null)
  const pendingInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const loadingDatasetRef = useRef<string | undefined>(undefined)

  // Define loadStats early so effects can reference it
  const loadStats = useCallback(async () => {
    if (!activeDataset) return

    const datasetId = activeDataset.id
    loadingDatasetRef.current = datasetId
    setStatsLoading(true)

    const { count: total } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('dataset_id', datasetId)

    // Stale query guard: ignore responses for old datasets
    if (loadingDatasetRef.current !== datasetId) return

    const { data: foundLogs } = await supabase
      .from('found_logs')
      .select('found_by_name')
      .eq('dataset_id', datasetId)

    if (loadingDatasetRef.current !== datasetId) return

    const perUser: Record<string, number> = {}
    foundLogs?.forEach((log) => {
      perUser[log.found_by_name] = (perUser[log.found_by_name] || 0) + 1
    })

    setStats({
      totalItems: total || 0,
      foundItems: foundLogs?.length || 0,
      perUser,
    })
    setStatsLoading(false)
  }, [activeDataset, setStats])

  // Load datasets
  useEffect(() => {
    supabase.from('datasets').select('id,name,created_by,header_mapping,created_at').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) {
        setDatasets(data)
        if (!activeDataset && data.length > 0) {
          setActiveDataset(data[0])
        }
      }
    })
  }, [])

  // Load stats
  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Listen for real-time stats updates
  useEffect(() => {
    if (!activeDataset) return

    const channel = supabase
      .channel(`dashboard-stats-${activeDataset.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'found_logs', filter: `dataset_id=eq.${activeDataset.id}` },
        () => {
          loadStats()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeDataset, loadStats])

  // Load recent logs
  useEffect(() => {
    if (!activeDataset) return

    const datasetId = activeDataset.id
    loadingDatasetRef.current = datasetId

    supabase
      .from('found_logs')
      .select('*')
      .eq('dataset_id', datasetId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (loadingDatasetRef.current !== datasetId) return
        if (data) {
          useAppStore.getState().setRecentLogs(data)
        }
      })
  }, [activeDataset])

  // Sync offline queue when back online + periodic retry
  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true)
      const result = await syncQueue()
      if (result.synced > 0) {
        loadStats()
        useAppStore.getState().setRecentLogs([])
        if (activeDataset) {
          const { data } = await supabase
            .from('found_logs')
            .select('*')
            .eq('dataset_id', activeDataset.id)
            .order('created_at', { ascending: false })
            .limit(20)
          if (data) useAppStore.getState().setRecentLogs(data)
        }
      }
      setPendingCount(getQueueSize())
    }
    const handleOffline = () => {
      setOnline(false)
      setPendingCount(getQueueSize())
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    pendingInterval.current = setInterval(() => {
      setPendingCount(getQueueSize())
    }, 5000)

    // Periodic retry every 30s when queue is non-empty
    syncIntervalRef.current = setInterval(async () => {
      if (getQueueSize() > 0) {
        const result = await syncQueue()
        if (result.synced > 0) {
          loadStats()
          if (activeDataset) {
            const { data } = await supabase
              .from('found_logs')
              .select('*')
              .eq('dataset_id', activeDataset.id)
              .order('created_at', { ascending: false })
              .limit(20)
            if (data) useAppStore.getState().setRecentLogs(data)
          }
        }
        setPendingCount(getQueueSize())
      }
    }, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(pendingInterval.current)
      clearInterval(syncIntervalRef.current)
    }
  }, [activeDataset, loadStats])

  const handleResult = useCallback((result: SearchResult) => {
    setInputResult(result)
    setTimeout(() => setInputResult(null), 2000)
    if (result.status === 'found' && result.item) {
      setLastFoundItem(result.item)
      setLastFoundByName(undefined)
      setLastFoundLogId(result.newLogId ?? null)
      setLastFoundByUserId(user?.id ?? null)
    }
    if (result.status === 'already_found' && result.item) {
      setLastFoundItem(result.item)
      setLastFoundByName(result.existingLog?.found_by_name ?? undefined)
      setLastFoundLogId(result.existingLog?.id ?? null)
      setLastFoundByUserId(result.existingLog?.found_by ?? null)
    }
  }, [user])

  const handleDigit = useCallback((d: string) => {
    inputRef.current?.handleDigit(d)
  }, [])

  const handleBackspace = useCallback(() => {
    inputRef.current?.handleBackspace()
  }, [])

  const handleClear = useCallback(() => {
    inputRef.current?.handleClear()
  }, [])

  const [revertToast, setRevertToast] = useState(false)
  useEffect(() => {
    if (!revertToast) return
    const t = setTimeout(() => setRevertToast(false), 2200)
    return () => clearTimeout(t)
  }, [revertToast])

  if (!activeDataset) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-xs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-12 h-12 text-muted mx-auto mb-3">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <h2 className="text-base font-semibold text-white mb-1">No Dataset Selected</h2>
          <p className="text-xs text-muted mb-4">
            Go to Datasets to upload an Excel file and start counting.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Status bars - shrink to fit */}
      <div className="shrink-0 px-3 pt-3 space-y-2">
        {!online && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-warning/15 border border-warning/30 text-xs">
            <span className="text-warning font-medium">Offline — changes queued locally</span>
            <span className="text-warning/70">{pendingCount} pending</span>
          </div>
        )}
        {online && pendingCount > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-positive/15 border border-positive/30 text-xs">
            <span className="text-positive font-medium">Syncing {pendingCount} queued changes...</span>
          </div>
        )}
      </div>

      {/* Main grid: [SSCC auto] [Stats+Logs 1fr] [Keyboard auto] */}
      <div className="flex-1 grid grid-rows-[auto_1fr_auto] gap-3 p-3 min-h-0 overflow-hidden">
        {/* Row 1: SSCC Input */}
        <div className="shrink-0 bg-surface-light rounded-2xl p-4 border border-border">
          <SSCCInput ref={inputRef} onResult={handleResult} keyboardActive={keyboardVisible} />
        </div>

        {/* Row 2: Stats + LiveLogs side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-0 overflow-hidden">
          <div className="bg-surface-light rounded-2xl border border-border overflow-y-auto p-3">
            <StatsPanel loading={statsLoading} />
          </div>
          <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
            <div className="bg-surface-light rounded-2xl border border-border flex-1 overflow-y-auto p-3 min-h-0">
              <LiveLogs />
            </div>
          </div>
        </div>

        {/* Row 3: FoundItemPanel + T9Keyboard */}
        <div className="shrink-0 flex gap-3">
          <div className={keyboardVisible ? 'w-1/2' : 'w-full'}>
            <FoundItemPanel
              item={lastFoundItem}
              foundByName={lastFoundByName}
              foundLogId={lastFoundLogId}
              foundByUserId={lastFoundByUserId}
              currentUserId={user?.id ?? null}
              onRevert={(success) => { if (success) setRevertToast(true); setLastFoundLogId(null) }}
            />
          </div>
          <div className={keyboardVisible ? 'w-1/2' : 'w-0 overflow-hidden'}>
            <T9Keyboard
              onDigit={handleDigit}
              onBackspace={handleBackspace}
              onClear={handleClear}
            />
          </div>
        </div>
      </div>

      {/* Floating toasts - use fixed positioning to avoid overflow clipping */}
      <AnimatePresence>
        {inputResult && inputResult.status === 'found' && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-20 left-4 right-4 z-50"
          >
            <div className="bg-positive/90 backdrop-blur text-white rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3 animate-glow">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">Found!</div>
                <div className="text-xs text-white/80 truncate">{inputResult.item?.material_no}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {revertToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-20 left-4 right-4 z-50"
          >
            <div className="bg-negative/90 backdrop-blur text-white rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3 animate-glow">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">Item Reverted</div>
                <div className="text-xs text-white/80">Undo successful — status updated</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
