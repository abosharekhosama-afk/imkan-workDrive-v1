import { BadRequestException, Injectable } from '@nestjs/common';
import type { ConnectionProviderDefinition } from './provider-registry.service';
import { probeTargets } from './oauth-flow';

export type OAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  authBase: string;
  tokenUrl: string;
  revokeUrl?: string;
};

export type OAuthTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  [key: string]: unknown;
};

export type AuthorizedAccount = {
  id?: string;
  email?: string;
  name?: string;
  username?: string;
  provider?: string;
  rawType?: string;
};

@Injectable()
export class ConnectionProviderAdapterService {
  async exchangeCode(config: OAuthClientConfig, code: string, codeVerifier?: string | null): Promise<OAuthTokenPayload> {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl,
      grant_type: 'authorization_code',
    });
    if (codeVerifier) body.set('code_verifier', codeVerifier);
    const response = await this.request(config.tokenUrl, body);
    if (!response.ok || typeof response.payload?.access_token !== 'string') {
      throw new BadRequestException(this.providerError(response.payload, 'OAuth authorization failed'));
    }
    return response.payload as OAuthTokenPayload;
  }

  async refresh(config: OAuthClientConfig, refreshToken: string): Promise<OAuthTokenPayload> {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const response = await this.request(config.tokenUrl, body);
    if (!response.ok || typeof response.payload?.access_token !== 'string') {
      throw new BadRequestException(this.providerError(response.payload, 'OAuth token refresh failed'));
    }
    return response.payload as OAuthTokenPayload;
  }

  async probe(definition: ConnectionProviderDefinition, provider: string, token: string, baseUrl?: string | null): Promise<AuthorizedAccount | null> {
    const targets = probeTargets(provider, definition.probeUrl ?? baseUrl);
    if (!targets.length) return null;
    let lastError = 'Provider verification failed';
    for (const target of targets) {
      const response = await fetch(target.url, {
        method: target.method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'user-agent': 'IMKAN-WorkDrive',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      const payload = await this.readPayload(response);
      if (response.ok && payload?.ok !== false) return this.extractAccount(provider, payload);
      lastError = this.providerError(payload, `Provider returned HTTP ${response.status}`);
      // 401/403 means this endpoint rejected the token or the granted scopes.
      // Try the next identity endpoint before failing activation.
      if (response.status !== 401 && response.status !== 403) break;
    }
    throw new Error(lastError);
  }

  private extractAccount(provider: string, payload: any): AuthorizedAccount | null {
    if (!payload || typeof payload !== 'object') return null;
    switch (provider) {
      case 'google': {
        const user = payload.user ?? payload;
        return this.account(user?.sub, user?.emailAddress ?? user?.email, user?.displayName ?? user?.name, user?.email);
      }
      case 'microsoft': {
        return this.account(payload.id, payload.mail ?? payload.userPrincipalName, payload.displayName ?? payload.userPrincipalName, payload.userPrincipalName);
      }
      case 'dropbox': {
        return this.account(payload.account_id, payload.email, payload.name?.display_name ?? payload.name?.abbreviated_name, payload.email);
      }
      case 'github': {
        return this.account(payload.id != null ? String(payload.id) : undefined, payload.email, payload.name ?? payload.login, payload.login);
      }
      case 'slack': {
        const user = payload.authed_user ?? payload.user ?? payload;
        const team = payload.team?.name ?? payload.team?.id;
        return this.account(user?.id, user?.email, user?.name ?? user?.real_name ?? team, user?.name);
      }
      case 'asana': {
        const user = payload.data ?? payload.user ?? payload;
        return this.account(user?.gid, user?.email, user?.name, user?.email);
      }
      case 'notion': {
        const user = payload.bot?.owner?.user ?? payload.owner?.user ?? payload;
        return this.account(user?.id, user?.person?.email, user?.name ?? user?.person?.email, user?.name);
      }
      case 'salesforce': {
        return this.account(payload.user_id ?? payload.userId, payload.email, payload.name ?? payload.username, payload.username);
      }
      case 'zoom': {
        return this.account(payload.id != null ? String(payload.id) : undefined, payload.email, payload.display_name ?? payload.first_name ?? payload.email, payload.email);
      }
      case 'discord': {
        return this.account(payload.id != null ? String(payload.id) : undefined, payload.email, payload.global_name ?? payload.username, payload.username);
      }
      default: {
        const id = payload.id ?? payload.user_id ?? payload.account_id ?? payload.gid ?? payload.uid;
        const email = payload.email ?? payload.emailAddress ?? payload.email_address ?? payload.username;
        const name = payload.name ?? payload.displayName ?? payload.display_name ?? payload.login ?? payload.username;
        if (id == null && email == null && name == null) return null;
        return this.account(id != null ? String(id) : undefined, email, name, payload.username);
      }
    }
  }

  private account(id?: unknown, email?: unknown, name?: unknown, username?: unknown): AuthorizedAccount {
    return {
      id: id != null ? String(id) : undefined,
      email: typeof email === 'string' ? email : undefined,
      name: typeof name === 'string' ? name : undefined,
      username: typeof username === 'string' ? username : undefined,
    };
  }

  private async request(url: string, body: URLSearchParams) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    return { ok: response.ok, payload: await this.readPayload(response) };
  }

  private async readPayload(response: Response): Promise<any> {
    const text = await response.text();
    const trimmed = text.trim();
    if (!trimmed) return {};
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { return { error: 'invalid_provider_response' }; }
    }
    if (trimmed.includes('=')) {
      const params = new URLSearchParams(trimmed);
      const parsed: Record<string, string> = {};
      for (const [key, value] of params.entries()) parsed[key] = value;
      if (parsed.access_token || parsed.error || parsed.error_description) return parsed;
    }
    return { error: 'invalid_provider_response' };
  }

  private providerError(payload: any, fallback: string) {
    const detail = payload?.error_description ?? payload?.message ?? payload?.error;
    if (typeof detail !== 'string' || detail.length > 300) return fallback;
    if (/access_token|refresh_token|client_secret|code_verifier/i.test(detail)) return fallback;
    return `${fallback}: ${detail}`;
  }
}
