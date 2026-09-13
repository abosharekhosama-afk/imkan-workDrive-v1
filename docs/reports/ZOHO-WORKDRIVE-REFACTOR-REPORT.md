# Zoho WorkDrive Level Refactor Report & Action Plan

**Project:** IMKAN WorkDrive (`imkan-workDrive-v1-2`) · **Date:** 2026-08-27 · **Role:** Lead Solutions Architect
**Baseline:** NestJS 11 + Prisma 6 (MySQL) · Next.js 16 + React 19 · Node 24 · Storage drivers `local|s3`
**Test posture at audit:** Backend jest 26/30 suites green (the 4 red suites are diagnosed in §1); Frontend tsc clean, node-test 41/41 green.

---

## Executive Summary

The platform is **architecturally closer to Zoho WorkDrive than the tasking assumed**: a global `User` identity, `OrganizationMembership` joins with per-membership `personalFolderId`, a `FolderType.PERSONAL` classification, HMAC-signed storage URLs, an AutoLocalStorage tenant context injected into Prisma via `$extends`, bulk move/trash/delete, XHR upload progress, and version history already exist.

The real gaps are **(a)** two *contradictory authorization test-suites* proving that “admins may read personal files” shipped historically and still lives in the repo as a failing suite, **(b)** admin telemetry (`largeFiles`) exposing other users’ *personal file names*, **(c)** a preview/streaming layer lacking `Content-Disposition: inline`, Range requests, thumbnails, and storing a wrong default mimetype, and **(d)** multi-tenancy that is sound server-side but fragile client-side (single-token localStorage, fixed 8h JWT, no cross-tab switch broadcast).

Fix cost is concentrated and bounded: **≈ 13 focused changes** (§3) reach parity. Nothing requires a rewrite.

### Severity Register

| ID | Area | Severity | Title |
|---|---|---|---|
| PRV-01 | Privacy | 🔴 P0-High | Admin dashboard exposes personal file names/sizes/owners (`largeFiles` raw SQL) |
| PRV-02 | Privacy | 🔴 P0-Policy | Contradictory authz suites: legacy asserts admin/peer **can** read personal; regression suite forbids it (red baseline = drift hazard) |
| PRV-03 | Privacy/Tenancy | 🟠 P1 | Prisma `$extends` scopes `find*`/`updateMany`/`deleteMany` only; singular `update`/`delete` rely on scattered manual `orgId !==` guards |
| PRV-04 | Tenancy hygiene | 🟡 P2 | `TENANT_SCOPED_MODELS` duplicated in two modules with divergent contents (`User` listed, yet excluded at runtime) |
| PRV-05 | Schema | 🟡 P2 | No DB constraint binding `folderType='PERSONAL' ⇒ teamFolderId IS NULL` |
| PVW-01 | Preview | 🔴 P0 | Upload transport defaults `Content-Type: application/pdf` for *every* file when browser type is empty; wrong bytes/type baked into token + `StorageObject` |
| PVW-02 | Preview | 🟠 P1 | `GET /storage/objects` buffers whole file in RAM; no `Accept-Ranges`/206, no ETag/Cache-Control, no `HEAD` |
| PVW-03 | Preview | 🟠 P1 | No `Content-Disposition: inline; filename*=…`; download-and-open flows and legacy octet-stream rows force raw downloads |
| PVW-04 | Preview | 🟡 P2 | No thumbnail pipeline; CORS uses `origin: true` (reflect-any); pdf.js worker/version pinning unmanaged |
| TEN-01 | Multi-org | 🟠 P1 | Client keeps one bearer token in a single localStorage key; org switch has no cross-tab/event propagation; switch does not revoke prior session |
| TEN-02 | Multi-org | 🟡 P2 | JWT TTL fixed 8h, `expiresIn` literal duplicated with session row math; no refresh rotation; suspended members blocked only because guard re-checks per request (good) but tokens never rotate |
| UX-01 | Files | 🟡 P2 | Zip-download, batch-copy, batch-restore absent; share-link expiry controls exist as org policy only (no per-share editor) |
| UX-02 | Admin | 🟡 P2 | No per-user/department storage metrics; sharing audit exists as flat table (no actor/resource drill-down export) |

---

## Section 1 — Root Cause Analysis & Security Audit

### 1.1 Personal vs. Organization Isolation

**What already enforces the Zoho boundary (verified):**

| Layer | Evidence |
|---|---|
| Data model | `Folder.folderType` enum (`PERSONAL`, `TEAM_FOLDER_ROOT/SUB`, `ARCHIVED_MEMBER`, `SHARED_WITH_ME`); `OrganizationMembership.personalFolderId @unique → Folder` (schema.prisma L81‑L119) |
| Creation path | Personal folder minted per membership in one transaction with `folderType:'PERSONAL'`, `ownerId=userId` (auth.service.ts L196‑L211; organization.service.ts L320‑L327) |
| Permission core | `PermissionService.canRead`: personal branch (`teamFolderId == null`) returns **`user.sub === resource.ownerId` only** — admins and peers denied (permission.service.ts L44‑L53); mirrored by green regression suite `personal-access-regression.spec.ts` (“does not let an organization admin implicitly read a personal resource”) |
| Listing | `FoldersService.listContents/getById` filter every row through `canReadFolder/canReadFile`; TF roots hidden from non-members; personal roots owner-only (folders.service.ts L105‑L151) |
| Search | Tenant + per-row `canRead*` post-filter, personal names invisible to others (search.service.ts L36‑L48) |
| Recent/Favorites | `AccessEvent.findMany({ userId: user.sub })`, favorites keyed by actor — self-scope by construction (recent.service.ts L29) |
| Storage keys | Per-tenant object key prefix + HMAC token; signed URLs issued only after ACL (`requestUpload`/`createDownloadUrl`), cross-tenant paths rejected in adapter path resolution |
| Trash | Unreadable Team-Folder files excluded from trash listing (tasks T014) |

**PRV-01 — Admin telemetry leak (🔴 fix now).**
`EnterpriseService.dashboard` runs:

```sql
SELECT id,name,size,owner_id AS ownerId,updated_at
FROM files WHERE org_id=? AND status='ACTIVE'
ORDER BY size DESC LIMIT 10;
```

This hands every ADMIN and SUPER_ADMIN the *file names of everyone’s My Folder*. Under the boundary verified above this is a policy violation: governance sees **aggregates**, never content metadata of personal workspaces. Fix: exclude rows whose folder chain is personal (join `folders f ON … WHERE f.team_folder_id IS NOT NULL OR f.owner_id = user`) or — simplest and Zoho-accurate — restrict `largeFiles` to Team-Folder files and add org-wide `storage.byTeamFolder` aggregates.

**PRV-02 — Contradictory suites are the leak’s fossil record (🔴 decision required).**
Two test files encode opposite laws for the same predicate:

| File | Asserts | Status |
|---|---|---|
| `permissions/permission.service.spec.ts` L50‑L86 | org ADMIN *can* read/write/share personal; same-org peer *can read* personal | ❌ failing in current baseline |
| `permissions/personal-access-regression.spec.ts` | nobody but owner touches personal; foreign-tenant admin denied | ✅ passing |

Production code implements the regression suite. The red legacy file is therefore not “broken tests” — it is the *previous insecure law kept alive*, and any engineer “fixing the build” by aligning code to it reintroduces the exact privacy breach this task targets. Resolution is documentary: rewrite the legacy assertions to the matrix in §2.2 (see §4 step V6).

**PRV-03 — Query-layer coverage gaps (🟠).**
`apply-org-scope.ts` injects `{AND:[where,{orgId}]}` only for `findUnique*/findFirst*/findMany/updateMany/deleteMany/count/aggregate/groupBy`. Singular `update`/`delete`/`upsert` reach Prisma unscoped; services compensate ad-hoc (`folder.orgId !== user.org_id → 404` in rename/remove), which is correct *only where remembered*. Additionally `findUnique` with an injected `AND` is illegal against unique selectors — today saved because every service pre-checks with `findFirst`. Two hardenings: (1) treat scoped findUnique as findFirst semantics centrally, (2) route remaining singular writes through `updateMany({where:{id,orgId}})` so the middleware’s injected scope applies.

**PRV-04/05 — hygiene.** `TENANT_SCOPED_MODELS` exists twice (`prisma/tenant-scope.ts`, `prisma/apply-org-scope.ts`) with different content, while `PrismaService` bypasses scoping for `User|Organization` at runtime (they have no `orgId`). Consolidate to one source and document the exclusion explicitly. MySQL ≥8.0.16 can enforce `CHECK (folder_type<>'PERSONAL' OR team_folder_id IS NULL)` on `folders`; add as migration + mirror assertion inside `parseCreateFolder`/service.

**Verdict:** isolation logic is sound and matches Zoho; the exposure lives in *telemetry*, *test-law drift*, and *write-path consistency* — all three eliminated by PRV-01…PRV-05.

### 1.2 File & Image Preview Failure — Diagnostic

**Live request chain (as built):**

```
PreviewModal ─ GET /files/:id/download            (Bearer; ACL: canRead → 404)
             ← { download_url, expires_in_seconds }   = /storage/objects?token=HMAC(GET,key,exp,contentType)
Then useBlobPreview(): fetch(download_url) → Blob → URL.createObjectURL → <img> | pdf.js | <video>
Public share path: /share/verify … identical signed URL (canDownload gate).
```

The transport is *already* blob-based with the token in the query string (`local-disk.storage.ts createDownloadUrl`), which correctly sidesteps “`<img>` cannot send Bearer headers” — so classic CORS-on-asset is **not** the primary failure. The concrete defects are:

| # | Root cause (file:line) | User-visible symptom |
|---|---|---|
| PVW-01 | `upload-file.ts` L18: `xhr.setRequestHeader("Content-Type", file.type \|\| "application/pdf")` — every unknown-type upload is stored and token-baked as a PDF; `LocalDiskStorageAdapter.getObjectFromToken` then serves `payload.contentType ?? 'application/octet-stream'` | Images saved without browser mime render as broken `<img>`; videos become forced downloads; PDF viewer gets non-PDF bytes for mislabelled rows |
| PVW-03 | `StorageObjectsController.getObject` sets **only** `Content-Type`; no `Content-Disposition: inline`, no filename encoding → direct navigation / share links / legacy octet-stream rows trigger raw binary download instead of rendering | “Raw binary downloads instead of rendering” |
| PVW-02 | GET does `await readFile(path)` into one Buffer; whole-file RAM per request; no `Accept-Ranges`, no `206 Partial Content`, no `HEAD`, no ETag/`Cache-Control` | Large PDFs/videos stall or time out; re-preview refetches full bytes |
| PVW-04a | CORS `app.enableCors({ origin: true })` reflects any Origin — with token-in-query public endpoints this widens abuse surface; pdf.js worker not pinned/self-hosted (“failed to fetch worker” class errors) | Intermittent console failures on some networks/browsers |
| PVW-04b | Thumbnails absent by explicit scope decision (`specs/002`: “use direct file rendering”) → grid loads originals → slow galleries → user perceives “preview broken” | Broken-image impression at scale |

**Contributing:** short default signed-URL TTL makes an already-open modal fail after idle (`expires_in_seconds` honored client-side only); legacy V1 rows migrated with `application/octet-stream`. 

### 1.3 Multi-Organization Architecture — Evaluation vs. Scaling Needs

Server side is production-grade: JWT embeds `{sub, org_id, role, membershipId}`; every guard verifies the session row + ACTIVE membership and **refreshes the live role from DB** (stale-token privilege drift eliminated); `TenantContextInterceptor` + AsyncLocalStorage feed `PrismaService.$extends` automatic org scoping; suspension revokes all sessions; invitations are unique-per (email, org). Client side is the weak half:

* Single `workdrive_access_token` localStorage key; switching org swaps it silently — other open tabs keep the old tenant until next navigation (TEN-01).
* `switchOrganization` mints a new session but never revokes the previous one → both tenants valid ≤8h.
* TTL literal `8h` duplicated (auth.service L339 window math + `jwt.sign({expiresIn:'8h'})`), no refresh flow, no `x-organization-id` escape hatch header (fine while claims-embedded, but blocked for service-to-service later).

**Zoho-parity scorecard:** Identity ✓ · Membership roles ✓ · Per-request tenant assertion ✓ · Switch UX ◐ · Session hygiene ◐ · Org-scoped aggregates (favorites/recent/quota) ✓.

---

## Section 2 — Architectural Blueprints & DB Schema

> **Reality check:** datasource is **MySQL** (`schema.prisma: provider "mysql"`), not PostgreSQL. Blueprint below is a *target-state diff* against the live Prisma/MySQL models — PostgreSQL syntax equivalents map 1:1 via Prisma when the platform migrates.

### 2.1 Target-state models (deltas highlighted)

```prisma
model User {                      // exists — add locale + optional MFA hook
  id            String   @id @default(uuid()) @db.Char(36)
  email         String   @unique
  name          String?
  passwordHash  String?  @map("password_hash")
  status        UserStatus @default(ACTIVE)
  avatarUrl     String?  @map("avatar_url")
  lastLoginAt   DateTime? @map("last_login_at")
  // + NEW
  locale        String?                       // 'en' | 'ar' — tenant-independent
// (sessions, memberships, favorites … unchanged)

model OrganizationMembership {    // exists — matches target 1:1
  id             String           @id @default(uuid())
  userId         String           @map("user_id")      // → global identity ✓
  organizationId String           @map("organization_id")
  role           OrgRole          @default(MEMBER)     // SUPER_ADMIN|ADMIN|MEMBER ✓
  status         MembershipStatus @default(ACTIVE)
  isPrimary      Boolean          @default(false) @map("is_primary")
  personalFolderId String?        @unique @map("personal_folder_id")
  @@unique([userId, organizationId])                   // one row per (user,tenant) ✓
}

model Folder {
  // existing … plus NEW enforced invariant (migration SQL):
  folderType    FolderType
  teamFolderId  String?     @map("team_folder_id")
}
```

```sql
-- V-next migration fragment (MySQL 8.0.16+)
ALTER TABLE folders
  ADD CONSTRAINT chk_personal_isolation
  CHECK (folder_type <> 'PERSONAL' OR team_folder_id IS NULL);

CREATE INDEX folders_org_owner_personal_idx
  ON folders (org_id, owner_id, folder_type);
```

```prisma
model FileShare {                 // deltas only
  // existing: linkToken@unique, permission, passwordHash, expiresAt, canDownload, status …
  downloadCount Int?      @map("download_count")     // NEW expiry lever
  maxDownloads  Int?      @map("max_download_count") // NEW
  revokedAt     DateTime? @map("revoked_at")         // explicit revoke ≠ expire
}
model FileVersion {               // NEW thumbnail plumbing (P2)
  thumbStorageObjectId String? @map("thumb_storage_object_id")
  ThumbStatus enum { NONE PENDING READY FAILED }   // image/PDF page-1 only
}
```

### 2.2 Isolation rules — `My Folder` vs `Team Folders` (normative matrix)

| Action | My Folder owner | Other member | Org ADMIN / SUPER_ADMIN | Team-Folder admin/organizer | Explicit share link |
|---|---|---|---|---|---|
| List/appear in any listing | ✅ self only | ❌ never | ❌ metadata only via aggregates | ❌ n/a | — |
| Read/open/preview | ✅ | ❌ | ❌ (PRV-01 closes telemetry side-door) | ❌ n/a | ✅ per share scope |
| Write/move/version | ✅ | ❌ | ❌ | ❌ n/a | ❌ (view shares) |
| Share externally | ✅ owner-gated (`canShare`=owner) | ❌ | ❌ | n/a | as granted |
| Audit of personal activity | aggregate counts only | — | ❌ no actor/resource detail (Zoho: privacy) | — | share events logged to share |

Team Folders invert every row: org + TF-admin governance, full audit trails, retention policies, member management. Enforcement points: `PermissionService` predicates (single source), storage ACL-before-URL, and the DB constraint above.

### 2.3 Preview serving blueprint (streaming)

```
GET /files/:id/stream              GET /files/:id/thumbnail       (P2)
  Authorization: Bearer              same guard; 302→ signed object or bytes
  Guard canRead (404-masked)
  Head FileVersion+StorageObject ──► Content-Type from StorageObject.contentType
                                    Content-Disposition: inline; filename*=UTF-8''<enc>
                                    Accept-Ranges: bytes ; ETag: sha256hash ; Cache-Control: private,max-age=3600
  Range? ── fs.createReadStream(path,{start,end}) → 206 + Content-Range
  else   ── stream.pipe(res)                        S3 driver: 302 presign with response-*-type/disposition
Thumbnailer job (image-magick/sharp, PDF page-1): ON_UPLOAD_COMPLETE (async queue) → status transitions.
```

Switch flow blueprint: `POST /auth/organizations/switch` → new token (+**revoke old session**) → client stores `{token, orgId}` pair under versioned key → `BroadcastChannel('wd-org')` notifies tabs → tabs drop caches and hard-reload shared data hooks.

---

## Section 3 — Step-by-Step Fixes & Code Changes

### 3.1 Backend (NestJS) — ordered by severity

**B1 · PRV-01 Close the personal-metadata leak.**
`src/admin/enterprise.service.ts :: dashboard` — constrain the large-files probe to governed space:

```ts
const largeFiles = await this.prisma.$queryRawUnsafe(
 `SELECT f.id,f.name,f.size,tm.name AS teamFolder,f.updated_at AS updatedAt
    FROM files f JOIN folders fd ON fd.id=f.folder_id
         LEFT JOIN team_folders tm ON tm.id=fd.team_folder_id
   WHERE f.org_id=? AND f.status='ACTIVE' AND fd.team_folder_id IS NOT NULL
   ORDER BY f.size DESC LIMIT 10`, orgId);
```
Add `storage.byTeamFolder = SELECT team_folder_id, SUM(size)` for admin charts; personal rows never leave SQL.

**B2 · PRV-03 Scope every write through the tenant middleware.**
Convert residual singular writes: `folder.update({where:{id}, …}) → updateMany({where:{id, orgId:user.org_id}})` + `.count===1` assert (folders.service move/rename/remove; files.service rename/restore). Guard `findUnique` centrally in `apply-org-scope.ts` by mapping to findFirst semantics and document that unique-selector queries must use findFirst.

```ts
if (operation === 'update' || operation === 'delete') {        // hard scope
  next.where = next.where ? { AND:[next.where,{orgId}] } : { orgId };
}
```

**B3 · PRV-04 One scope manifest.** Delete `prisma/tenant-scope.ts`; keep `TENANT_SCOPED_MODELS` exported from `apply-org-scope.ts`, add explicit `NON_SCOPED_MODELS = ['Organization','Session','OrganizationMembership','OrganizationInvitation',…]` with a startup self-test that every scoped model declares `orgId`.

**B4 · PRV-05 Isolation invariant migration.** New Prisma migration running the §2.1 `CHECK` + backfill guard (`UPDATE folders SET folder_type='TEAM_FOLDER_SUB' WHERE team_folder_id IS NOT NULL AND folder_type='PERSONAL'`) preceded by a report query; service-level assertion mirrored.

**B5 · PVW-01 Correct upload mimetype end-to-end.** Frontend fallback becomes real sniffing; backend validates at `/files/upload-complete`:

```ts
// frontend/src/lib/api/upload-file.ts
const SAFE_FALLBACK = 'application/octet-stream';
const type = file.type || guessFromExtension(file.name) || SAFE_FALLBACK;
xhr.setRequestHeader('Content-Type', type);
// backend/upload-complete.schema.ts: mimeType ∈ FileType map, else 422 + drop-in remediation script:
// scripts/backfill-content-types.ts — recompute StorageObject/FileVersion.contentType from magic bytes.
```

**B6 · PVW-02/03 Range-capable inline streaming endpoints.**

* `GET /files/:id/stream`, `GET /files/:id/versions/:v/stream` (`FilesController`)
* Guard chain identical to download (`canRead`), then stream — never buffer:

```ts
@Get(':id/stream')
async stream(@CurrentUser() u, @Param('id', PUUID) id,
             @Res() res: Response, @Headers('range') range?: string) {
  const head = await this.files.headForStreaming(u, id);      // file+version+object (404-masked)
  const path = this.storage.resolveObjectPath(head.objectKey); // local driver
  const size = Number(head.size);
  res.setHeader('Content-Type', head.contentType);
  res.setHeader('Content-Disposition',
     contentDispositionInline(head.fileName));                // RFC 5987 UTF-8*
  res.setHeader('Accept-Ranges','bytes');
  res.setHeader('ETag', `"${head.sha256}"`);
  res.setHeader('Cache-Control','private, max-age=3600');
  const m = /^bytes=(\d*)-(\d*)$/.exec(range ?? '');
  if (m) { const start=Number(m[1]||0), end=m[2]?Math.min(+m[2],size-1):size-1;
    if(start>end||start>=size) {res.status(416).setHeader('Content-Range',`bytes */${size}`);return res.end();}
    res.status(206).setHeader('Content-Range',`bytes ${start}-${end}/${size}`)
       .setHeader('Content-Length',String(end-start+1));
    return createReadStream(path,{start,end}).pipe(res); }
  res.setHeader('Content-Length',String(size));
  createReadStream(path).pipe(res);
}
```
S3 driver branch: 302 to presigned GET with `ResponseContentType`/`ResponseContentDisposition` overrides. Keep legacy `/download` (attachment disposition) for explicit downloads.
Add shared util `common/content-disposition.ts` (quote/UTF-8 encode non-ASCII names).
Hardening rider: replace CORS `origin:true` with env allow-list; self-host pdf.js worker from `/static/pdf/pdf.worker.min.mjs` pinned to dependency version.

**B7 · TEN-01/02 Session hygiene on switch.** In `auth.service.switchOrganization`: revoke the caller’s current session (by `jti`) inside the same transaction that mints the new one; extract TTL to `AUTH_ACCESS_TTL` used by both the session `expiresAt` and `jwt.sign`. Optional Phase-2: refresh-token rotation + optional `x-organization-id` interceptor override *only* for service accounts.

**B8 · UX-02 Admin analytics endpoints.** Add `GET /admin/enterprise/storage-by-user`:

```sql
SELECT u.id, u.name, u.email,
       SUM(CASE WHEN fd.team_folder_id IS NULL THEN f.size END) AS personalBytes,
       SUM(CASE WHEN fd.team_folder_id IS NOT NULL THEN f.size END) AS teamBytes
FROM users u JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=?
LEFT JOIN files f   ON f.owner_id=u.id  AND f.status='ACTIVE' AND f.org_id=m.organization_id
LEFT JOIN folders fd ON fd.id=f.folder_id
GROUP BY u.id ORDER BY 3+4 DESC LIMIT ?;
```
Plus `GET /admin/enterprise/shares-audit?actor=&resource=` wrapping existing `auditLog` with filters and CSV export (`action IN ('SHARE','UNSHARE')`).

**B9 · UX-01 Zip export job.** New endpoint `POST /files/export/archive {fileIds,folderIds,target:'zip'}` → creates `ArchiveJob` row → worker streams entries via `archiver` into a `StorageObject{kind:'ARCHIVE'}` → client polls `GET /files/export/:jobId` (202 while running) → downloads signed URL. Bounded by retention policy; job row org-scoped so only requester can poll.

### 3.2 Frontend (Next.js)

**C1 · PVW-03 Enterprise previewer (`components/file-preview-modal.tsx` — formalize current `preview-modal.tsx`).**
Switch every preview surface from `/files/:id/download` + Blob to the new stream route (falls back to blob for S3-302). One hook drives all viewers:

```ts
const { objectUrl, contentType, rangeHints } = useFileStream(fileId, versionNumber);
// image/* → <img src={objectUrl} decoding="async">
// application/pdf → <PdfViewer url={objectUrl} />      // pdfjs-dist, self-hosted worker
// text|code → fetch objectUrl, Prism highlight via getLanguageFromMime()
// video/audio → <video controls preload="metadata">    // Range makes seek instant
```
Zoom/rotate toolbar, keyboard ←→ navigation across selection, ESC close, RTL-aware chrome, i18n keys under `preview.*`.

**C2 · PVW-01 Upload transport fix.** Replace the PDF default (§B5 snippet); add E2E: upload PNG without mime → preview renders.

**C3 · TEN-01 Multi-tenant switcher.**
* `components/org-switcher.tsx`: avatar list of active memberships (from existing `listMemberships()`), Super Admin badge, search when >8 orgs.
* On select → `switchOrganization(orgId)` → write `{v:2, token, orgId}` to storage → `new BroadcastChannel('wd-org').postMessage(orgId)` → other tabs `location.reload()` after clearing memo caches. Router push `/files`.
* Guard hardening already server-side; client additionally stores `activeOrgId` for pure-UI decisions (nav labels) but never trusts it for data.

**C4 · UX-01 Bulk toolbar.**
Wire the existing multi-select (`selectedIds`) in `file-table.tsx` + team-folders page to an action bar: Move ▸ destination tree dialog (`POST /files/bulk/move`, `/folders/bulk/move` exist), Copy (`bulk/copy`), Trash ✓ exists, **Restore selected** (extend trash API loop → accept `ids[]`), **Download as ZIP** (poll B9 job, then browser download), selection count chip, Esc-to-clear.

**C5 · UX-02 Admin console pages.**
Under `/admin`: “Storage by member” panel consuming B8 (bars, department slice via group mapping later), “Sharing audit” table w/ actor/resource filters + CSV button, per-share expiry editor row action calling new `PATCH /shares/:id` `{expiresAt,maxDownloads}` (backend counterpart of C5/B9 scope, reuses policy validation).

**C6 · Preview reliability polish.** Signed-URL refresh: modal keeps `expiresAt − 30s` timer and silently re-requests `/download` before retrying blob; error slate offers Retry (existing `useBlobPreview.retry`) instead of generic failure.

**C7 · i18n/a11y.** All new strings in `en/ar` pairs; focus-trap in previewer/zip dialogs; dir-aware icons (logical properties already project standard).

---

## Section 4 — Definition of Done & Verification Checklist

### 4.1 Automated gates (CI-blocking)

| # | Gate | Command / File |
|---|---|---|
| V1 | Full backend suite **0 failed** (incl. legacy suite rewritten per §4-V6) | `cd backend && npx jest --silent` |
| V2 | New IDOR/e2e isolation pack | extend `backend/test/idor.live.integration.e2e-spec.ts`: member-B GETs `/files/{A-personal-id}/stream`, `/folders/{A-personal-rootId}`, search hit = 0, trash/list excludes → expect 404 across all |
| V3 | Streaming contract tests | jest on controller: Range `bytes=0-99` → 206 + Content-Range; missing file → 404; filename RFC5987 encoding test (Arabic + spaces) |
| V4 | Admin privacy assertion | new spec: `enterprise.dashboard().largeFiles` contains **zero** rows whose folder is personal (seed personal fixture) |
| V5 | Frontend checks | `npm run typecheck` && `npm test` (add specs: `useFileStream`, org-switcher logic, bulk-toolbar reducer) |
| V6 | **Kill the contradictory law** — rewrite `permission.service.spec.ts` L50‑L86 expectations to §2.2 matrix (admin denied read/write/share on personal; peer denied read; owner allowed; foreign admin denied) and add a regression comment linking PRV-02 |

### 4.2 Manual / QA validation script

1. **Super Admin controls** — as SUPER_ADMIN: create account (`POST /organization/accounts`) ✓ ; MEMBER attempting same endpoint via curl → 403 body includes the Arabic denial string ✓.
2. **Personal privacy** — User A uploads “salary.pdf” to My Folder; Login as ADMIN: not visible in `/files`, absent from global search, absent from Recent-of-others, *Admin console shows only aggregate bytes*; direct URL guess of file id → 404.
3. **Team Folder governance** — ADMIN creates TF, adds B as EDITOR: B sees root, uploads, previews inline in modal (image+PDF+code), version history restores v1→v2; audit trail shows all actions with actor.
4. **Preview matrix** — PNG/JPG (with & without browser-supplied mime), PDF 200 pages (jump to page ⇒ Range seek), `.ts` code highlight, MP4 scrub, legacy octet-stream row after backfill script renders inline; download button still yields proper attachment name.
5. **Multi-tenant switching** — consultant X in OrgA+OrgB: switch from topbar without logout; second tab reflects switch ≤1 s (BroadcastChannel); old token rejected for OrgB data after switch (401 cross-check); suspended membership mid-session → next request 401 everywhere.
6. **Bulk UX** — select 12 mixed items → Move to TF, Zip download produces correct contents, Restore-from-trash selected returns all with ACL re-checked.

### 4.3 Acceptance KPIs

* Zero cross-user personal reads/writes proven by V2 suite (hard gate).
* Preview first-render p75 < 800 ms local-disk @ 5 MB PDF; video first-frame < 500 ms via Range.
* Org switch end-to-end < 600 ms and ≤ 1 reload per non-origin tab.
* CI: backend suite fully green; no skipped security tests.

### Appendix A — Rollout order

P0 (days): B1, V6/PRV-02 doc-fix, B5+C2 mime fix, CORS allow-list.
P1 (sprint): B6 stream endpoints + C1 previewer, B2/B3 scope hardening, B7 session revocation, C3 switcher broadcast.
P2 (sprint): B9 zip + C4 toolbar completions, B8/C5 admin analytics, thumbnails pipeline (FileVersion plumbing), refresh-token rotation.

### Appendix B — New environment keys

`ALLOWED_ORIGINS=https://workdrive.example.com` · `AUTH_ACCESS_TTL=3600` · `STORAGE_SIGNED_URL_TTL=300` · `ARCHIVE_JOB_TTL_HOURS=24`.

### Appendix C — Files touched (index)

Backend: `admin/enterprise.service.ts`, `prisma/apply-org-scope.ts`(†delete twin), `migrations/*_isolation_invariant`, `files/files.controller.ts`, `files/files.service.ts`, `common/content-disposition.ts`(new), `auth.service.ts`, `files/export`(new module), `admin/enterprise.controller.ts`.
Frontend: `lib/api/upload-file.ts`, `components/file-preview-modal.tsx`(renamed), `hooks/use-file-stream.ts`(new), `components/org-switcher.tsx`(new), `app/admin/page.tsx` panels, `components/file-table.tsx`, i18n en/ar.
Scripts: `scripts/backfill-content-types.ts`.

— End of report —
