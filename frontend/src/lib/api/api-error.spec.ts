import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, apiRequest } from "./client.ts";

test("apiRequest surfaces structured API error codes", async () => {
  process.env.NEXT_PUBLIC_DEV_JWT = "jwt-code-test";
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://api.test";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        statusCode: 409,
        code: "MEMBER_ALREADY_EXISTS",
        message: "Member already exists",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );

  await assert.rejects(() => apiRequest("/team-folders/x/members"), (cause: unknown) => {
    assert.equal(cause instanceof ApiError, true);
    const error = cause as ApiError;
    assert.equal(error.status, 409);
    assert.equal(error.code, "MEMBER_ALREADY_EXISTS");
    assert.equal(error.message, "Member already exists");
    return true;
  });
});

test("apiRequest keeps plain-text bodies as the error message", async () => {
  process.env.NEXT_PUBLIC_DEV_JWT = "jwt-code-test";
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://api.test";
  globalThis.fetch = async () => new Response("boom", { status: 500 });

  await assert.rejects(() => apiRequest("/anything"), (cause: unknown) => {
    assert.equal(cause instanceof ApiError, true);
    const error = cause as ApiError;
    assert.equal(error.status, 500);
    assert.equal(error.message, "boom");
    assert.equal(error.code, undefined);
    return true;
  });
});