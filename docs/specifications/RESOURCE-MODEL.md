# Resource Model

## Entities
- **Organization (Tenant):** Top-level boundary.
- **User:** Member of an organization.
- **Team Folder:** Shared boundary within an organization.
- **Folder:** Hierarchical container.
- **File:** Represents a document or media item.
- **FileVersion:** Immutable binary state of a File.
- **ShareLink:** External access token.
- **Comment:** Annotation on a File/Folder.
- **AuditLog:** Immutable record of actions.

## Relationships
- An Organization has many Users and Team Folders.
- A Team Folder has many Folders and Files.
- A File has many FileVersions, Comments, and ShareLinks.
