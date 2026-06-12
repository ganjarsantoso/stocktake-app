import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'

const TARGET_FIELDS = [
  { key: 'storage_bin', label: 'Storage Bin', required: false },
  { key: 'storage_type', label: 'Storage Type', required: false },
  { key: 'material_no', label: 'Material No', required: true },
  { key: 'material_description', label: 'Material Description', required: false },
  { key: 'batch', label: 'Batch', required: false },
  { key: 'storage_unit', label: 'Storage Unit (18-digit barcode)', required: true },
  { key: 'quantity', label: 'Quantity', required: false },
  { key: 'unit_of_quantity', label: 'Unit of Quantity', required: false },
]

interface ManagedDataset {
  id: string
  name: string
  created_at: string
  item_count: number
  found_count: number
}

export default function DatasetsPage() {
  const [step, setStep] = useState<'idle' | 'uploaded' | 'mapping' | 'importing'>('idle')
  const [fileName, setFileName] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([])
  const [rawData, setRawData] = useState<Record<string, any>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [datasetName, setDatasetName] = useState('')
  const [mode, setMode] = useState<'new' | 'append'>('new')
  const [existingDatasets, setExistingDatasets] = useState<{ id: string; name: string }[]>([])
  const [appendTarget, setAppendTarget] = useState('')
  const [status, setStatus] = useState<'idle' | 'error' | 'success'>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [managedDatasets, setManagedDatasets] = useState<ManagedDataset[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore((s) => s.user)
  const addDataset = useAppStore((s) => s.addDataset)
  const activeDataset = useAppStore((s) => s.activeDataset)
  const setActiveDataset = useAppStore((s) => s.setActiveDataset)

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setStatus('idle')

    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[]

      if (json.length === 0) {
        setStatus('error')
        setStatusMsg('The Excel file appears to be empty.')
        return
      }

      setColumns(Object.keys(json[0]))
      setPreviewRows(json.slice(0, 5))
      setRawData(json)
      setStep('uploaded')

      // Smart auto-mapping with fuzzy matching
      const auto: Record<string, string> = {}
      const colNames = Object.keys(json[0])
      const usedTargets = new Set<string>()

      // Aliases for each target field (common Excel column names)
      const ALIASES: Record<string, string[]> = {
        storage_bin: ['bin', 'storage bin', 'location', 'storage location', 'bin location', 'warehouse bin', 'rack', 'shelf', 'slot'],
        storage_type: ['type', 'storage type', 'warehouse type', 'storage category', 'category', 'storagetype'],
        material_no: ['material no', 'material', 'material number', 'mat no', 'matnr', 'part no', 'part number', 'item code', 'item no', 'code', 'product code', 'sku'],
        material_description: ['description', 'material description', 'mat desc', 'desc', 'material desc', 'product description', 'item description', 'product name', 'item name', 'name', 'text', 'material text', 'matdesc', 'description material'],
        batch: ['batch', 'lot', 'batch number', 'lot number', 'batch no', 'lot no', 'charge'],
        storage_unit: ['storage unit', 'unit', 'su', 'sscc', 'barcode', 'bar code', 'unit id', 'storage unit id', 'pallet', 'pallet id', 'pallet code', 'serial', 'serial number', 'tag', 'rfid', 'storageunit', 'sunit'],
        quantity: ['qty', 'quantity', 'amount', 'count', 'total', 'stock', 'inventory', 'qty on hand', 'on hand', 'avl qty', 'available', 'available quantity'],
        unit_of_quantity: ['uom', 'unit', 'unit of measure', 'measure unit', 'base uom', 'unit of quantity', 'measurement', 'sat', 'uom code', 'unit of measurement'],
      }

      // Normalize a string for comparison
      function normalize(s: string) {
        return s.toLowerCase().replace(/[\s_-]+/g, ' ').trim()
      }

      // Score how well a column name matches a target
      function matchScore(col: string, target: string): number {
        const nCol = normalize(col)
        const nTarget = normalize(target)
        if (nCol === nTarget) return 100
        if (nCol.replace(/\s/g, '') === nTarget.replace(/\s/g, '')) return 95

        // Check aliases
        const aliases = ALIASES[target] || []
        for (const alias of aliases) {
          const nAlias = normalize(alias)
          if (nCol === nAlias) return 90
          if (nCol.replace(/\s/g, '') === nAlias.replace(/\s/g, '')) return 85
        }

        // Check if column contains target keyword or vice versa
        const colWords = nCol.split(/\s+/)
        const targetWords = nTarget.split(/\s+/)
        const aliasWords = aliases.flatMap((a) => normalize(a).split(/\s+/))

        const relevantWords = [...targetWords, ...aliasWords.filter((w) => w.length > 2)]
        for (const word of relevantWords) {
          if (colWords.includes(word)) return 70
          if (nCol.includes(word)) return 60
        }
        for (const cw of colWords) {
          if (relevantWords.includes(cw)) return 65
          if (nTarget.includes(cw)) return 55
        }

        return 0
      }

      // Assign best match per column (greedy: pick highest score, then next)
      const scored: { col: string; target: string; score: number }[] = []
      for (const col of colNames) {
        for (const f of TARGET_FIELDS) {
          if (usedTargets.has(f.key)) continue
          const score = matchScore(col, f.key)
          if (score > 0) {
            scored.push({ col, target: f.key, score })
          }
        }
      }

      scored.sort((a, b) => b.score - a.score)
      for (const s of scored) {
        if (!usedTargets.has(s.target) && !auto[s.col]) {
          auto[s.col] = s.target
          usedTargets.add(s.target)
        }
      }

      setMapping(auto)
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const handleImport = useCallback(async () => {
    const name = datasetName.trim() || fileName.replace(/\.[^.]+$/, '')
    if (!name) {
      setStatus('error')
      setStatusMsg('Please enter a dataset name.')
      return
    }

    const mappedColumns = Object.entries(mapping).filter(([, target]) => target)
    if (!mappedColumns.find(([, t]) => t === 'storage_unit')) {
      setStatus('error')
      setStatusMsg('You must map a column to Storage Unit.')
      return
    }
    if (!mappedColumns.find(([, t]) => t === 'material_no')) {
      setStatus('error')
      setStatusMsg('You must map a column to Material No.')
      return
    }

    setStep('importing')
    setStatus('idle')

    try {
      if (mode === 'new') {
        // Create dataset
        const { data: dataset, error: dsError } = await supabase
          .from('datasets')
          .insert({
            name,
            created_by: user?.id,
            header_mapping: mapping,
          })
          .select()
          .single()

        if (dsError || !dataset) throw new Error('Failed to create dataset')

        // Insert items
        const items = rawData.map((row) => {
          const item: Record<string, any> = { dataset_id: dataset.id }
          mappedColumns.forEach(([col, target]) => {
            if (target === 'quantity') {
              item[target] = Number(row[col]) || 0
            } else {
              item[target] = String(row[col] ?? '')
            }
          })
          return item
        })

        const { error: itemsError } = await supabase.from('items').upsert(items, {
          onConflict: 'dataset_id, storage_unit',
          ignoreDuplicates: false,
        })

        if (itemsError) throw itemsError

        addDataset(dataset)
        setStatus('success')
        setStatusMsg(`Dataset "${name}" created with ${items.length} items.`)
      } else {
        // Append to existing
        if (!appendTarget) {
          setStatus('error')
          setStatusMsg('Select a dataset to append to.')
          return
        }

        const items = rawData.map((row) => {
          const item: Record<string, any> = { dataset_id: appendTarget }
          mappedColumns.forEach(([col, target]) => {
            if (target === 'quantity') {
              item[target] = Number(row[col]) || 0
            } else {
              item[target] = String(row[col] ?? '')
            }
          })
          return item
        })

        const { error: itemsError } = await supabase.from('items').upsert(items, {
          onConflict: 'dataset_id, storage_unit',
          ignoreDuplicates: false,
        })

        if (itemsError) throw itemsError

        setStatus('success')
        setStatusMsg(`${items.length} items appended to dataset.`)

        // Reload existing datasets list
        loadExistingDatasets()
      }

      // Reset after success
      setTimeout(() => {
        setStep('idle')
        setFileName('')
        setColumns([])
        setPreviewRows([])
        setRawData([])
        setMapping({})
        setDatasetName('')
        setStatus('idle')
        if (fileRef.current) fileRef.current.value = ''
      }, 2000)
    } catch (err: any) {
      setStatus('error')
      setStatusMsg(err.message || 'Import failed. Please try again.')
      setStep('mapping')
    }
  }, [datasetName, fileName, mapping, mode, rawData, user, addDataset, appendTarget])

  async function loadExistingDatasets() {
    const { data } = await supabase.from('datasets').select('id, name')
    if (data) setExistingDatasets(data)
  }

  async function loadManagedDatasets() {
    const { data: datasets } = await supabase
      .from('datasets')
      .select('id, name, created_at')
      .order('created_at', { ascending: false })

    if (!datasets) return

    const withCounts: ManagedDataset[] = []
    for (const ds of datasets) {
      const { count: itemCount } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('dataset_id', ds.id)

      const { count: foundCount } = await supabase
        .from('found_logs')
        .select('*', { count: 'exact', head: true })
        .eq('dataset_id', ds.id)

      withCounts.push({
        id: ds.id,
        name: ds.name,
        created_at: ds.created_at,
        item_count: itemCount || 0,
        found_count: foundCount || 0,
      })
    }
    setManagedDatasets(withCounts)
  }

  async function handleRename(datasetId: string, newName: string) {
    if (!newName.trim()) return
    await supabase.from('datasets').update({ name: newName.trim() }).eq('id', datasetId)
    setRenamingId(null)
    setRenameValue('')
    loadManagedDatasets()
  }

  async function handleDelete(datasetId: string) {
    await supabase.from('datasets').delete().eq('id', datasetId)
    setDeletingId(null)
    if (activeDataset?.id === datasetId) setActiveDataset(null)
    loadManagedDatasets()
  }

  useEffect(() => {
    loadManagedDatasets()
  }, [])

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold">Datasets</h1>
        <button
          onPointerDown={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-surface text-xs font-semibold active:scale-[0.97] transition-all"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Excel
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
        className="hidden"
      />

      {/* Upload area */}
      {step === 'idle' && (
        <div
          onPointerDown={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer active:bg-surface-lighter transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10 text-muted mx-auto mb-3">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="12" y1="9" x2="12" y2="17" />
          </svg>
          <p className="text-sm text-muted">Tap to upload an Excel file</p>
          <p className="text-[11px] text-muted/60 mt-1">Supports .xlsx and .xls</p>
        </div>
      )}

      {/* Uploaded - Mode selection */}
      <AnimatePresence>
        {step === 'uploaded' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="bg-surface-light rounded-2xl p-3 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white truncate">{fileName}</div>
                  <div className="text-[11px] text-muted">{rawData.length} rows · {columns.length} columns</div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-positive">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>

            {/* Mode */}
            <div className="flex gap-2">
              <button
                onPointerDown={() => setMode('new')}
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                  mode === 'new' ? 'bg-accent text-surface' : 'bg-surface-lighter text-muted'
                }`}
              >
                New Dataset
              </button>
              <button
                onPointerDown={() => { setMode('append'); loadExistingDatasets() }}
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                  mode === 'append' ? 'bg-accent text-surface' : 'bg-surface-lighter text-muted'
                }`}
              >
                Append to Existing
              </button>
            </div>

            {/* Dataset name */}
            {mode === 'new' ? (
              <input
                type="text"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder="Dataset name"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-lighter border border-border text-white text-sm placeholder:text-muted/50 focus:outline-none focus:border-accent"
              />
            ) : (
              <select
                value={appendTarget}
                onChange={(e) => setAppendTarget(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-lighter border border-border text-white text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Select dataset...</option>
                {existingDatasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>{ds.name}</option>
                ))}
              </select>
            )}

            <button
              onPointerDown={() => setStep('mapping')}
              className="w-full py-2.5 rounded-xl bg-accent text-surface text-sm font-semibold active:scale-[0.98] transition-all"
            >
              Configure Columns →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mapping */}
      <AnimatePresence>
        {step === 'mapping' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="bg-surface-light rounded-2xl p-3 border border-border space-y-2">
              <h2 className="text-sm font-semibold">Column Mapping</h2>
              <p className="text-[11px] text-muted">
                Map your Excel columns to system fields. Storage Unit and Material No are required.
              </p>
            </div>

            {columns.map((col) => (
              <div key={col} className="bg-surface-light rounded-xl p-3 border border-border">
                <div className="text-sm font-medium text-white mb-2 truncate">{col}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-muted">→</span>
                  <select
                    value={mapping[col] || ''}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [col]: e.target.value }))}
                    className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-surface-lighter border border-border text-white text-xs focus:outline-none focus:border-accent"
                  >
                    <option value="">— Skip column —</option>
                    {TARGET_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}

            {/* Preview */}
            <div className="bg-surface-light rounded-2xl p-3 border border-border">
              <div className="text-[11px] text-muted font-medium mb-2">Preview (first 5 rows)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-muted">
                      <th className="text-left pr-2 py-1">Storage Unit</th>
                      <th className="text-left pr-2 py-1">Material No</th>
                      <th className="text-left pr-2 py-1">Material Desc</th>
                      <th className="text-left py-1">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => {
                      const suCol = Object.entries(mapping).find(([, t]) => t === 'storage_unit')?.[0]
                      const matCol = Object.entries(mapping).find(([, t]) => t === 'material_no')?.[0]
                      const descCol = Object.entries(mapping).find(([, t]) => t === 'material_description')?.[0]
                      const qtyCol = Object.entries(mapping).find(([, t]) => t === 'quantity')?.[0]
                      return (
                        <tr key={i} className="border-t border-border/50">
                          <td className="pr-2 py-1 font-mono text-accent truncate max-w-[120px]">
                            {suCol ? String(row[suCol] ?? '') : '-'}
                          </td>
                          <td className="pr-2 py-1 truncate max-w-[100px]">
                            {matCol ? String(row[matCol] ?? '') : '-'}
                          </td>
                          <td className="pr-2 py-1 text-muted truncate max-w-[100px]">
                            {descCol ? String(row[descCol] ?? '') : '-'}
                          </td>
                          <td className="py-1 text-muted">
                            {qtyCol ? String(row[qtyCol] ?? '') : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onPointerDown={() => setStep('uploaded')}
                className="flex-1 py-2.5 rounded-xl bg-surface-lighter text-white text-sm font-medium active:scale-[0.98] transition-all"
              >
                Back
              </button>
              <button
                onPointerDown={handleImport}
                className="flex-[2] py-2.5 rounded-xl bg-accent text-surface text-sm font-semibold active:scale-[0.98] transition-all"
              >
                {`Import ${rawData.length} Items`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status toast */}
      <AnimatePresence>
        {status !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`rounded-xl px-3 py-2 text-xs font-medium ${
              status === 'success' ? 'bg-positive/20 text-positive' : 'bg-negative/20 text-negative'
            }`}
          >
            {statusMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Managed datasets */}
      {step === 'idle' && (
        <div className="space-y-2 pt-4">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Saved Datasets</h2>
          {managedDatasets.length === 0 ? (
            <p className="text-xs text-muted italic py-4 text-center">No datasets yet. Upload an Excel file above.</p>
          ) : (
            <div className="space-y-2">
              {managedDatasets.map((ds) => (
                <div
                  key={ds.id}
                  className={`bg-surface-light rounded-xl border ${
                    activeDataset?.id === ds.id ? 'border-accent' : 'border-border'
                  } overflow-hidden`}
                >
                  {deletingId === ds.id ? (
                    <div className="p-3 space-y-2">
                      <p className="text-xs text-negative font-medium">Delete "{ds.name}" and all its data?</p>
                      <div className="flex gap-2">
                        <button
                          onPointerDown={() => setDeletingId(null)}
                          className="flex-1 py-2 rounded-lg bg-surface-lighter text-white text-xs font-medium active:scale-[0.98] transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onPointerDown={() => handleDelete(ds.id)}
                          className="flex-[2] py-2 rounded-lg bg-negative text-white text-xs font-semibold active:scale-[0.98] transition-all"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : renamingId === ds.id ? (
                    <div className="p-3 space-y-2">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(ds.id, renameValue); if (e.key === 'Escape') setRenamingId(null) }}
                        className="w-full px-2.5 py-2 rounded-lg bg-surface-lighter border border-border text-white text-xs focus:outline-none focus:border-accent"
                        placeholder="New name"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onPointerDown={() => setRenamingId(null)}
                          className="flex-1 py-2 rounded-lg bg-surface-lighter text-white text-xs font-medium active:scale-[0.98] transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onPointerDown={() => handleRename(ds.id, renameValue)}
                          className="flex-[2] py-2 rounded-lg bg-accent text-surface text-xs font-semibold active:scale-[0.98] transition-all"
                        >
                          Rename
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-medium truncate cursor-pointer hover:text-accent transition-colors"
                            onPointerDown={() => { setActiveDataset(ds as any); setStep('idle') }}
                          >
                            {ds.name}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted mt-0.5">
                            <span>{ds.item_count} items</span>
                            <span className="text-accent">{ds.found_count} found</span>
                            <span>{new Date(ds.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onPointerDown={() => { setRenamingId(ds.id); setRenameValue(ds.name) }}
                            className="p-1.5 rounded-lg text-muted hover:text-white hover:bg-surface-lighter transition-colors"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onPointerDown={() => setDeletingId(ds.id)}
                            className="p-1.5 rounded-lg text-muted hover:text-negative hover:bg-negative/10 transition-colors"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
