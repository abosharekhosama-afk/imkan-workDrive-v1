# IMKAN WorkDrive Constitution

## Core Principles

### I. Repository Is the Single Source of Truth

The repository is the authoritative source of truth for the IMKAN WorkDrive project.

All requirements, specifications, architecture decisions, implementation status, security decisions, database rules, API contracts, permissions, tests, phase completion records, blockers, and evidence must be represented in repository documentation.

Agent memory, chat history, generated assumptions, external conversations, or undocumented decisions must never override repository state.

When repository documentation conflicts with an agent assumption, the repository documentation wins until an explicit Change Control decision is recorded.

---

### II. Spec-Driven Development Is Mandatory

Every meaningful feature or architectural change MUST follow:

Research → Specification → Clarification → Plan → Tasks → Implementation → Testing → Security Validation → Documentation → Evidence → Review → Completion.

Spec Kit is the project's specification workflow and automation layer.

Spec Kit does not replace IMKAN Agent OS, project governance, security governance, design governance, database governance, API governance, permission governance, testing governance, or change control.

No substantial feature may be implemented solely from an informal prompt or agent assumption.

---

### III. Security by Design Is Non-Negotiable

Security must be considered before implementation, not added after implementation.

Every feature that handles authentication, authorization, files, folders, sharing, links, organization data, personal data, uploads, downloads, integrations, tokens, sessions, or administrative operations MUST define applicable security controls.

Server-side authorization is mandatory.

Client-side visibility is never considered authorization.

Security-sensitive operations MUST be protected against, where applicable:

- Broken access control
- IDOR
- Tenant isolation failures
- Privilege escalation
- Authentication bypass
- CSRF
- XSS
- SQL injection
- Path traversal
- Unsafe file handling
- Malicious uploads
- SSRF
- Credential leakage
- Token leakage
- Insecure direct downloads
- Enumeration
- Rate abuse
- Replay and duplicate operations
- Unsafe sharing links
- Unauthorized organization access

Security tests must be documented and executed for applicable features.

---

### IV. Multi-Tenancy and Data Isolation Are Mandatory

IMKAN WorkDrive is a multi-tenant application.

Organization/tenant boundaries must be enforced server-side and at the database access layer.

A user must never be able to access another organization's files, folders, metadata, shares, memberships, audit records, or administrative resources through manipulation of identifiers, URLs, requests, or client state.

Tenant ownership and authorization rules must be explicit in specifications, database design, API contracts, and tests.

---

### V. Database Integrity and MySQL 8.x

The project uses MySQL 8.x as its primary relational database.

Database design must prioritize:

- Referential integrity
- Explicit foreign keys
- Appropriate unique constraints
- Appropriate indexes
- Transactional consistency
- Safe migrations
- Tenant isolation
- Auditability
- Predictable deletion behavior
- Concurrency correctness

No database schema change may be performed without an appropriate migration.

Database changes must be documented under `docs/database/` and represented in the relevant phase/change documentation.

File binary content must not be stored directly in MySQL unless explicitly justified and approved.

Object storage is the default architecture for file content, while MySQL stores file metadata, ownership, relationships, permissions, versions, shares, and related state.

---

### VI. API Contracts Must Be Explicit

APIs must have explicit contracts.

Every API feature must define, where applicable:

- Endpoint
- HTTP method
- Authentication requirements
- Authorization requirements
- Request schema
- Response schema
- Validation
- Error behavior
- Pagination
- Filtering
- Sorting
- Idempotency requirements
- Rate limiting requirements
- Audit requirements
- Tenant scope

Breaking API changes require explicit Change Control.

---

### VII. Permissions Are Server-Side and Explicit

Authorization must be based on explicit roles, permissions, memberships, ownership, sharing rules, and resource relationships.

The UI may reflect permissions but must never be the authority for them.

File and folder permissions must support the application's required ownership, organization, team, sharing, and access semantics.

Every permission-sensitive feature must include positive and negative authorization tests.

---

### VIII. IMKAN One Design System Is Mandatory

The application is an IMKAN One application, not an independent visual product.

The application must follow `docs/design/DESIGN-GOVERNANCE.md` and the IMKAN One Design System.

The application must use the shared design tokens and shared component conventions.

No independent application theme is permitted.

No second primary color is permitted.

No custom application font is permitted.

No duplicated platform header, sidebar, account menu, or application shell is permitted.

The application must support:

- English
- Arabic
- LTR
- RTL
- Light mode
- Dark mode through centralized design tokens

All visible UI strings must be localized.

No hard-coded Arabic or English UI text may be placed directly in JSX/TSX.

No raw hexadecimal colors may be introduced into components where an existing design token applies.

---

### IX. Zoho WorkDrive Is a Functional and UX Reference

Zoho WorkDrive is used as a reference for product research, information architecture, workflow behavior, feature coverage, interaction patterns, density, and professional cloud-drive UX.

The project must independently implement its own code, database, APIs, visual assets, branding, and architecture.

Do not copy proprietary source code, private implementation details, trademarks, copyrighted assets, or protected material.

Research must identify observable product behavior and publicly documented functionality and translate it into independent IMKAN requirements.

Feature claims must be supported by research evidence or explicit project requirements.

---

### X. Testing Is Required Before Completion

A feature is not complete merely because its code exists.

Applicable testing must include:

- Unit tests
- Integration tests
- API tests
- Database tests
- Permission tests
- Security tests
- UI tests where applicable
- End-to-end tests where applicable
- Regression tests

The appropriate tests must pass before a feature or phase can be marked PASS.

Failed tests must be documented.

Skipped tests must have an explicit reason.

---

### XI. Documentation and Evidence Are Part of Implementation

Every phase and meaningful feature must produce documentation.

Documentation must record:

- Objective
- Scope
- Files changed
- Database changes
- API changes
- UI changes
- Permission changes
- Security changes
- Tests executed
- Security tests executed
- Failed tests
- Blockers
- Known limitations
- Decisions
- Evidence
- Final status

Phase completion records belong under `docs/releases/`.

Changes must follow `docs/changes/CHANGE-TEMPLATE.md`.

A feature without appropriate evidence must not be represented as verified or complete.

---

### XII. Phase Gates Are Mandatory

Development proceeds through explicit phases.

A phase may be marked PASS only when:

1. Its objectives are completed.
2. Required documentation exists.
3. Required tests pass.
4. Required security validation passes.
5. Required design validation passes.
6. Required database/API/permission validation passes.
7. Blockers are resolved or explicitly accepted.
8. Evidence is recorded.
9. Git state is clean or the phase's changes are committed.

The next phase must not begin as if the previous phase were complete when its gate has failed.

---

### XIII. No Fabricated Completion

Agents MUST NOT claim:

- PASS without evidence.
- Tests passed when they were not executed.
- A provider or external service is integrated when it was not verified.
- A feature exists when it is only mocked.
- Security is complete without security validation.
- An API is production-ready without appropriate verification.
- A requirement is satisfied merely because a UI element exists.

Unverified items must be explicitly labeled:

- NOT VERIFIED
- BLOCKED
- PARTIAL
- MOCKED
- NOT IMPLEMENTED
- NEEDS VALIDATION

---

### XIV. Change Control Is Mandatory

Changes to requirements, architecture, database structure, API contracts, permissions, security behavior, or design-system behavior must be documented.

Unplanned scope expansion must not silently enter implementation.

If a new requirement conflicts with an existing decision, the conflict must be recorded and resolved explicitly.

---

### XV. Agent Operating Rules

Agents must:

1. Read repository state before implementation.
2. Read relevant governance documents before changing governed areas.
3. Reuse existing architecture before introducing new architecture.
4. Prefer small, verifiable changes.
5. Keep documentation synchronized with implementation.
6. Record blockers instead of hiding them.
7. Never silently modify unrelated modules.
8. Never expose secrets in source code, logs, documentation, tests, or commits.
9. Validate changes before declaring completion.
10. Update phase state after completing a phase.
11. Maintain Git history that clearly reflects meaningful milestones.
12. Treat the repository as the authoritative project state.

---

## Required Governance Documents

The following governance documents are mandatory:

- `docs/agent/AGENT-PROTOCOL.md`
- `docs/agent/PROJECT-STATE.md`
- `docs/agent/CURRENT-PHASE.md`
- `docs/agent/CURRENT-TASK.md`
- `docs/agent/ENVIRONMENT.md`
- `docs/agent/EXTENSIONS.md`
- `docs/agent/TOKEN-POLICY.md`
- `docs/design/DESIGN-GOVERNANCE.md`
- `docs/database/DATABASE-GOVERNANCE.md`
- `docs/api/API-GOVERNANCE.md`
- `docs/permissions/PERMISSION-GOVERNANCE.md`
- `docs/testing/TESTING-GOVERNANCE.md`
- `docs/changes/CHANGE-TEMPLATE.md`

These documents form the IMKAN Agent OS governance layer.

---

## Development Workflow

The standard workflow is:

Research
→ Specification
→ Clarification when required
→ Architecture and Technical Plan
→ Task Breakdown
→ Cross-Artifact Analysis
→ Implementation
→ Tests
→ Security Validation
→ Documentation
→ Evidence
→ Review
→ Phase Validation
→ Git Commit
→ Next Phase

Spec Kit commands are used as follows:

- `/speckit-constitution` — only when the constitution itself is intentionally revised.
- `/speckit-specify` — create or update feature specifications.
- `/speckit-clarify` — resolve meaningful ambiguity.
- `/speckit-plan` — create implementation plans.
- `/speckit-tasks` — generate actionable implementation tasks.
- `/speckit-analyze` — verify consistency between specification, plan, and tasks.
- `/speckit-checklist` — create quality validation checklists.
- `/speckit-implement` — execute approved implementation tasks.
- `/speckit-converge` — assess remaining gaps after implementation.

These commands do not bypass IMKAN governance.

---

## Governance

This Constitution is the project-level development constitution for IMKAN WorkDrive.

IMKAN Agent OS governance documents remain the operational source of truth for their respective domains.

Where a conflict exists:

1. Explicit approved project decisions and Change Control records take precedence.
2. Domain-specific IMKAN governance applies to its domain.
3. This Constitution governs the Spec-Driven Development workflow.
4. Agent assumptions never override repository documentation.

Any amendment to this Constitution must:

1. Be intentional.
2. Be documented.
3. Explain the reason for the change.
4. Identify affected workflows or features.
5. Update the version and amendment date.
6. Be committed to Git.

No credentials, API keys, authentication tokens, or secrets may be stored in this repository.

**Version**: 1.0.0  
**Ratified**: 2026-08-16  
**Last Amended**: 2026-08-16
