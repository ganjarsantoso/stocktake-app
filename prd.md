# PRD: StockTake App — Real-time Multi-User Stock Counting

## 1. Overview
A real-time, multi-user web application for physical stock counting. Users upload Excel datasets containing system inventory, then input SSCC barcode digits to reconcile physical stock against system records. All users share live-synced data without page refreshes.

## 2. Tech Stack

| Layer         | Technology                                      |
|---------------|-------------------------------------------------|
| **Frontend**  | React 18 + Vite + TypeScript + TailwindCSS + Framer Motion |
| **Backend**   | None (Supabase SDK handles all server logic)    |
| **Database**  | Supabase (PostgreSQL)                           |
| **Real-time** | Supabase Realtime (WebSocket subscriptions)     |
| **Auth**      | Supabase Auth (anonymous sessions + users table for credentials) |
| **Storage**   | Supabase Storage (Excel uploads)                |
| **PWA**       | @vite-pwa/plugin                                |
| **Excel**     | SheetJS (xlsx)                                  |
| **State**     | Zustand + @supabase/supabase-js                 |
| **Routing**   | React Router v6                                 |

### Why Supabase?
- Eliminates backend code — DB, real-time, auth, file storage from one SDK
- Built-in WebSocket real-time (no separate Socket.IO server)
- Free tier sufficient for 2–10 concurrent warehouse users
- RLS (Row Level Security) for data safety without backend
- Simple deployment (Vercel/Netlify for frontend, Supabase for data)

## 3. Pages

| Page         | Route       | Purpose |
|-------------|-------------|---------|
| **Login**   | `/login`    | First landing — user enters display name. Creates/retrieves anonymous Supabase session + user record. |
| **Dashboard** | `/`       | Main page: statistics, SSCC input, live logs, toggleable T9 keyboard. |
| **Datasets** | `/datasets` | Upload Excel, manage datasets, configure column header mapping. |
| **Settings** | `/settings` | Change display name, theme toggle (dark/light), keyboard preferences. |
| **History**  | `/history`  | Full paginated log of all found items with founder info. |

## 4. Functional Requirements

### 4.1 Login / Credential
- User enters display name on first visit (no password — lightweight warehouse context).
- Creates Supabase anonymous session + inserts row into `users` table.
- Credential persists in Zustand store (backed by localStorage + Supabase session).
- Editable in Settings page.
- RLS ensures user can only modify their own record.

### 4.2 Dataset Management
- **Upload Excel** (.xlsx/.xls): Parse via SheetJS client-side.
- **Header Mapping**: UI shows first 5 rows of uploaded file; user maps source columns to system fields (SSCC, material_code, description, system_qty, location). Save mapping as reusable template per dataset.
- **Multiple Datasets**: Create new dataset or append rows to existing.
- **Dataset Selection**: Combobox on Dashboard header switches active dataset.
- **Schema**: After mapping, data is upserted to Supabase `items` table.

### 4.3 SSCC Input (Core Feature)
- **Smart input**: User types SSCC digits. Field auto-focuses on mount.
- **Auto-search** (debounced 150ms):
  - **0–4 digits**: No search — wait for 5th digit.
  - **5 digits**: Query `items` WHERE `sscc` LIKE `'%<5digits>'` (last 5 chars).
    - **0 matches**: Show "Not Found" status.
    - **1 match + not yet found**: Auto-mark as found → broadcast `item:found` event → glow animation.
    - **1 match + already found**: Show "Already found by [founder]" with timestamp.
    - **≥2 matches**: Show picker list (candidate SSCCs with material/description). User can tap to select OR continue typing digits 6–15 to narrow. After 10 digits typed, re-query with 10-digit suffix.
  - **Auto-clear**: After successful match, input resets after 1.5s.
- **Validation**: Numeric only; max 15 digits (5–15 range for disambiguation).

### 4.4 Real-Time Sync (Supabase Realtime)
- **Channel**: `realtime-found-logs` on `found_logs` table INSERT.
- **Events received by all clients**:
  - New found log → update stats, prepend to live logs, trigger glow animation.
  - New dataset → update dataset selector.
- **No refresh needed**: Realtime subscriptions push changes instantly.

### 4.5 Dashboard Layout (Tablet-First)
```
+------------------------------------------------------------------+
|  [Logo] StockTake    Dataset: [WH-A v]    [3 online]  [Settings] |
+---------------------------------------+--------------------------+
|  STATISTICS                           |  SSCC INPUT              |
|  +----------------------------------+ |  +----------------------+ |
|  |    Progress Ring                 | |  | [ _ _ _ _ _ ] 5/15  | |
|  |    45 / 200  (22%)               | |  | Status: Found        | |
|  +----------------------------------+ |  +----------------------+ |
|  Team:  Alice  20                    |  | [Toggle Keyboard]    | |
|         Bob    25                    |  | +------------------+ | |
|  You:         5                      |  | | 1   2   3        | | |
|                                      |  | | 4   5   6        | | |
|  LIVE LOGS                           |  | | 7   8   9        | | |
|  +----------------------------------+ |  | | <- CLR 0  AC    | | |
|  | [glow] Bob found Mat #456   1s   | |  | +------------------+ | |
|  | [glow] You found Mat #123   3s   | |  +----------------------+ |
|  +----------------------------------+ |                          |
+---------------------------------------+--------------------------+
|  [Dashboard] [Datasets] [History] [Settings]                     |
+------------------------------------------------------------------+
```

### 4.6 T9 Keyboard
- **Toggleable**: Button on Dashboard shows/hides keyboard.
- **Resizable**: Drag handle on right edge; size saved to Zustand (localStorage).
- **Layout**:
  ```
  [1] [2] [3]
  [4] [5] [6]
  [7] [8] [9]
  [BK] [CLR] [0] [CA]
  ```
  - BK = Backspace (delete last digit)
  - CLR = Clear input
  - CA = Clear All (reset + blur)
- **Styling**: Large touch-friendly buttons (>=56px), active press state.
- **Behavior**: Each tap appends digit to SSCC input field, triggering auto-search.

### 4.7 Logs & Animated Glow
- **Live logs**: Dashboard shows last 15 logs in reverse chronological order.
- **First founder rule**: `found_logs` INSERT checks if `item_id` already has a log. If yes, reject with "already found" message (does not create duplicate log).
- **Glow animation**: On receiving new log via Realtime:
  - Card animates in (slide + fade, 300ms)
  - Golden glow pulse for 3 seconds (box-shadow animation)
- **History page**: Full paginated list with search/filter by user, material, date.

### 4.8 Statistics
- **Progress ring**: Circular SVG proportional to found/total ratio.
- **Counts**: Total items, Found items, Remaining, Percentage.
- **Per-user breakdown**: List of users + their found count.
- **Real-time**: All stats update immediately via Realtime subscription.

### 4.9 Settings
- Change display name (updates `users` table).
- Toggle dark/light theme (Tailwind `dark` class, persisted to localStorage).
- Keyboard default state (shown/hidden on dashboard load).
- Keyboard size (small/medium/large).

## 5. Data Model (Supabase / PostgreSQL)

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uid UUID UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Datasets
CREATE TABLE datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  header_mapping JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Items
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
  sscc TEXT NOT NULL,
  material_code TEXT,
  description TEXT,
  system_qty NUMERIC,
  location TEXT,
  UNIQUE(dataset_id, sscc)
);
CREATE INDEX idx_items_sscc ON items(sscc);
CREATE INDEX idx_items_sscc_suffix ON items(SUBSTRING(sscc, GREATEST(LENGTH(sscc) - 4, 1), 5));

-- Found logs
CREATE TABLE found_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id),
  dataset_id UUID REFERENCES datasets(id),
  found_by UUID REFERENCES users(id),
  found_by_name TEXT,
  material_code TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_found_logs_item ON found_logs(item_id);

-- Enable Realtime for found_logs
ALTER PUBLICATION supabase_realtime ADD TABLE found_logs;
```

## 6. Non-Functional Requirements

| Requirement   | Target |
|---------------|--------|
| Search latency | <200ms for 5-digit SSCC match on 10K items |
| Real-time delay | <500ms from one user finding to another seeing it |
| Touch targets | >=48px (WCAG 2.1), >=56px preferred on tablet |
| PWA | Installable, offline-capable |
| Dark mode | Full Tailwind dark variant support |
| Responsive | 1024x600 (tablet) -> 375x667 (phone) |
| Accessibility | Screen reader labels, focus management, keyboard nav |

## 7. Out of Scope (v1)
- Barcode scanner camera integration
- Export to Excel/PDF
- WMS integration API
- Multi-language i18n
- Role-based access control
