# User Flows

## 1. Upload File
- **Actor:** User with write access (Organizer/Editor)
- **Preconditions:** Sufficient storage quota.
- **Action:** Drag and drop file or click "New -> File Upload".
- **Backend operation:** File chunking, storage allocation, virus scan (PROPOSED).
- **Database state change:** Record created in `files` table, version `1` created.
- **UI result:** Progress bar -> success toast -> file appears in list.

## 2. Create Public Link
- **Actor:** Owner, Admin, or Organizer.
- **Preconditions:** External sharing enabled for organization/folder.
- **Action:** Select file -> Share -> New External Link. Set optional password/expiry.
- **Backend operation:** Generate unique token. Store link settings.
- **UI result:** Link generated and copied to clipboard.

## 3. Add Member to Team Folder
- **Actor:** Team Folder Admin.
- **Action:** Open Team Folder settings -> Members -> Add. Select user, assign role (e.g., Editor).
- **Backend operation:** Update `folder_members` table.
- **Notification:** Email/in-app notification sent to the added user.
