# UI_UX_PARITY.md — IMKAN WorkDrive Design System

> Auto-generated baseline spec. Documents the **actual** design tokens, colors, spacing, typography, and UI component styling currently in use. Do not invent new values — extend from this contract.

---

## 1. Design Token System

The project uses the **IMKAN One Design System** as its visual authority. The official `@imkan/design-system` NPM package is NOT installed; values below are LOCAL FALLBACKS that compile without the package. All non-primary tokens will be replaced when the official package becomes available.

### Token File Location
- `frontend/src/styles/imkan-tokens.css` — fallback token definitions
- `frontend/src/app/globals.css` — Tailwind v4 `@theme inline` bindings + semantic CSS utilities

---

## 2. Color Palette

### Light Mode (Default)
| Token | Hex Value | Usage |
|-------|-----------|-------|
| `--imkan-color-bg` | `#ffffff` | Page background |
| `--imkan-color-fg` | `#222222` | Primary text |
| `--imkan-color-muted` | `#667085` | Secondary/muted text |
| `--imkan-color-surface` | `#f7f8fa` | Card/panel backgrounds |
| `--imkan-color-primary` | `#2C66DD` | ✅ **AUTHORITATIVE** — IMKAN One primary (do not change) |
| `--imkan-color-border` | `#e5e7eb` | Borders, dividers |
| `--imkan-color-focus` | `#2C66DD` | Focus ring color (alias of primary) |

### Dark Mode (`html[data-theme="dark"]`)
| Token | Hex Value | Usage |
|-------|-----------|-------|
| Background | `#0f1419` (`--wd-canvas`) | Page background |
| Surface | `#171c22` (`--wd-bg`) | Card/panel backgrounds |
| Text | `#f1f5f9` (`--wd-text`) | Primary text |
| Muted | `#94a3b8` | Secondary text |
| Primary | `#3b82f6` | Accent (differs from light mode) |
| Border | `#2e3b52` (`--wd-line`) | Borders, dividers |
| Hover | `#1c2128` (`--wd-hover`) | Hover state backgrounds |
| Green Accent | `#26c281` (`--wd-primary`) | Success/active states |

### Zoho-Inferred Accent Colors (from globals.css)
| Hex Value | Usage |
|-----------|-------|
| `#2C66DD` | Primary action blue (buttons, links, active states) |
| `#1B66EA` | Link/search highlight blue |
| `#254993` | Dark inspector active text |
| `#212121` | Header icon button text |
| `#4F4F4F` | Inspector metadata labels |
| `#EDEDED` | Header/inspector borders |
| `#F0F4FF` | Inspector dock active background |
| `#F3F5F7` | Inspector dock hover background |
| `#EEF3FE` | Search result hover background |
| `#DBE3FA` | Sidebar active text/icon |
| `#EEEEEE` | Sidebar default text |
| `#9CA3AF` | Sidebar muted/secondary text |

---

## 3. Typography

### Font Families
| Token | Value | Status |
|-------|-------|--------|
| `--imkan-font-latin` | `system-ui, sans-serif` | FALLBACK — replace with "Zoho Puvi" when available |
| `--imkan-font-arabic` | `system-ui, sans-serif` | FALLBACK — replace with "IBM Plex Sans Arabic" when available |

### Font Sizes
| Token | Value | Usage |
|-------|-------|-------|
| `--imkan-font-size-ui` | `14px` | ✅ Body text, inputs, buttons |
| `--imkan-font-size-secondary` | `12px` | ✅ Secondary text, metadata |
| `--imkan-font-size-meta` | `10px` | ✅ Meta information, timestamps |

### Component-Specific Sizes
| Size | Usage |
|------|-------|
| `17px` | Sidebar app title |
| `14px` | Sidebar nav items, body text |
| `13.5px` | Search results |
| `13px` | Inspector labels, filter chips, version history items |
| `12.5px` | Team folder links, audit log items |
| `12px` | Inspector values, metadata |
| `11px` | Inspector dock labels |
| `10.5px` | Keyboard shortcut hints |

### Font Weights
| Weight | Usage |
|--------|-------|
| `400` (normal) | Body text, metadata |
| `500` (medium) | Buttons, nav items |
| `600` (semibold) | Section headings |
| `700` (bold) | Active nav items |

---

## 4. Spacing Scale

### IMKAN One Spacing

---

## 5. Borders & Radius

### Border Widths
| Value | Usage |
|-------|-------|
| `1px` | Standard borders (inputs, cards, dividers) |

### Border Radius
| Value | Usage |
|-------|-------|
| `8px` | Sidebar app switcher button |
| `12px` | Audit log items |
| `16px` | Nav items, inspector buttons, search results |
| `rounded-full` | Toggle buttons, avatars |
| `rounded-xl` | Search modal |
| `rounded-lg` | Filter dropdown menus |

### Border Colors
| Color | Usage |
|-------|-------|
| `#EDEDED` | Header, inspector, auth card borders |
| `rgba(0,0,0,0.1)` | Shadow-based borders |
| `var(--wd-line)` | Dark mode borders |

---

## 6. Shadows

| Value | Usage |
|-------|-------|
| `0 1px 2px rgba(0,0,0,0.3)` | Sidebar header shadow |
| `0 6px 24px rgba(0,0,0,0.1)` | Mobile nav drawer, mobile inspector |
| `0 14px 40px rgba(0,0,0,0.45)` | Dark mode dropdown menus |
| `0 18px 48px rgba(0,0,0,0.5)` | Dark mode search panel |
| `0 22px 60px rgba(0,0,0,0.55)` | Dark mode upload toast |
| `shadow-2xl` | Search modal (Tailwind) |
| `shadow-lg` | Filter dropdown, toggle button (Tailwind) |

---

## 7. Component Styling Reference

### Buttons
| Class | Styling |
|-------|---------|

---

## 8. Layout Structure

### Shell Layout
```
┌─────────────────────────────────────────────────────┐
│ TopHeader (h-12, border-b #EDEDED, bg white)        │
├──────────┬──────────────────────────────┬───────────┤
│ Primary  │        Main Content          │ Inspector │
│ Sidebar  │        (flex-1)              │ Dock      │
│ (264px   │                              │ (wd-rail) │
│  or 64px)│                              │           │
└──────────┴──────────────────────────────┴───────────┘
```

### Breakpoints (Tailwind v4 default)
| Breakpoint | Width |
|------------|-------|
| `sm` | 640px |
| `md` | 768px |
| `lg` | 1024px |
| `xl` | 1280px |

### Responsive Behavior
- **Desktop (md+)**: Sidebar visible (collapsible), inspector dock visible
- **Mobile (<md)**: Sidebar hidden (hamburger toggle), inspector as overlay drawer

---

## 9. Internationalization (i18n)

### Supported Locales
| Locale | Code | Direction |
|--------|------|-----------|
| English | `en` | LTR |
| Arabic | `ar` | RTL |

### Implementation
- Locale stored in `localStorage.workdrive_locale`
- Pre-paint script in root layout sets `<html lang dir>` before first paint
- `LocaleProvider` component hydrates message catalog
- Message files: `frontend/src/i18n/messages/en.json`, `ar.json`
- `MessageKey` type derived from `en.json` keys

---

## 10. Theme System

### Light/Dark Mode
- Controlled via `html[data-theme="dark"]` selector
- Dark mode colors use `--wd-*` CSS custom properties
- Theme toggle component: `ThemeToggle`
- Persisted in localStorage

### Dark Mode Color Mapping
| Light | Dark |
|-------|------|
| `#ffffff` bg | `#0f1419` canvas |
| `#222222` text | `#f1f5f9` text |
| `#f7f8fa` surface | `#171717` bg |
| `#e5e7eb` border | `#2e3b52` line |
| `#2C66DD` primary | `#2C66DD` primary (`--wd-primary`) |

---

*Generated: 2026-09-12 from commit 9472ff6 on branch v2-release*

| `.imkan-button` | Primary: bg `var(--imkan-color-primary)`, text `var(--imkan-color-bg)`, padding `0.375rem 0.75rem`, weight 500 |
| `.imkan-button-secondary` | Surface bg, border `var(--imkan-color-border)`, text `var(--imkan-color-fg)` |
| `.wd-icon-btn` | Icon-only buttons in header |

### Inputs
| Class | Styling |
|-------|---------|
| `.imkan-input` | Standard form input (border, padding inherited from globals) |
| Search input | `bg-transparent text-[14px] outline-none placeholder:text-slate-400` |

### Panels
| Class | Styling |
|-------|---------|
| `.imkan-panel` | `background: var(--imkan-color-surface)`, `border: 1px solid var(--imkan-color-border)` |
| `.wd-drawer` | Inspector panel (width handled by parent) |
| `.wd-card` | Content card with border |

### Sidebar
| Element | Styling |
|---------|---------|
| Container | `bg-[#282828] text-[#EEEEEE]` |
| Active nav | `bg-[rgba(44,102,221,0.3)] font-bold text-[#DBE3FA]` |
| Hover nav | `hover:bg-white/[0.08]` |
| Muted text | `text-[#9CA3AF]` |

### Inspector Dock
| State | Styling |
|-------|---------|
| Active | `bg-[#F0F4FF] text-[#254993]` |
| Hover | `hover:bg-[#F3F5F7]` |
| Default | `text-[#212121]` |

| Token | Value | Usage |
|-------|-------|-------|
| `--imkan-space-sm` | `8px` | Default gap for `.imkan-page` |

### Tailwind Spacing (commonly used)
| Value | Usage |
|-------|-------|
| `0.5rem` (8px) | Button gaps, tight spacing |
| `0.75rem` (12px) | Input padding-inline |
| `1rem` (16px) | Standard padding, gaps |
| `1.5rem` (24px) | Section padding |
| `2rem` (32px) | Large gaps |

### Component-Specific Spacing
| Component | Spacing |
|-----------|---------|
| Sidebar nav item | `px-[15px] py-0` (horizontal 15px, full height h-10) |
| Sidebar nav gap | `gap-4` (16px) between icon and text |
| Header height | `h-12` (48px) |
| Inspector dock button | `min-h-[65px] px-[7px] py-[7px]` |
| Search modal | `w-[min(36rem,92vw)]`, max-height `50vh` |
| Sidebar width (expanded) | `w-[264px]` |
| Sidebar width (collapsed) | `w-16` (64px) |

| `#282828` | Sidebar background (dark) |
