# Storage Research

## Conceptual Model
- Files are stored as immutable blobs in S3-compatible Object Storage.
- File modifications create a new blob and a new `file_versions` record in MySQL.
- MySQL holds metadata: Original filename, MIME type, size, uploader ID, creation timestamp.

## Deduplication
- (PROPOSED) File hashes (SHA-256) can be calculated to prevent storing duplicate blobs.

## TrueSync / Desktop Client
- Requires API support for delta syncs, file locking, and conflict resolution.
