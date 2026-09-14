# Deduplication Architecture

## Strategy
- PENDING DECISION: Global cross-tenant deduplication.
- *Rationale: Cross-tenant deduplication introduces security risks (side-channel attacks) and complicates tenant data deletion. Not recommended without strict compliance approval.*
- Within-tenant deduplication: Supported by calculating SHA-256 on the client before upload request. If the hash exists in the tenant's `file_versions`, link the metadata to the existing blob instead of uploading.
