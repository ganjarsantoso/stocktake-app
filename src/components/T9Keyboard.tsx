import { useThemeStore } from '../stores/themeStore'

interface Props {
  onDigit: (d: string) => void
  onBackspace: () => void
  onClear: () => void
}

export default function T9Keyboard({ onDigit, onBackspace, onClear }: Props) {
  const keyboardSize = useThemeStore((s) => s.keyboardSize)
  const sizeMap = { small: '48px', medium: '56px', large: '64px' }
  const btnSize = sizeMap[keyboardSize]

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ]

  return (
    <div className="w-full select-none" style={{ maxWidth: 360, margin: '0 auto' }}>
      {keys.map((row, ri) => (
        <div key={ri} className="flex gap-1.5 mb-1.5">
          {row.map((d) => (
            <button
              key={d}
              onPointerDown={(e) => {
                e.preventDefault()
                onDigit(d)
              }}
              className="flex-1 rounded-xl bg-surface-lighter active:bg-accent/30 text-white font-semibold text-lg transition-colors touch-manipulation"
              style={{ height: btnSize, lineHeight: btnSize, WebkitTapHighlightColor: 'transparent' }}
            >
              {d}
            </button>
          ))}
        </div>
      ))}
      <div className="flex gap-1.5">
        <button
          onPointerDown={(e) => { e.preventDefault(); onBackspace() }}
          className="flex-1 rounded-xl bg-surface-lighter active:bg-accent/30 text-white transition-colors touch-manipulation flex items-center justify-center"
          style={{ height: btnSize }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
            <line x1="18" y1="9" x2="12" y2="15" />
            <line x1="12" y1="9" x2="18" y2="15" />
          </svg>
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); onClear() }}
          className="flex-1 rounded-xl bg-surface-lighter active:bg-warning/30 text-white text-sm font-medium transition-colors touch-manipulation"
          style={{ height: btnSize }}
        >
          CLR
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); onDigit('0') }}
          className="flex-1 rounded-xl bg-surface-lighter active:bg-accent/30 text-white font-semibold text-lg transition-colors touch-manipulation"
          style={{ height: btnSize }}
        >
          0
        </button>
      </div>
    </div>
  )
}
