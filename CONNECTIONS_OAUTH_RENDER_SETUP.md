# Connections OAuth — Render setup

The Connections module now follows the same connection lifecycle pattern as Zoho: pick a predefined service, enter a connection name/link name, choose only the scopes you need, create the connection, then authorize it at the provider.

## Google

The backend accepts either the existing Google login credentials or the dedicated connection variables:

- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
- fallback: `GOOGLE_ID` + `GOOGLE_SECRET`
- `GOOGLE_CONNECTION_CALLBACK_URL`

Set `GOOGLE_CONNECTION_CALLBACK_URL` to:

`https://<YOUR-RENDER-BACKEND-DOMAIN>/connections/oauth/google/callback`

The exact URL must also be registered as an Authorized redirect URI in the Google OAuth client.

## Microsoft / Dropbox

Register these callback URLs in the corresponding provider app:

- `https://<YOUR-RENDER-BACKEND-DOMAIN>/connections/oauth/microsoft/callback`
- `https://<YOUR-RENDER-BACKEND-DOMAIN>/connections/oauth/dropbox/callback`

and set `MICROSOFT_CONNECTION_CALLBACK_URL` / `DROPBOX_CONNECTION_CALLBACK_URL`.

## Other default OAuth services

GitHub, Slack, Asana, Notion, HubSpot, Salesforce, Zoom, Discord and Mailchimp are provider-registry services. They become connectable when their `*_CLIENT_ID`, `*_CLIENT_SECRET`, and `*_CONNECTION_CALLBACK_URL` variables are configured.

The UI exposes the provider-specific scope catalog and marks an OAuth service as `OAuth setup required` instead of allowing a broken authorization attempt when credentials are missing.

## Production requirements

- Keep `CONNECTION_ENCRYPTION_KEY` stable across deploys.
- Keep `PUBLIC_API_URL` pointed at the public backend URL.
- Run `prisma migrate deploy` so the OAuth state `connection_id` migration is applied.
