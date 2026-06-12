import { motion, AnimatePresence } from 'framer-motion'
import type { Item } from '../types'

interface Props {
  item: Item | null
  foundByName?: string
}

function highlightLast5(unit: string) {
  if (unit.length < 5) return <span>{unit}</span>
  const head = unit.slice(0, -5)
  const tail = unit.slice(-5)
  return (
    <span>
      {head}<span className="text-accent font-bold">{tail}</span>
    </span>
  )
}

export default function FoundItemPanel({ item, foundByName }: Props) {
  return (
    <AnimatePresence mode="wait">
      {item ? (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-positive/10 border border-positive/30 rounded-2xl p-4 h-full flex flex-col justify-center min-h-[160px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-positive/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-positive">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="text-[10px] text-positive font-semibold uppercase tracking-wider">Last Found Item</span>
          </div>

          <div className="text-lg font-mono font-bold text-white mb-1.5">
            {highlightLast5(item.storage_unit)}
          </div>

          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm text-white font-semibold">{item.material_no}</span>
            {item.storage_bin && (
              <span className="bg-surface-lighter px-1.5 py-0.5 rounded text-[10px] text-muted">
                {item.storage_bin}
              </span>
            )}
          </div>

          {item.material_description && (
            <div className="text-xs text-muted leading-relaxed mt-1.5 bg-surface-lighter/50 -mx-1 px-2 py-1.5 rounded-lg border border-border/50">
              {item.material_description}
            </div>
          )}

          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-muted">
            {item.storage_type && <span>{item.storage_type}</span>}
            {item.batch && (
              <span className="bg-surface-lighter px-1.5 py-0.5 rounded">Batch: {item.batch}</span>
            )}
            <span>Qty: {item.quantity ?? '—'} {item.unit_of_quantity ?? ''}</span>
          </div>

          {foundByName && (
            <div className="text-[10px] text-muted mt-2 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-accent" />
              Found by <span className="text-accent font-medium">{foundByName}</span>
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-surface-lighter/50 border border-border rounded-2xl p-4 h-full flex items-center justify-center min-h-[160px]"
        >
          <div className="text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-muted/40 mx-auto mb-2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            </svg>
            <div className="text-xs text-muted/50">Scan or search an item</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
