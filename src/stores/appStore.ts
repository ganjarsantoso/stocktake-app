import { create } from 'zustand'
import type { Dataset, FoundLog } from '../types'

interface AppState {
  activeDataset: Dataset | null
  datasets: Dataset[]
  recentLogs: FoundLog[]
  stats: {
    totalItems: number
    foundItems: number
    perUser: Record<string, number>
  }
  setActiveDataset: (dataset: Dataset | null) => void
  setDatasets: (datasets: Dataset[]) => void
  addDataset: (dataset: Dataset) => void
  setStats: (stats: AppState['stats']) => void
  prependLog: (log: FoundLog) => void
  setRecentLogs: (logs: FoundLog[]) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeDataset: null,
  datasets: [],
  recentLogs: [],
  stats: { totalItems: 0, foundItems: 0, perUser: {} },
  setActiveDataset: (dataset) => set({ activeDataset: dataset }),
  setDatasets: (datasets) => set({ datasets }),
  addDataset: (dataset) => set((s) => ({ datasets: [...s.datasets, dataset] })),
  setStats: (stats) => set({ stats }),
  prependLog: (log) =>
    set((s) => ({
      recentLogs: [log, ...s.recentLogs].slice(0, 50),
    })),
  setRecentLogs: (logs) => set({ recentLogs: logs }),
}))
