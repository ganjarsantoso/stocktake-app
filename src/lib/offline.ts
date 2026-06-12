import { supabase } from './supabase'

type OpType = 'INSERT' | 'UPDATE'

interface QueuedOp {
  id: string
  type: OpType
  table: string
  /** For INSERT: the row payload. For UPDATE: the fields to set. */
  payload: Record<string, any>
  /** For UPDATE: the id of the row to update */
  record_id?: string
  client_created_at: string
}

const QUEUE_KEY = 'stocktake-offline-queue'

function getQueue(): QueuedOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveQueue(queue: QueuedOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function isOnline(): boolean {
  return navigator.onLine
}

/** Insert into found_logs — goes through offline queue when disconnected */
export async function offlineInsert(
  table: string,
  payload: Record<string, any>
): Promise<{ error: any | null }> {
  if (navigator.onLine) {
    const { error } = await supabase.from(table).insert(payload)
    return { error }
  }

  // Offline: queue the operation
  const op: QueuedOp = {
    id: generateId(),
    type: 'INSERT',
    table,
    payload: { ...payload, client_created_at: new Date().toISOString() },
    client_created_at: new Date().toISOString(),
  }
  const queue = getQueue()
  queue.push(op)
  saveQueue(queue)
  return { error: null }
}

/** Queue an UPDATE for replay when back online */
export async function offlineUpdate(
  table: string,
  recordId: string,
  payload: Record<string, any>
): Promise<{ error: any | null }> {
  if (navigator.onLine) {
    const { error } = await supabase.from(table).update(payload).eq('id', recordId)
    return { error }
  }

  const op: QueuedOp = {
    id: generateId(),
    type: 'UPDATE',
    table,
    payload,
    record_id: recordId,
    client_created_at: new Date().toISOString(),
  }
  const queue = getQueue()
  queue.push(op)
  saveQueue(queue)
  return { error: null }
}

/** Replay all queued operations, oldest first */
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getQueue()
  if (queue.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const op of queue) {
    if (op.type === 'UPDATE') {
      if (!op.record_id) { failed++; continue }
      const { error } = await supabase.from(op.table).update(op.payload).eq('id', op.record_id)
      if (error) return { synced, failed: failed + 1 }
      synced++
      continue
    }

    // INSERT — before inserting, check if item already found (conflict resolution: first wins)
    if (op.table === 'found_logs' && op.payload.item_id) {
      const { data: existing } = await supabase
        .from('found_logs')
        .select('id')
        .eq('item_id', op.payload.item_id)
        .limit(1)

      if (existing && existing.length > 0) {
        failed++
        continue
      }
    }

    const { error } = await supabase.from(op.table).insert(op.payload)
    if (error) {
      // If duplicate key, skip silently
      if (error.message?.includes('duplicate') || error.message?.includes('already')) {
        failed++
        continue
      }
      // Real error — could be connectivity glitch, keep in queue
      return { synced, failed: failed + 1 }
    }
    synced++
  }

  // Clear successfully replayed queue
  saveQueue([])
  return { synced, failed }
}

/** Get pending queue count */
export function getQueueSize(): number {
  return getQueue().length
}
