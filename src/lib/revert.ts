import { supabase } from './supabase'
import { offlineUpdate } from './offline'

type RevertResult = { success: true } | { success: false; error: string }

/**
 * Revert (undo) a found_log.
 * Online: calls supabase.rpc() with SECURITY DEFINER function.
 * Offline: queues the UPDATE for replay via offline queue.
 */
export async function revertFoundLog(logId: string): Promise<RevertResult> {
  // Try RPC first (SECURITY DEFINER — works without RLS)
  const { error: rpcError } = await supabase.rpc('revert_found_log', { log_id: logId })
  if (!rpcError) return { success: true }

  // RPC failed (likely offline) — queue via offline update
  console.warn('revert_found_log RPC failed, falling back:', rpcError.message)
  const payload = { reverted_at: new Date().toISOString(), item_id: null }
  const { error: queueError } = await offlineUpdate('found_logs', logId, payload)
  if (!queueError) return { success: true }

  console.error('Offline update also failed:', queueError.message)
  return { success: false, error: queueError.message }
}
