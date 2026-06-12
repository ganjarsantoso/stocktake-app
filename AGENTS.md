# StockTake App

## Commands

```
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build (typecheck + bundle)
npm run lint       # eslint .
npm run preview    # vite preview (serve built assets)
npx vite build     # skip typecheck, faster iteration
```

No test framework or test script is configured.

## Stack

- **React 19** + TypeScript 6 + Vite 8 + Tailwind CSS 4
- **Supabase** (Postgres, Auth, Realtime) — no backend server
- **Zustand** for client state, **React Router v7** for routing
- **PWA** via `vite-plugin-pwa` (auto-update service worker)
- **SheetJS (xlsx)** for Excel import
- **Framer Motion** for animations

## Database & Supabase

Tables: `users`, `datasets`, `items`, `found_logs`. See `supabase/schema.sql`.

- `found_logs.item_id` has `UNIQUE` constraint — only one active found_log per item at a time
- Soft-revert: sets `reverted_at = now()` and `item_id = NULL` instead of deleting the row (migration `002_soft_revert.sql`)
- `revert_found_log(log_id UUID)` is a **SECURITY DEFINER** function that bypasses RLS (called via `supabase.rpc()`)
- `found_logs` now has UPDATE + DELETE RLS policies (migration `003_add_found_logs_update_policy.sql`)
- `revert_found_log` RPC does soft-revert: sets `reverted_at = now()`, clears `item_id`
- Revert works offline too — queued in localStorage and replayed on reconnect
- Realtime is enabled on `found_logs` (INSERT, UPDATE, DELETE events)

## Migration workflow

SQL files in `supabase/migrations/` (sorted by prefix) applied manually (Supabase SQL Editor) or via `node scripts/apply-migrations.js`. The script requires `SUPABASE_SERVICE_ROLE_KEY` env var.

All three migrations must run on a fresh project:
1. `001_add_found_logs_delete_policy.sql`
2. `002_soft_revert.sql`
3. `003_add_found_logs_update_policy.sql`

The app checks on startup that the DB tables exist; if not, shows a setup screen.

## Environment

`.env` requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Style

- Tailwind CSS v4 with `@theme` directive (no `tailwind.config.js`)
- Dark/light mode toggled via `.dark` / `.light` classes on `<html>` (not `prefers-color-scheme`)
- Custom color tokens: `surface`, `surface-light`, `surface-lighter`, `accent`, `positive`, `negative`, `warning`, `muted`, `border`
- Auth is anonymous: user enters display name, Supabase creates anonymous session + `users` row

## Stale closure gotcha

`useImperativeHandle` without deps captures initial closure forever. SSCCInput handles this via refs (`digitsRef`, `statusRef`, `debouncedSearchRef`). Any new imperative handle methods must follow the same pattern — never read state directly in the handle body.

## Zustand quirks

- `useAppStore.getState().recentLogs.setRecentLogs(fn)` passes `fn` as **value** not updater (Zustand actions are plain values). To do functional updates outside a component, use `useAppStore.setState((s) => ({ recentLogs: s.recentLogs.filter(...) }))`
- `prependLog` caps at 50 entries

## Offline

`src/lib/offline.ts` queues found_logs INSERTs and UPDATEs (revert) into localStorage when offline. Replayed on reconnect.

## Key files

| File | Purpose |
|---|---|
| `src/App.tsx` | Routing + auth guard |
| `src/pages/DashboardPage.tsx` | Main: SSCC input, T9 keyboard, stats, live logs |
| `src/pages/InventoryPage.tsx` | Browse items with found status |
| `src/pages/HistoryPage.tsx` | Full event log |
| `src/components/SSCCInput.tsx` | Smart digit input + search + manual entry |
| `src/components/LiveLogs.tsx` | Realtime log feed with revert |
| `src/lib/revert.ts` | RPC-based soft-revert |
| `src/lib/offline.ts` | Offline queue |
| `supabase/schema.sql` | Full schema + RLS + function definitions |
