# IMKAN WorkDrive — Provider Configuration & User OAuth

This release adds organization-level **Provider Configuration** for OAuth services. OAuth client credentials are configured once by an organization `ADMIN` or `SUPER_ADMIN`; normal users only create their own connections and complete the provider consent screen.

## 1. Database

Run from `backend/`:

```bash
npx prisma migrate deploy
npx prisma generate
```

Migration:

`20260919123000_connection_provider_configs`

## 2. Admin flow

Go to **Connections → Provider Configuration**.

For each OAuth provider you can configure:

- Client ID
- Client Secret (encrypted at rest with `CONNECTION_ENCRYPTION_KEY`)
- Microsoft Tenant ID (optional; defaults to `common`)
- Callback URL
- Authorization URL
- Token URL
- Revoke URL (optional)
- Enabled/disabled state
- OAuth Test

The client secret is never returned to the browser. The UI only receives `hasClientSecret`.

## 3. User flow

Users go to **Connections → Default Services**, choose Google/GitHub/Microsoft 365/etc., select scopes, enter a connection name, and click **Create And Connect**.

The backend uses the organization provider configuration to create the OAuth authorization URL. The OAuth state is bound to:

- organization
- user
- provider
- connection ID

After consent, the resulting access/refresh tokens are encrypted and stored on that user's connection.

## 4. Environment variables

Environment variables remain supported as a backward-compatible fallback. A database provider configuration takes precedence for an organization when it is enabled.

This means a SaaS deployment can configure OAuth once per organization instead of asking each user to supply provider application credentials.

## 5. Callback URL examples

Google:

`https://YOUR-BACKEND.onrender.com/connections/oauth/google/callback`

GitHub:

`https://YOUR-BACKEND.onrender.com/connections/oauth/github/callback`

Microsoft 365:

`https://YOUR-BACKEND.onrender.com/connections/oauth/microsoft/callback`

The exact callback URL configured in IMKAN must also be registered in the provider's developer console.

## 6. Security model

- Only organization `ADMIN` and `SUPER_ADMIN` users can modify Provider Configuration.
- Provider client secrets are encrypted before persistence.
- User OAuth tokens remain isolated per connection/user.
- Disabling a provider prevents new OAuth authorization while existing encrypted connection records remain intact.
- The existing environment-variable configuration continues to work when no database configuration exists.
