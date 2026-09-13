import test from "node:test";
import assert from "node:assert/strict";
import { apiRequest, ApiError } from "./client.ts";

test("apiRequest sends the bearer token to the API base URL", async () => {
  process.env.NEXT_PUBLIC_DEV_JWT = "jwt-tenant-a";
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://api.test";
  const calls: Array<{ url: string; auth: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      auth: headers.get("Authorization"),
    });
    return new Response(JSON.stringify({ folders: [], files: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const body = await apiRequest<{ folders: unknown[] }>("/folders");
  assert.deepEqual(body, { folders: [], files: [] });
  assert.equal(calls[0]?.url, "http://api.test/folders");
  assert.equal(calls[0]?.auth, "Bearer jwt-tenant-a");
});

test("apiRequest fails closed without a token", async () => {
  delete process.env.NEXT_PUBLIC_DEV_JWT;
  await assert.rejects(() => apiRequest("/folders"), (error: unknown) => {
    assert.equal(error instanceof ApiError, true);
    assert.equal((error as ApiError).status, 401);
    return true;
  });
});
