# WorkDrive Architecture Report

## Overview
This document describes the comprehensive multi-tenant SaaS architecture implemented for the WorkDrive system, aligned with Zoho WorkDrive's architecture patterns. The system supports organization management, multi-tenant user profiles, granular file permissions, and robust data lifecycle management.

---

## 1. Database Schema Updates

### 1.1 New Enums Added
```prisma
enum MembershipStatus {
  ACTIVE
  SUSPENDED
  PENDING
  REMOVED
}

enum DataTransferStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  PARTIAL
  FAILED
  CANCELLED
}

enum DataTransferType {
  FULL_OWNERSHIP
  SELECTIVE_FILES
  SELECTIVE_FOLDERS
}

enum FolderType {
  PERSONAL
  TEAM_FOLDER_ROOT
  TEAM_FOLDER_SUB
  SHARED_WITH_ME
  ARCHIVED_MEMBER
}
```

### 1.2 Updated Models

#### OrganizationMembership (Enhanced)
```prisma
model OrganizationMembership {
  id               String           @id @default(uuid()) @db.Char(36)
  userId           String           @map("user_id") @db.Char(36)
  organizationId   String           @map("organization_id") @db.Char(36)
  role             OrgRole          @default(MEMBER)
  status           MembershipStatus @default(ACTIVE)
  joinedAt         DateTime         @default(now()) @map("joined_at")
  invitedById      String?          @map("invited_by_id") @db.Char(36)
  isPrimary        Boolean          @default(false) @map("is_primary")
  personalFolderId String?          @map("personal_folder_id") @db.Char(36)
  suspendedAt      DateTime?        @map("suspended_at")
  suspendedById    String?          @map("suspended_by_id") @db.Char(36)
  removedAt        DateTime?        @map("removed_at")
  removedById      String?          @map("removed_by_id") @db.Char(36)

  user             User             @relation("UserMemberships", fields: [userId], references: [id], onDelete: Cascade)
  organization     Organization     @relation("OrganizationMemberships", fields: [organizationId], references: [id], onDelete: Cascade)
  invitedBy        User?            @relation("MembershipInviter", fields: [invitedById], references: [id])
  suspendedBy      User?            @relation("MembershipSuspender", fields: [suspendedById], references: [id])
  removedBy        User?            @relation("MembershipRemover", fields: [removedById], references: [id])
  personalFolder   Folder?          @relation("PersonalFolderOwner", fields: [personalFolderId], references: [id])

  @@unique([userId, organizationId])
  @@index([organizationId, status])
  @@index([userId, status])
  @@index([userId, isPrimary])
  @@map("organization_memberships")
}
```

#### User (Updated)
- Removed direct `orgId` and `role` fields
- Added `currentOrganizationId` for organization switcher context
- Users now belong to multiple organizations via `OrganizationMembership`

#### Folder (Enhanced)
- Added `folderType` field to distinguish:
  - `PERSONAL` - User's private folder ("My Folder")
  - `TEAM_FOLDER_ROOT` - Root folder of a team folder
  - `TEAM_FOLDER_SUB` - Subfolder within team folder
  - `SHARED_WITH_ME` - Virtual folder for shared content
  - `ARCHIVED_MEMBER` - Archived folder from removed members

#### DataTransfer (New)
```prisma
model DataTransfer {
  id              String             @id @default(uuid()) @db.Char(36)
  orgId           String             @map("org_id") @db.Char(36)
  sourceMemberId  String             @map("source_member_id") @db.Char(36)
  targetMemberId  String             @map("target_member_id") @db.Char(36)
  initiatedById   String             @map("initiated_by_id") @db.Char(36)
  status          DataTransferStatus @default(PENDING)
  transferType    DataTransferType   @default(FULL_OWNERSHIP)
  itemsTotal      Int                @default(0) @map("items_total")
  itemsTransferred Int               @default(0) @map("items_transferred")
  itemsFailed     Int                @default(0) @map("items_failed")
  errorLog        Json?
  startedAt       DateTime?          @map("started_at")
  completedAt     DateTime?          @map("completed_at")
  createdAt       DateTime           @default(now()) @map("created_at")

  organization    Organization       @relation(fields: [orgId], references: [id], onDelete: Cascade)
  sourceMember    OrganizationMembership @relation("SourceTransfers", fields: [sourceMemberId], references: [id])
  targetMember    OrganizationMembership @relation("TargetTransfers", fields: [targetMemberId], references: [id])
  initiatedBy     User               @relation(fields: [initiatedById], references: [id])

  @@index([orgId, status])
  @@index([orgId, sourceMemberId])
  @@index([orgId, targetMemberId])
  @@map("data_transfers")
}
```

### 1.3 Migration File
Location: `backend/prisma/migrations/20260826120000_multi_tenant_workdrive_architecture/migration.sql`

---

## 2. Implemented Workflows

### 2.1 Organization Creation & Onboarding
1. **User Signup (New Organization)**
   - Creates Organization record
   - Creates User record (global, no orgId)
   - Creates OrganizationMembership with `SUPER_ADMIN` role
   - Creates Personal Folder ("My Folder") for the user
   - Links personal folder to membership
   - Sets membership as primary
   - Issues JWT with membership info

2. **User Signup (Via Invitation)**
   - Validates invitation token
   - Creates User if new, or uses existing user
   - Creates OrganizationMembership with invited role
   - Creates Personal Folder for the user in that organization
   - Sets as primary if user's first organization

### 2.2 Organization Switcher (Multi-Tenant Context)
- **GET `/auth/memberships`** - List all active memberships
- **POST `/auth/organizations/switch`** - Switch active organization
  - Validates membership exists and is ACTIVE
  - Updates `User.currentOrganizationId`
  - Issues new JWT with new organization context
  - Updates session orgId

### 2.3 Invitation Workflow
1. **Admin invites user** (POST `/organization/invitations`)
   - Creates OrganizationInvitation with role
   - Generates secure token
   - Sends invitation link

2. **New user accepts invitation**
   - Creates User account
   - Creates OrganizationMembership with invited role
   - Creates Personal Folder
   - Marks invitation as ACCEPTED

3. **Existing user accepts invitation**
   - Creates new OrganizationMembership (no new User)
   - Creates Personal Folder in new organization
   - User can now switch between organizations

### 2.4 Member Lifecycle Management
- **Suspend Member** - Sets status to SUSPENDED, revokes sessions
- **Activate Member** - Restores ACTIVE status
- **Remove Member** - Sets status to REMOVED, requires successor for data transfer
- **Transfer Ownership** - SUPER_ADMIN only, transfers organization ownership

### 2.5 Data Transfer on Member Removal
1. Admin initiates removal with successor
2. Creates DataTransfer record
3. Processes asynchronously:
   - Transfers personal files to successor's "Archived Members" folder
   - Creates folder: `[مجلد العضو المغادر - {memberName}]`
   - Transfers personal folders (excluding root "My Folder")
   - Updates ownership of all files/folders
   - Logs all transfers in FileActivity
4. Updates DataTransfer status (COMPLETED/PARTIAL/FAILED)

### 2.6 File & Folder Hierarchy
- **Personal Space**: Each member gets "My Folder" (PERSONAL type)
  - Private by default
  - Explicit sharing required for access
  - Transferred on member removal

- **Team Folders**: Organization-owned shared spaces
  - Public to org or private (invite-only)
  - Granular roles: ADMIN, ORGANIZER, EDITOR, COMMENTER, VIEWER
  - Files remain org-owned regardless of uploader

- **Shares**: File-level sharing with permissions
  - Direct user shares
  - Public links with optional password/expiry
  - Organization policy controls (external sharing, public links)

---

## 3. API Routes

### 3.1 Authentication (`/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/signup` | Register new user (with optional invite token) |
| POST | `/login` | Login with email/password/orgId |
| POST | `/logout` | Revoke current session |
| POST | `/logout-all` | Revoke all sessions |
| GET | `/sessions` | List active sessions |
| DELETE | `/sessions/:id` | Revoke specific session |
| POST | `/forgot-password` | Request password reset |
| POST | `/reset-password` | Reset password with token |
| GET | `/me` | Get current user + membership info |
| POST | `/profile` | Update profile name |
| POST | `/change-password` | Change password |
| GET | `/memberships` | List user's organization memberships |
| POST | `/organizations/switch` | Switch active organization |
| GET | `/google` | Initiate Google OAuth |
| GET | `/google/callback` | Google OAuth callback |

### 3.2 Organization (`/organization`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get organization details |
| PATCH | `/` | Update organization name (Admin+) |
| GET | `/members` | List active members |
| GET | `/members/all` | List members + pending invitations |
| PATCH | `/members/:id` | Update member role |
| POST | `/members/:id/suspend` | Suspend member |
| POST | `/members/:id/activate` | Activate suspended member |
| DELETE | `/members/:id` | Remove member (with optional successor) |
| POST | `/ownership/transfer` | Transfer ownership (Super Admin) |
| GET | `/invitations` | List invitations |
| POST | `/invitations` | Create invitation |
| DELETE | `/invitations/:id` | Revoke invitation |
| POST | `/invitations/accept` | Accept invitation |
| GET | `/invitations/validate` | Validate invitation token (public) |
| GET | `/data-transfers` | List data transfers |

### 3.3 Files (`/files`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload/request` | Request upload URL |
| POST | `/upload/complete/:uploadId` | Complete upload |
| GET | `/download/:fileId` | Create download URL |
| GET | `/version-download/:fileId/:version` | Download specific version |
| POST | `/restore-version` | Restore file version |
| POST | `/move` | Move file |
| POST | `/copy` | Copy file |
| DELETE | `/permanent/:fileId` | Permanent delete |
| POST | `/trash` | Move to trash |
| GET | `/trash` | List trash |
| POST | `/restore/:fileId` | Restore from trash |
| POST | `/empty-trash` | Empty trash |
| POST | `/bulk/move` | Bulk move |
| POST | `/bulk/trash` | Bulk trash |
| POST | `/bulk/delete` | Bulk permanent delete |
| PATCH | `/rename/:fileId` | Rename file |

### 3.4 Folders (`/folders`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create folder |
| GET | `/` | List root contents |
| GET | `/:id` | Get folder with contents |
| GET | `/my-folder` | Get personal folder |
| POST | `/move` | Move folder |
| POST | `/copy` | Copy folder tree |
| DELETE | `/permanent/:id` | Permanent delete |
| PATCH | `/rename/:id` | Rename folder |
| DELETE | `/:id` | Delete (if empty) |
| POST | `/bulk/move` | Bulk move |
| POST | `/bulk/trash` | Bulk delete |

### 3.5 Team Folders (`/team-folders`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create team folder (Admin+) |
| GET | `/` | List accessible team folders |
| GET | `/:id` | Get team folder details |
| PATCH | `/:id` | Rename team folder |
| DELETE | `/:id` | Delete team folder |
| GET | `/:id/members` | List members |
| POST | `/:id/members` | Add member |
| PATCH | `/:id/members/:userId` | Update member role |
| DELETE | `/:id/members/:userId` | Remove member |

### 3.6 Shares (`/shares`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create share |
| GET | `/shared-with-me` | List shares received |
| GET | `/shared-by-me` | List shares created |
| PATCH | `/:shareId/recipients/:userId` | Update recipient permission |
| DELETE | `/:shareId/recipients/:userId` | Remove recipient |
| DELETE | `/:shareId` | Revoke share |
| GET | `/public/:token/verify` | Verify public share |

### 3.7 Folder Permissions (`/folder-permissions`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:folderId` | List permissions |
| POST | `/:folderId` | Upsert permission |
| DELETE | `/:permissionId` | Remove permission |

---

## 4. Data Transfer & Offboarding Guide

### 4.1 Member Suspension
```bash
POST /organization/members/{membershipId}/suspend
```
- Immediately revokes all sessions
- Sets membership status to SUSPENDED
- Member cannot access organization resources
- Data remains intact

### 4.2 Member Removal with Data Transfer
```bash
DELETE /organization/members/{membershipId}?successorId={successorMembershipId}
```
**Preconditions:**
- Requester must be ADMIN or SUPER_ADMIN
- Target cannot be organization owner
- Successor required if member has personal files

**Process:**
1. Validates successor is ACTIVE member
2. Revokes target's sessions
3. Sets membership status to REMOVED
4. Initiates DataTransfer asynchronously
5. Returns immediately with `dataTransferInitiated: true`

### 4.3 Data Transfer Details
**What gets transferred:**
- All files in member's personal folder (`folderType: PERSONAL`)
- All subfolders in personal folder (recursive)
- Member's root "My Folder" renamed to `[مجلد العضو المغادر - {name}]`

**Destination:**
- Successor's "Archived Members" folder (created if needed)
- Subfolder named `[مجلد العضو المغادر - {memberName}]`
- Folder type set to `ARCHIVED_MEMBER`

**Monitoring:**
```bash
GET /organization/data-transfers
```
Returns list with status, progress, error logs.

### 4.4 Ownership Transfer (Organization Level)
```bash
POST /organization/ownership/transfer
{ "targetMembershipId": "..." }
```
- Only SUPER_ADMIN can initiate
- Transfers organization `ownerId`
- Demotes current owner to ADMIN
- Promotes target to SUPER_ADMIN
- Creates audit log

---

## 5. Permission Model

### 5.1 Organization Roles
| Role | Description |
|------|-------------|
| SUPER_ADMIN | Full organization control, ownership transfer |
| ADMIN | Member management, settings, team folders |
| MEMBER | Default role, personal folder access |

### 5.2 Team Folder Roles
| Role | Permissions |
|------|-------------|
| ADMIN | Full control, manage members, delete folder |
| ORGANIZER | Manage content, add members (Editor/Viewer) |
| EDITOR | Read, write, delete files/folders |
| COMMENTER | Read, comment |
| VIEWER | Read only |

### 5.3 File/Folder Permissions
- **Owner**: Full control on personal files
- **Team Folder Members**: Based on team folder role
- **Explicit Shares**: VIEW, COMMENT, EDIT, ORGANIZE, FULL_ACCESS
- **Folder Permissions**: NONE, VIEW, COMMENT, EDIT, ORGANIZE (user/group)

### 5.4 Permission Checks
- `canRead` - View file/folder
- `canWrite` - Modify content
- `canShare` - Create shares
- `canComment` - Add comments
- `canManageTeamFolder` - Manage team folder settings
- `canManageMembers` - Add/remove team folder members

---

## 6. Key Implementation Files

### 6.1 Core Services
- `backend/src/auth.service.ts` - Authentication, membership management, org switching
- `backend/src/organization/organization.service.ts` - Organization & member lifecycle
- `backend/src/files/files.service.ts` - File operations
- `backend/src/folders/folders.service.ts` - Folder operations, personal folder access
- `backend/src/team-folders/team-folders.service.ts` - Team folder management
- `backend/src/shares/shares.service.ts` - Sharing logic
- `backend/src/permissions/permission.service.ts` - Permission evaluation

### 6.2 Controllers
- `backend/src/auth/auth.controller.ts` - Auth endpoints including org switcher
- `backend/src/organization/organization.controller.ts` - Organization management

### 6.3 Database
- `backend/prisma/schema.prisma` - Complete schema
- `backend/prisma/migrations/20260826120000_multi_tenant_workdrive_architecture/` - Migration

### 6.4 Seed Data
- `backend/src/auth/seed-data.ts` - Seed constants
- `backend/prisma/seed.ts` - Seed script

---

## 7. Security Considerations

### 7.1 Token Validation
- JWT includes `org_id`, `membershipId`, `membershipStatus`
- Session stored in database with hash
- Membership status validated on every request

### 7.2 Organization Isolation
- All queries scoped to `user.org_id` from JWT
- Prisma middleware enforces tenant scope
- Cross-organization access prevented

### 7.3 Invitation Security
- Tokens hashed with SHA-256
- 7-day expiry
- Email validation on acceptance
- One-time use

### 7.4 Data Transfer Audit
- Every transfer creates audit logs
- FileActivity tracks ownership changes
- DataTransfer record maintains full history

---

## 8. Future Enhancements

1. **Groups & Group-based Permissions** - Already in schema, needs API
2. **Retention Policies** - Already in schema, needs enforcement
3. **Malware Scanning** - Already in schema, needs integration
4. **Advanced Audit Reports** - Export data transfers, member activity
5. **Bulk Member Operations** - CSV import/export for members
6. **SAML/SSO Integration** - Enterprise authentication

---

## 9. Testing Checklist

- [ ] User signup creates organization + SUPER_ADMIN membership + personal folder
- [ ] Invited user joins existing organization with correct role
- [ ] Existing user can join new organization via invitation
- [ ] Organization switcher updates JWT and session
- [ ] Member suspension revokes access immediately
- [ ] Member removal transfers personal files to successor
- [ ] Data transfer creates archived folder structure
- [ ] Ownership transfer works for SUPER_ADMIN
- [ ] Team folder permissions work with new roles
- [ ] File sharing respects organization policies
- [ ] Personal folders are private by default
- [ ] Folder permissions (user/group) work correctly

---

*Generated: 2026-08-26*
*Version: 1.0*