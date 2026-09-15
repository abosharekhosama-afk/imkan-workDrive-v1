# Testing Architecture

## Testing Pyramid
1. **Unit Tests:** Business logic, Permission resolution logic (Jest/Vitest).
2. **Integration Tests:** Database repositories and API endpoints against a test MySQL instance (Testcontainers).
3. **Authorization/Security Tests:** Explicit negative test suites targeting IDOR and RBAC boundaries.
4. **E2E Tests:** Playwright/Cypress for critical paths (Upload, Share, Download).

## CI/CD Enforcement
- Build fails if coverage drops below thresholds.
- Security tests run on every PR.
