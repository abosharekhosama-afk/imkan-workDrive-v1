# ARCHITECTURE.md — IMKAN WorkDrive

> Auto-generated baseline spec. This document describes the **actual** current state of the codebase as of 2026-09-12. Read this before making changes to avoid re-scanning the entire project.

---

## 1. Tech Stack

### Frontend
| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Next.js (App Router) | 16.3.1 |
| UI Library | React | 19.2.8 |
| Styling | Tailwind CSS v4 | ^4 |
| Language | TypeScript | ^5 |
| UI Primitives | Radix UI Popover | ^1.1.23 |
| PDF Rendering | pdfjs-dist | ^6.2.108 |
| HTTP Client | Native fetch (custom `apiRequest` wrapper) | — |
| Auth | jsonwebtoken (dev-only) | ^9.0.3 |
| E2E Testing | Playwright | ^1.55.0 |
| PostCSS | @tailwindcss/postcss | ^4 |

### Backend
| Category | Technology | Version |
|----------|-----------|---------|
| Framework | NestJS | ^11.0.1 |
| ORM | Prisma | ^6.13.0 |
| Database | MySQL 8.0 | — |
| Object Storage | AWS SDK (S3-compatible) + MinIO | ^3.1111.0 |
| Cache/Session | Redis 7-alpine | — |
| Auth | JWT (jsonwebtoken) | ^9.0.3 |
| Language | TypeScript | ^5.7.3 |
| Testing | Jest + Supertest | ^30.0.0 |

---

## 2. Directory Structure

```
imkan-workDrive-v1-2-release/
├── frontend/                    # Next.js 16 App Router frontend
│   ├── src/
│   │   ├── app/                 # Route pages (App Router)
│   │   │   ├── admin/
│   │   │   ├── auth/            # login, signup, forgot-password, reset-password, callback
│   │   │   ├── files/           # Main file browser routes
│   │   │   │   ├── [folderId]/  # Dynamic folder view
│   │   │   │   ├── recent/
│   │   │   │   ├── favorites/
│   │   │   │   ├── shared-with-me/
│   │   │   │   ├── shared-links/
│   │   │   │   ├── team-folders/
│   │   │   │   ├── trash/
│   │   │   │   └── activity/
│   │   │   ├── notifications/
│   │   │   ├── organization/
│   │   │   ├── settings/
│   │   │   ├── share/
│   │   │   ├── layout.tsx       # Root layout
│   │   │   ├── page.tsx         # Root page
│   │   │   └── globals.css      # Global styles + Tailwind theme
│   │   ├── components/          # React components
│   │   │   ├── file-preview/    # File preview component
│   │   │   ├── files/           # Version history drawer
│   │   │   ├── layout/          # Shell, sidebar, header, inspector, navigation
│   │   │   ├── preview/         # Archive, code, image, media, office, PDF viewers
│   │   │   ├── version-history/ # Version history restore modal + list
│   │   │   └── [60+ components] # UI components (modals, tables, icons, etc.)
│   │   ├── i18n/                # Internationalization (en + ar)
│   │   ├── lib/
│   │   │   ├── api/             # API client modules (30+ files)
│   │   │   ├── friendly-error.ts
│   │   │   ├── localized.ts
│   │   │   ├── permissions.ts
│   │   │   ├── preview-blob.ts
│   │   │   ├── use-ranged-stream.ts
│   │   │   └── workspace-routes.ts
│   │   └── styles/
│   │       └── imkan-tokens.css # Design token fallbacks
│   ├── e2e/                     # Playwright E2E tests
│   ├── public/                  # Static assets
│   ├── next.config.ts           # Next.js config (redirect / → /auth/login)
│   ├── postcss.config.mjs       # PostCSS with @tailwindcss/postcss
│   └── playwright.config.ts     # Playwright configuration
│
├── backend/                     # NestJS 11 backend
│   ├── src/
│   │   ├── admin/               # Admin module
│   │   ├── audit/               # Audit logging
│   │   ├── auth/                 # Authentication (JWT, guards, decorators)
│   │   ├── comments/            # Comments module
│   │   ├── common/              # Shared utilities
│   │   ├── crypto/              # Secret hashing
│   │   ├── favorites/           # Favorites module
│   │   ├── files/               # File operations (CRUD, trash, versions, upload)
│   │   ├── folder-permissions/  # Folder-level permissions
│   │   ├── folders/             # Folder operations
│   │   ├── notifications/       # Notifications module
│   │   ├── organization/        # Organization management

---

## 3. State Management

### Frontend State
- **React Context** (`ShellContext`): Manages layout state (sidebar collapse, inspector panel, mobile nav, selected resource for inspector)
- **React useState**: Component-level state for forms, modals, lists
- **localStorage**: Persists UI preferences (sidebar state, inspector state, view mode, theme, locale)
- **sessionStorage**: Current folder scope context
- **Custom Events**: `workdrive:inspector-select`, `workdrive:scope`, `workdrive:preview-by-id`, `workdrive:version-history` — decoupled component communication

### Backend State
- **JWT Stateless Auth**: Bearer tokens with 8-hour cookie expiry
- **Prisma Connection Pool**: Database access via Prisma Client
- **Redis**: Session/cache layer
- **MinIO/S3**: Object storage for file bytes

---

## 4. Routing

### Frontend Routes (Next.js App Router)
| Route | Description |
|-------|-------------|
| `/` | Redirects to `/auth/login` |
| `/auth/login` | Login page |
| `/auth/signup` | Signup page |
| `/auth/forgot-password` | Forgot password page |
| `/auth/reset-password` | Reset password form |
| `/auth/callback` | OAuth callback |
| `/files` | Root file browser (personal files) |
| `/files/[folderId]` | Folder contents view |
| `/files/recent` | Recently accessed files |
| `/files/favorites` | Favorited files |
| `/files/shared-with-me` | Files shared with current user |
| `/files/shared-links` | Public shared links |
| `/files/team-folders` | Team folders management |
| `/files/trash` | Trashed files |
| `/files/activity` | Activity feed |
| `/files/fileId/preview` | File preview page |
| `/notifications` | Notifications page |
| `/organization` | Organization management |
| `/organization/invitations/accept` | Accept invitation |
| `/settings` | User settings |
| `/share/public` | Public share page |
| `/admin` | Admin dashboard |


---

## 5. Database Schema (Key Models)

### Core Models
- **Organization**: Multi-tenant organization entity
- **User**: User accounts with auth
- **OrganizationMembership**: User-Org link (roles: SUPER_ADMIN, ADMIN, MEMBER)
- **Folder**: Hierarchical folder structure (types: PERSONAL, TEAM_FOLDER_ROOT, TEAM_FOLDER_SUB, etc.)
- **File**: File records with metadata (status: ACTIVE, TRASHED, ARCHIVED, PURGED)
- **FileVersion**: Version history for files

### Access Control
- **Share**: File/folder sharing with permissions
- **TeamFolder**: Team workspace root folders
- **TeamFolderMember**: Team membership with roles (ADMIN, ORGANIZER, EDITOR, COMMENTER, VIEWER)
- **FolderPermission**: Per-folder access levels (NONE, VIEW, COMMENT, EDIT, ORGANIZE)
- **FolderInvite**: Pending folder invitations

### Activity & Audit
- **AuditLog**: Action audit trail
- **Notification**: User notifications
- **Comment**: File/folder comments

### Security
- **SecurityPolicy**: Per-org security settings (MFA, sharing restrictions)
- **RetentionPolicy**: Data retention rules (trash days, version limits)
- **MalwareScan**: File scan results
- **UserDevice**: Tracked user devices
- **SecurityEvent**: Security event log

### Storage
- **DataTransfer**: Cross-org data transfer records
- **NotificationPreference**: User notification settings

---

## 6. API Client Pattern

The frontend uses a centralized `apiRequest<T>()` wrapper:
- Base URL from `NEXT_PUBLIC_API_BASE_URL` env or `https://imkan-workdrive-v1.onrender.com`
- Bearer token from localStorage/cookies
- Auto-redirect to `/auth/login?expired=true` on 401
- `ApiError` class with status code and machine-readable error codes
- SSR support via `next/headers` cookies

### Token Storage
- `localStorage.workdrive_access_token` (primary)
- Cookie `workdrive_access_token` (for SSR, 8-hour max-age, SameSite=Lax)

---

## 7. Authentication Flow

1. User submits credentials → POST `/auth/login`
2. Server returns `{ access_token, user }`
3. Client saves to localStorage + cookie
4. Subsequent requests include `Authorization: Bearer <token>`
5. 401 responses trigger automatic redirect to login screen
6. DevAuthToolbar (non-production) provides test user login

---

## 8. Conventions

### File Naming
- Components: PascalCase (`FileTable.tsx`, `PrimarySidebar.tsx`)
- API modules: camelCase (`files.ts`, `auth.ts`)
- Logic files: `*-logic.ts` for testable pure functions
- Spec files: `*.spec.ts` alongside source
- Schemas: `*.schema.ts` for Zod validation

### Path Aliases
- Frontend: `@/*` → `./src/*`

### CSS Approach
- Tailwind v4 utility classes (primary)
- IMKAN One CSS custom properties (design tokens)
- Component-specific classes prefixed with `imkan-` or `wd-`

### Testing
- Backend: Jest with `*.spec.ts` pattern, `ts-jest` transform
- Frontend: Node.js native test runner for logic specs
- E2E: Playwright with browser tests

---

## 9. Build & Run

### Development
```bash
# Backend (port 3001)
cd backend && npm run start:dev

# Frontend (port 3000)
cd frontend && npm run dev

# Infrastructure
docker-compose up -d  # MySQL + MinIO + Redis
```

### Production
```bash
# Backend
cd backend && npm run build && npm run start:prod

# Frontend
cd frontend && npm run build && npm run start
```

---

*Generated: 2026-09-12 from commit 9472ff6 on branch v2-release*

### Backend API Routes (NestJS)
All routes are module-prefixed:
| Module | Base Path |
|--------|-----------|
| Auth | `/auth` |
| Files | `/files` |
| Folders | `/folders` |
| Shares | `/shares` |
| Search | `/search` |
| Audit | `/audit` |
| Team Folders | `/team-folders` |
| Favorites | `/favorites` |
| Recent | `/recent` |
| Notifications | `/notifications` |
| Comments | `/comments` |
| Quota | `/quota` |
| Admin | `/admin` |
| Organization | `/organization` |
| Folder Permissions | `/folder-permissions` |
| Storage | `/storage` |

│   │   ├── permissions/         # Enterprise permissions service
│   │   ├── prisma/              # Prisma service + tenant scoping
│   │   ├── quota/               # Storage quota management
│   │   ├── recent/              # Recent files
│   │   ├── search/              # Search service
│   │   ├── shares/              # Sharing module
│   │   ├── storage/             # Storage adapters (local disk + S3-compatible)
│   │   ├── team-folders/        # Team folders module
│   │   ├── app.module.ts        # Root module (imports all feature modules)
│   │   └── main.ts              # Bootstrap (CORS enabled, port 3001)
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema (20+ models)
│   │   ├── seed.ts              # Database seeder
│   │   └── migrations/          # Prisma migrations
│   └── test/                    # Backend unit tests
│
├── database/
│   └── backup-v1/               # Database backup
├── docs/                        # Project documentation (15+ subdirectories)
├── specs/                       # Feature specs (specify workflow)
│   ├── 001-team-folders-acl/
│   ├── 002-file-preview-ui/
│   └── 003-version-history-ui/
├── docker-compose.yml           # MySQL + MinIO + Redis
├── .env                         # Environment variables (git-ignored)
├── .env.example                 # Environment template
└── .gitignore
```

| Validation | Zod (via schema.ts files) | — |

### Infrastructure
| Service | Technology |
|---------|-----------|
| Database | MySQL 8.0 (docker-compose) |
| Object Storage | MinIO (docker-compose) |
| Cache | Redis 7-alpine (docker-compose) |
| Deployment | Render (production backend) |
