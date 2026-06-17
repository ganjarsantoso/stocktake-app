import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'

export function useFoundLogsSubscription() {
  const prependLog = useAppStore((s) => s.prependLog)

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
  }, [prependLog])
}
