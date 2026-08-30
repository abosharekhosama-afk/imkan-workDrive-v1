# SSO Architecture

## Strategy
- SSO is an architectural extension point.
- Standard JWT-based local authentication will be the default fallback.
- PENDING DECISION: Specific SSO Provider (e.g., Azure AD, Okta, Keycloak). 
- *Rationale: Requires business requirements for IMKAN identity stack.*

## Implementation Boundary
- Auth module must support a pluggable `Strategy` interface.
- Must handle OIDC (OpenID Connect) flows.
