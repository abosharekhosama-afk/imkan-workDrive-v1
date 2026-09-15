# Database Governance

Database: MySQL 8.x

## Requirements
- versioned migrations
- transactional integrity
- appropriate indexes
- foreign keys where appropriate
- tenant isolation
- auditability
- safe migrations
- no silent schema changes
- no destructive migration without explicit approval
- exact numeric types where required
- UTC/timezone strategy must be documented before implementation

## File Binaries
Do NOT store normal file binaries directly in MySQL.
Use an object-storage abstraction / S3-compatible storage.
MySQL stores metadata, references, state, permissions, and related relational data.
