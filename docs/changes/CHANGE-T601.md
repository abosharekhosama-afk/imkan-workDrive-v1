# Implementation Record: T-601 GET /search

## Objective
Tenant-scoped MySQL full-text search on file and folder names.

## Endpoint
`GET /search?q=` (JWT required). Tenant from JWT `org_id`. Trashed files excluded.

## Status
PASS (unit). Search backend tests were already executed and are not re-run this turn.

## Follow-on
Frontend search box on the file browser calls this contract.
