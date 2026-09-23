import { ConnectionStatus } from "@prisma/client";
import { ConnectionCryptoService } from "./connection-crypto.service";
import { ConnectionProviderAdapterService } from "./connection-provider-adapter.service";
import { ConnectionProviderRegistry } from "./provider-registry.service";
import { ConnectionsService } from "./connections.service";
import { PRODUCTION_FRONTEND_ORIGIN, probeTargets, resolveOAuthFrontendOrigin } from "./oauth-flow";

const FRONTEND = "https://imkan-work-drive-v1.vercel.app";
const API = "https://imkan-workdrive-v1.onrender.com";

function configMap(extra: Record<string, string> = {}) {
  const values: Record<string, string> = {
    FRONTEND_URL: FRONTEND,
    PUBLIC_API_URL: API,
    CONNECTION_ENCRYPTION_KEY: "a".repeat(64),
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GITHUB_CLIENT_ID: "github-client",
    GITHUB_CLIENT_SECRET: "github-secret",
    ...extra,
  };
  return { get: (key: string) => values[key] };
}

function harness(provider: "google" | "github") {
  const updates: Array<Record<string, unknown>> = [];
  const state = {
    id: "state-1",
    orgId: "org-1",
    userId: "user-1",
    provider,
    connectionId: "conn-1",
    folderId: null,
    returnPath: "/files/connections",
    codeVerifier: null as string | null,
    usedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60_000),
  };
  const connection = {
    id: "conn-1",
    orgId: "org-1",
    ownerId: "user-1",
    name: provider + " connection",
    provider,
    authType: "OAUTH2",
    status: ConnectionStatus.PENDING_AUTH,
    scope: provider === "google" ? "openid email profile" : "read:user user:email",
    baseUrl: null,
    metadata: {},
  };
  const prisma = {
    connectionProviderConfig: { findUnique: jest.fn(async () => null) },
    connectionOAuthState: {
      findFirst: jest.fn(async (args: { where?: { usedAt?: null; provider?: string } }) => {
        if (args?.where?.provider && args.where.provider !== provider) return null;
        if (args?.where && Object.prototype.hasOwnProperty.call(args.where, "usedAt") && args.where.usedAt === null && state.usedAt) return null;
        return state;
      }),
      update: jest.fn(async () => {
        state.usedAt = new Date();
        return state;
      }),
    },
    connection: {
      findFirst: jest.fn(async (args: { where?: { id?: string; linkName?: string } }) => {
        if (args?.where?.linkName) return null;
        if (!args?.where?.id || args.where.id === connection.id) return connection;
        return null;
      }),
      findUnique: jest.fn(async () => ({ status: connection.status })),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        if (typeof args.data.status === "string") connection.status = args.data.status as typeof connection.status;
        return { ...connection, id: connection.id };
      }),
      create: jest.fn(),
    },
    connectionSecret: {
      findUnique: jest.fn(async () => ({ connectionId: "conn-1", accessToken: "enc", refreshToken: null, apiKey: null, bearerToken: null, username: null, password: null, customHeaders: null })),
      update: jest.fn(async () => ({})),
    },
    connectionSecretVersion: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({})),
    },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const config = configMap();
  const service = new ConnectionsService(
    prisma as never,
    new ConnectionCryptoService(config as never),
    config as never,
    new ConnectionProviderRegistry(),
    new ConnectionProviderAdapterService(),
  );
  return { service, updates, connection, state };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Connections OAuth activation", () => {
  const originalFetch = global.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("activates Google after userinfo succeeds even when Drive about would fail", async () => {
    const { service, updates, connection } = harness("google");
    const calls: string[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("oauth2.googleapis.com/token")) {
        const body = String(init?.body ?? "");
        expect(body).toContain("redirect_uri=");
        expect(decodeURIComponent(body)).toContain(API + "/connections/oauth/google/callback");
        return jsonResponse(200, { access_token: "google-access", refresh_token: "google-refresh", expires_in: 3600, scope: "openid email profile" });
      }
      if (url.includes("openidconnect.googleapis.com/v1/userinfo")) {
        return jsonResponse(200, { sub: "google-user", email: "owner@example.com", name: "Owner" });
      }
      if (url.includes("drive/v3/about")) return jsonResponse(403, { error: { message: "accessNotConfigured" } });
      return jsonResponse(500, { error: "unexpected" });
    }) as typeof fetch;

    const result = await service.completeOAuth("google", "auth-code", "state-value");
    expect(result.frontend).toBe(FRONTEND);
    expect(result.returnPath).toBe("/files/connections");
    expect(result.connectionId).toBe("conn-1");
    expect(connection.status).toBe(ConnectionStatus.ACTIVE);
    expect(updates.some((item) => item.status === ConnectionStatus.ACTIVE)).toBe(true);
    expect(calls.some((url) => url.includes("userinfo"))).toBe(true);
    expect(calls.some((url) => url.includes("drive/v3/about"))).toBe(false);
    expect(service.browserReturnUrl(result.frontend, (result.returnPath || "/files/connections") + "?oauth=success&provider=google&connectionId=" + result.connectionId)).toBe(
      FRONTEND + "/files/connections?oauth=success&provider=google&connectionId=conn-1",
    );
  });

  it("activates GitHub from a form-encoded token response and sends a User-Agent", async () => {
    const { service, connection } = harness("github");
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("github.com/login/oauth/access_token")) {
        expect(decodeURIComponent(String(init?.body ?? ""))).toContain(API + "/connections/oauth/github/callback");
        return new Response("access_token=github-access&scope=read%3Auser&token_type=bearer", {
          status: 200,
          headers: { "content-type": "application/x-www-form-urlencoded" },
        });
      }
      if (url === "https://api.github.com/user") {
        expect(new Headers(init?.headers).get("user-agent")).toBe("IMKAN-WorkDrive");
        return jsonResponse(200, { id: 42, login: "octocat", name: "Octo Cat" });
      }
      return jsonResponse(500, { error: "unexpected" });
    }) as typeof fetch;

    const result = await service.completeOAuth("github", "auth-code", "state-value");
    expect(connection.status).toBe(ConnectionStatus.ACTIVE);
    expect(result.frontend).toBe(FRONTEND);
    expect(new URL(service.browserReturnUrl(result.frontend, result.returnPath || "/files/connections")).origin).toBe(FRONTEND);
  });

  it("does not downgrade an ACTIVE connection when the callback is repeated", async () => {
    const { service, connection, state } = harness("google");
    connection.status = ConnectionStatus.ACTIVE;
    state.usedAt = new Date();
    const result = await service.handleOAuthCallbackError("google", "state-value", "oauth_failed", "OAuth state is invalid or expired");
    expect(result.alreadyActive).toBe(true);
    expect(connection.status).toBe(ConnectionStatus.ACTIVE);
    expect(result.frontend).toBe(FRONTEND);
  });

  it("keeps the browser redirect on the frontend when FRONTEND_URL is the API origin", () => {
    process.env.NODE_ENV = "production";
    expect(resolveOAuthFrontendOrigin(API, API, "production")).toBe(PRODUCTION_FRONTEND_ORIGIN);
    expect(probeTargets("google", "https://www.googleapis.com/drive/v3/about?fields=user")[0]?.url).toBe("https://openidconnect.googleapis.com/v1/userinfo");
    expect(probeTargets("github", "https://api.github.com/user")).toEqual([{ url: "https://api.github.com/user", method: "GET" }]);
    expect(probeTargets("dropbox", "https://api.dropboxapi.com/2/users/get_current_account")[0]).toEqual({
      url: "https://api.dropboxapi.com/2/users/get_current_account",
      method: "POST",
    });
  });
});