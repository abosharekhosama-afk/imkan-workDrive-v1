# ZOHO_WORKDRIVE_SPEC.md — Extracted Visual & Behavioral Specifications

> **Provenance note (important).** This spec was produced by attempting a live Playwright
> exploration of `https://workdrive.zoho.com` and, because the application shell is
> authentication-gated, supplementing it with Zoho's official WorkDrive Knowledge Base
> (`help.zoho.com/portal/en/kb/workdrive`).
>
> **Live-probe findings (`frontend/zoho-probe.mjs`, Playwright 1.62 / Chromium 1228):**
>
> | Route | Result |
> |---|---|
> | `workdrive.zoho.com/` | Serves the **marketing** site only (pricing, feature copy). No app shell DOM. |
> | `workdrive.zoho.com/files` | Returns an **empty HTTP 500 edge page** from this network (no `<header>`, no buttons, body bg `rgb(255,255,255)`). Real navigation requires a signed-in session at `accounts.zoho.com`. |
>
> No Zoho credentials exist in this repository (the repo's own `frontend/e2e` suite targets
> the local backend, not Zoho). **Authenticated DOM extraction was therefore not possible.**
> All hex values below are the implemented Zoho-accurate theme values used in this codebase;
> behavioral specs are sourced from Zoho's official documentation. To validate pixel-exact
> values against a live tenant, re-run `node frontend/zoho-probe.mjs` with a session cookie
> or Playwright `storageState` from a network that can reach Zoho.

---

## 1. Tier 2 — Top Header (height 56px, `bg-white`, `border-b`)

### 1.1 Layout
- Single flex row, height **56px** (`h-14`), horizontal padding **12px** (`px-3`), gap 8px.
- Left cluster: mobile hamburger (≤768px only) → **folder icon chip** (32×32, rounded-md,
  `bg-[#E8EFFD]`, icon color `#1B66EA`) → current folder name (14px/600, `#0F172A`,
  truncated at `30vw`, title-attr fallback "My Folders") → **Manage ▾** text button
  (12px/600, `#64748B`, hover `bg-slate-100`, hidden < 640px).
- Right cluster: org switcher → search → bell → help → app grid → theme → locale → avatar,
  all 17px icons, `p-2` hit areas, hover `bg-slate-100` / `bg-slate-50`.

### 1.2 Manage ▾ menu (per Zoho KB "Copy or move files and folders", "Share")
Portal menu, width 224px, `rounded-lg`, border `#E2E8F0`,
shadow `0 12px 32px rgba(16,24,40,.16)`, items 13px, hover `bg-[#EEF3FE]` text `#1B66EA`:
1. Rename · 2. Move · 3. Copy *(future)* — sep — 4. Share… · 5. Manage members ·
6. Download · sep — 7. **Move to Trash** (danger, red-600, hover `bg-red-50`).

### 1.3 IMKAN ▾ Org switcher
Button shows workspace name + `chevD`; menu lists memberships with ✓ on active
(`listMemberships()`), sep, "Create organization" / "Organization settings".

### 1.4 Search
Icon button opens centered overlay (`w-[min(36rem,92vw)]`, top 80px): query row with
magnifier + `ESC` kbd chip; results grouped **Folders** then **Files** (folder rows
navigate `/files/{id}`, file rows dispatch `workdrive:preview-by-id`); debounced 220ms
via `searchNames()`. `Ctrl/⌘+K` opens globally (existing `GlobalSearch`).

### 1.5 Bell
Unread count badge (`listNotifications()`, red dot, count > 99 → "99+"), aria-live.

---

## 2. Tier 3 — Action Toolbar (height ~42px, `bg-white`, `border-b`, `px-3 py-2`)

### 2.1 `+ New` (primary)
- Style: `bg-[#1B66EA]`, hover `#1556C7`, text white, 13px/500, `px-4 py-1.5 rounded-md`.
- Menu (portal, `w-60`), per Zoho KB "Create, upload, and import files and folders":
  - **CREATE NEW** header → Folder, Document, Spreadsheet, Presentation.
  - separator.
  - **UPLOAD** header → Common Uploads (files), Folder Upload.
- Actions dispatch: `workdrive:new-folder`, `workdrive:new-doc {kind}`, `workdrive:trigger-upload`.

### 2.2 `Record ▾` (secondary, outlined `border-slate-200`, hidden < 640px)
Menu: **Screen recording · Video recording · Audio recording** → `workdrive:record {kind}`.

### 2.3 View & filter utilities (right-aligned, `ms-auto`, gap 6px)
- **Sort** toggle: up+down arrows icon (`Icons.sort`), toggles asc/desc, tooltip
  Ascending/Descending.
- **Filter** funnel icon (`Icons.funnel`), checkmark menu (`w-52`, align-end), persisted to
  `localStorage["zoho.filter"]`: All · Folders · Documents · Spreadsheets · Presentations ·
  Photos & Videos · Audio · Archives · Favorites.
- **List/Grid switcher**: bordered segmented control; active segment `bg-slate-900 text-white`;
  persists via `persistViewMode` (`workdrive_view_mode`).
- Left-most tree-toggle icon button (tree navigation view, per Zoho KB "Tree Navigation view").

### 2.4 Contextual Selection Bar (renders directly below toolbar)
Triggered when ≥1 item checked. Style: `bg-[#EEF3FE]`, `border-b border-[#C9D8F8]`,
`px-3 py-1.5`, `role="status" aria-live="polite"`.
- Left: ✕ clear button (`#1B66EA`) + count text 13px/600 `#1B3A7A`, exact strings:
  "**1 folder selected**" / "N folders selected" / "N files selected" / "N items selected".
- Right actions (Zoho KB "Share files and folders"):
  - **Share ▾** — white pill, blue border/text (`#1B66EA`), menu: Share (modal) · Copy permalink.
  - **Copy link** (chain icon, instant permalink copy + toast).
  - **Download** (`Icons.download`).
  - **…** overflow.

### 2.5 Empty folder quick actions (per Zoho empty state)
Centered illustration (56px folder in `bg-[#EEF3FE]` tile, `rounded-2xl`), caption
"Drag files here or use a quick action" (13.5px `#64748B`), then three outlined buttons
(`px-4 py-2`, `shadow-sm`): **Create ▾ · Upload ▾ · Record ▾** with the same menus as §2.1/2.2.

---

## 3. Tier 4 — Right dock (vertical, `w-12`, `border-s`)
Icons top→bottom: **Details** (`info`) · **Data Templates** (`tag`) · **Zia AI** (`spark`) ·
Accessibility · Theme. Active icon: `bg-[#E8EFFD] text-[#1B66EA]`. Details opens the
`w-80` panel with **Details / Activity** tabs (per Zoho KB "Data Templates" article,
templates render as custom-field chips; Zia opens suggestions). Version history button in
Details dispatches `workdrive:version-history` → `VersionHistoryDrawer`.

## 4. Behavioral invariants (from Zoho KB, must not regress)
- Sort orders by **name, date modified, size, type**; filter narrows by file type.
  (FileTable internal sort already covers name/modified/size.)
- Share supports: permalink, share link (password/expiry), download link, embed code,
  direct members, external email. UI currently exposes Share modal + copy permalink —
  the rest are options inside `ShareModal`.
- Selection must survive sort/filter re-render (IDs held in FileBrowser state).
- RTL: all positioning via logical properties; portals recompute `left/right` from `document.dir`.

## 5. Files implementing this spec
`frontend/src/components/layout/{top-header,action-toolbar,selection-bar,folder-empty-state,zoho-menu,icons,shell-context}.tsx`,
`frontend/src/components/{file-browser,file-table}.tsx`.

## 6. Zoho-parity interactions added (no backend changes)
- **Right-click context menu** (`file-context-menu.tsx`): portal menu at cursor, reuses
  `buildFileRowActions` so it stays in sync with the ⋯ row menu; adds a **Copy link** action
  before Share; ESC/outside-click closes; arrow-key + Enter navigation; auto-clamps to
  viewport. Wired to both folder and file rows in `file-table.tsx`.
- **Shift+Click range selection**: checking a row while holding Shift selects the whole
  visible range between the anchor row and the clicked row (folders then files in render
  order). Uses `onClick` (MouseEvent `shiftKey`); feedback flows through the existing
  Selection Bar. The select-all checkbox also updates the anchor.
- **Copy link** from context menu and Selection Bar writes `${origin}/files/{id}` to the
  clipboard, matching the permalink pattern.
