# Access Control Model

## Role-Based Access Control (RBAC)
- **Organization Roles:** Super Admin, Admin, Member.
- **Team Folder Roles:** Admin, Organizer, Editor, Viewer.
- **File Roles:** Owner, Editor, Viewer, Commenter.

## Enforcement
- Authorization is evaluated at the API level (server-side).
- The system checks if the User ID has a valid role for the requested Resource ID before performing any action.

## Traceability
- Security Requirement -> Access Control Model -> API Enforcement -> Database Foreign Keys.
