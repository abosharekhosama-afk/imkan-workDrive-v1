# Search Architecture

## Strategy
- Initial Implementation: MySQL Full-Text Search on file/folder names and metadata.
- PENDING DECISION: Elasticsearch/OpenSearch. *Rationale: Not required for initial MVP since MySQL 8.x handles text indexing adequately for metadata. Only necessary if deep text extraction (OCR/PDF content) is required at massive scale.*

## Tenant Isolation
- Every search query MUST strictly filter by `tenant_id` and the user's accessible `folder_ids` or `team_ids`.

## Indexing
- Files and Folders tables will have indexes on `name` and `tags`.
