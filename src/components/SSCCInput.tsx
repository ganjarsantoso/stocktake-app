import { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { offlineInsert } from '../lib/offline'
import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'
import type { Item, SearchResult } from '../types'

interface Props {
  onResult: (result: SearchResult) => void
  keyboardActive?: boolean
}

export interface SSCCInputHandle {
  handleDigit: (d: string) => void
  handleBackspace: () => void
  handleClear: () => void
}

const manualFields = [
  { key: 'storage_unit', label: 'Storage Unit *', required: true },
  { key: 'material_no', label: 'Material No *', required: true },
  { key: 'material_description', label: 'Description', required: false },
  { key: 'storage_bin', label: 'Storage Bin', required: false },
  { key: 'storage_type', label: 'Storage Type', required: false },
  { key: 'batch', label: 'Batch', required: false },
  { key: 'quantity', label: 'Quantity', required: false },
  { key: 'unit_of_quantity', label: 'Unit of Qty', required: false },
]

const emptyManual = Object.fromEntries(manualFields.map((f) => [f.key, ''])) as Record<string, string>

const SSCCInput = forwardRef<SSCCInputHandle, Props>(({ onResult, keyboardActive }, ref) => {
  const [digits, setDigits] = useState('')
  const [status, setStatus] = useState<'idle' | 'searching' | 'found' | 'not_found' | 'already_found' | 'ambiguous'>('idle')
  const [candidates, setCandidates] = useState<Item[]>([])
  const [message, setMessage] = useState('')
  const [manual, setManual] = useState<Record<string, string>>(emptyManual)
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const digitsRef = useRef(digits)
  digitsRef.current = digits
  const statusRef = useRef(status)
  statusRef.current = status
  const debouncedSearchRef = useRef(debouncedSearch)
  debouncedSearchRef.current = debouncedSearch
  const user = useAuthStore((s) => s.user)
  const activeDataset = useAppStore((s) => s.activeDataset)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    handleDigit: (d: string) => {
      if (statusRef.current === 'not_found') return
      const next = (digitsRef.current + d).slice(0, 15)
      setDigits(next)
      debouncedSearchRef.current(next)
    },
    handleBackspace: () => {
      if (statusRef.current === 'not_found') return
      const next = digitsRef.current.slice(0, -1)
      setDigits(next)
      debouncedSearchRef.current(next)
    },
    handleClear: () => {
      setDigits('')
      setStatus('idle')
      setCandidates([])
      setMessage('')
      setManual(emptyManual)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      inputRef.current?.focus()
    },
  }))

  function debouncedSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 150)
  }

  const search = useCallback(async (value: string) => {
    if (!activeDataset || value.length < 5) {
      setStatus('idle')
      setCandidates([])
      setManual(emptyManual)
      setMessage('')
      return
    }

    setStatus('searching')

    const searchLength = Math.min(value.length, 15)
    const suffix = value.slice(-searchLength)

    const { data: items } = await supabase
      .from('items')
      .select('id,dataset_id,storage_unit,storage_bin,storage_type,material_no,material_description,batch,quantity,unit_of_quantity')
      .eq('dataset_id', activeDataset.id)
      .ilike('storage_unit', `%${suffix}`)
      .limit(10)

    if (!items || items.length === 0) {
      setStatus('not_found')
      setCandidates([])
      setMessage(`No Storage Unit matches these digits`)
      onResult({ status: 'not_found', message: 'No Storage Unit matches these digits' })
      return
    }

    if (items.length === 1) {
      const item = items[0]
      const { data: logs } = await supabase
        .from('found_logs')
        .select('*')
        .eq('item_id', item.id)
        .limit(1)

      if (logs && logs.length > 0) {
        setStatus('already_found')
        setCandidates([])
        setMessage(`Already found by ${logs[0].found_by_name}`)
        onResult({ status: 'already_found', item, existingLog: logs[0], message: `Already found by ${logs[0].found_by_name}` })
      } else {
        const payload = {
          item_id: item.id,
          dataset_id: activeDataset.id,
          found_by: user?.id,
          found_by_name: user?.display_name,
          material_no: item.material_no,
          material_description: item.material_description,
          storage_unit: item.storage_unit,
          storage_bin: item.storage_bin,
          batch: item.batch,
          quantity: item.quantity,
          is_manual: false,
        }
        const { error, data: newLog } = await offlineInsert('found_logs', payload)

        if (error) {
          if (error.message?.includes('already') || error.message?.includes('duplicate')) {
            setStatus('already_found')
            setMessage('Already found (race condition)')
          }
          return
        }

        setStatus('found')
        setCandidates([])
        setMessage(`Found: ${item.material_no}`)
        onResult({ status: 'found', item, newLogId: newLog?.id })

        setTimeout(() => {
          setDigits('')
          setStatus('idle')
          setManual(emptyManual)
          setMessage('')
          inputRef.current?.focus()
        }, 1500)
      }
      return
    }

    // Enrich candidates with found status
    const itemIds = items.map((i) => i.id)
    const { data: existingLogs } = await supabase
      .from('found_logs')
      .select('item_id, found_by_name')
      .in('item_id', itemIds)
    const foundMap = new Map(existingLogs?.map((l) => [l.item_id, l.found_by_name]) ?? [])

    const enriched = items.map((item) => ({
      ...item,
      _found_by: foundMap.get(item.id) ?? null,
    }))

    setStatus('ambiguous')
    setCandidates(enriched as any)
    setMessage(`${items.length} Storage Units match these digits`)
    onResult({ status: 'ambiguous', candidates: items, message: `${items.length} Storage Units match these digits` })
  }, [activeDataset, user, onResult])

  const handleChange = useCallback((value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 15)
    setDigits(cleaned)
    debouncedSearchRef.current(cleaned)
  }, [])

  const handleCandidateSelect = useCallback(async (item: Item) => {
    if (!activeDataset || !user) return

    const { data: logs } = await supabase
      .from('found_logs')
      .select('*')
      .eq('item_id', item.id)
      .limit(1)

    if (logs && logs.length > 0) {
      setStatus('already_found')
      setCandidates([])
      setMessage(`Already found by ${logs[0].found_by_name}`)
      onResult({ status: 'already_found', item, existingLog: logs[0] })
      return
    }

    const payload = {
      item_id: item.id,
      dataset_id: activeDataset.id,
      found_by: user.id,
      found_by_name: user.display_name,
      material_no: item.material_no,
      material_description: item.material_description,
      storage_unit: item.storage_unit,
      storage_bin: item.storage_bin,
      batch: item.batch,
      quantity: item.quantity,
      is_manual: false,
    }
    const { error, data: newLog } = await offlineInsert('found_logs', payload)

    if (!error) {
      setStatus('found')
      setCandidates([])
      setMessage(`Found: ${item.material_no}`)
      onResult({ status: 'found', item, newLogId: newLog?.id })

      setTimeout(() => {
        setDigits('')
        setStatus('idle')
        setManual(emptyManual)
        setMessage('')
        inputRef.current?.focus()
      }, 1500)
    }
  }, [activeDataset, user, onResult])

  async function handleManualSubmit() {
    if (!activeDataset || !user || manualSubmitting) return
    if (!manual.storage_unit.trim() || !manual.material_no.trim()) return

    setManualSubmitting(true)

    // Check for existing item (handles revert + re-input)
    const { data: existingItems } = await supabase
      .from('items')
      .select('*')
      .eq('dataset_id', activeDataset.id)
      .eq('storage_unit', manual.storage_unit.trim())
      .limit(1)

    let item: Item

    if (existingItems && existingItems.length > 0) {
      item = existingItems[0]
    } else {
      const { data: newItem, error: itemError } = await supabase
        .from('items')
        .insert({
          dataset_id: activeDataset.id,
          storage_unit: manual.storage_unit.trim(),
          storage_bin: manual.storage_bin.trim() || null,
          storage_type: manual.storage_type.trim() || null,
          material_no: manual.material_no.trim(),
          material_description: manual.material_description.trim() || null,
          batch: manual.batch.trim() || null,
          quantity: Number(manual.quantity) || 0,
          unit_of_quantity: manual.unit_of_quantity.trim() || null,
        })
        .select()
        .single()

      if (itemError || !newItem) {
        setManualSubmitting(false)
        return
      }
      item = newItem
    }

    // Check if already has a found_log
    const { data: existingLogs } = await supabase
      .from('found_logs')
      .select('found_by_name')
      .eq('item_id', item.id)
      .limit(1)

    if (existingLogs && existingLogs.length > 0) {
      setManualSubmitting(false)
      setStatus('already_found')
      setMessage(`Already found by ${existingLogs[0].found_by_name}`)
      return
    }

    // Insert found_log with is_manual flag
    const payload = {
      item_id: item.id,
      dataset_id: activeDataset.id,
      found_by: user.id,
      found_by_name: user.display_name,
      material_no: item.material_no,
      material_description: item.material_description,
      storage_unit: item.storage_unit,
      storage_bin: item.storage_bin,
      batch: item.batch,
      quantity: item.quantity,
      is_manual: true,
    }
    const { data: newLog } = await offlineInsert('found_logs', payload)

    setManualSubmitting(false)
    setStatus('found')
    setMessage(`Added: ${item.material_no}`)
    onResult({ status: 'found', item, newLogId: newLog?.id })

    setTimeout(() => {
      setDigits('')
      setStatus('idle')
      setManual(emptyManual)
      setMessage('')
      inputRef.current?.focus()
    }, 2000)
  }

  const statusColors: Record<string, string> = {
    idle: 'text-muted',
    searching: 'text-accent',
    found: 'text-positive',
    not_found: 'text-negative',
    already_found: 'text-warning',
    ambiguous: 'text-warning',
  }

  return (
    <div className="space-y-3">
      {/* Input */}
      <div className="relative">
        <div className="flex items-center gap-1 justify-center">
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className={`w-5 h-8 sm:w-6 sm:h-10 rounded border-b-2 flex items-center justify-center text-sm sm:text-base font-mono font-bold transition-all ${
                i < digits.length
                  ? 'border-accent text-white bg-accent/10'
                  : 'border-surface-lighter text-muted'
              } ${i === 4 || i === 9 ? 'mr-2' : ''}`}
            >
              {digits[i] || ''}
            </div>
          ))}
        </div>
        <input
          ref={inputRef}
          type="text"
          inputMode={keyboardActive ? 'none' : 'numeric'}
          value={digits}
          onChange={(e) => handleChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-default"
          autoFocus
          autoComplete="off"
        />
      </div>

      {/* Status */}
      <AnimatePresence mode="wait">
        {status !== 'idle' && (
          <motion.div
            key={status + message}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={`text-center text-sm font-medium ${statusColors[status]}`}
          >
            {status === 'searching' && (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                Searching...
              </span>
            )}
            {status === 'found' && (
              <span className="text-positive flex items-center justify-center gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {message}
              </span>
            )}
            {status === 'not_found' && (
              <div className="space-y-1">
                <div>{message}</div>
                <button
                  onPointerDown={() => {
                    setManual({ ...emptyManual, storage_unit: digits })
                    setMessage('Fill in the details to add manually:')
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent/20 text-accent text-xs font-medium active:scale-[0.97] transition-all mt-1"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Manually
                </button>
              </div>
            )}
            {status === 'already_found' && message}
            {status === 'ambiguous' && message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual entry form */}
      <AnimatePresence>
        {status === 'not_found' && manual.storage_unit && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-surface-light rounded-2xl p-3 border border-border space-y-2.5 overflow-hidden"
          >
            <p className="text-xs font-medium text-accent">Add Item Manually</p>
            {manualFields.map((f) => (
              <div key={f.key}>
                <label className="text-[10px] text-muted block mb-0.5">{f.label}</label>
                <input
                  type={f.key === 'quantity' ? 'number' : 'text'}
                  value={manual[f.key]}
                  onChange={(e) => setManual((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.label}
                  className="w-full px-2.5 py-2 rounded-lg bg-surface-lighter border border-border text-white text-xs placeholder:text-muted/50 focus:outline-none focus:border-accent"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                onPointerDown={() => { setStatus('idle'); setManual(emptyManual); setDigits(''); setMessage(''); inputRef.current?.focus() }}
                className="flex-1 py-2 rounded-lg bg-surface-lighter text-white text-xs font-medium active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <button
                onPointerDown={handleManualSubmit}
                disabled={manualSubmitting || !manual.storage_unit.trim() || !manual.material_no.trim()}
                className="flex-[2] py-2 rounded-lg bg-accent text-surface text-xs font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {manualSubmitting ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-surface border-t-transparent rounded-full animate-spin" />
                    Adding...
                  </span>
                ) : (
                  'Add & Mark Found'
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ambiguous candidates */}
      <AnimatePresence>
        {status === 'ambiguous' && candidates.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1.5 overflow-hidden"
          >
            <p className="text-[11px] text-muted px-1">Tap to select the correct Storage Unit:</p>
            {candidates.map((item: any) => {
              const isFound = !!item._found_by
              return (
                <button
                  key={item.id}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    handleCandidateSelect(item)
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors touch-manipulation ${
                    isFound
                      ? 'bg-warning/10 border-warning/30 active:bg-warning/20'
                      : 'bg-surface-lighter border-transparent active:bg-accent/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-accent font-semibold truncate">{item.storage_unit}</span>
                    <span className={`text-xs ml-2 shrink-0 ${isFound ? 'text-warning' : 'text-muted'}`}>{item.material_no}</span>
                  </div>
                  {item.material_description && (
                    <div className="text-[11px] text-muted truncate mt-0.5">{item.material_description}</div>
                  )}
                  {isFound && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-warning">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                      Already found by {item._found_by}
                    </div>
                  )}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instructions */}
      {status === 'idle' && !digits && (
        <p className="text-[11px] text-muted text-center">
          Type at least 5 digits to search Storage Unit
        </p>
      )}
    </div>
  )
})

export default SSCCInput
