import test from "node:test";
import assert from "node:assert/strict";
import { buildCreateShareBody } from "./share-payload.ts";

test("share payload matches the API contract and omits client orgId", () => {
  const body = buildCreateShareBody({
    resourceType: "FILE",
    resourceId: "00000000-0000-4000-8000-000000000021",
    expiresAt: "2026-12-01T00:00:00.000Z",
    password: "s3cret-link",
    canDownload: false,
  });
  assert.deepEqual(body, {
    resource_type: "FILE",
    resource_id: "00000000-0000-4000-8000-000000000021",
    can_download: false,
    expires_at: "2026-12-01T00:00:00.000Z",
    password: "s3cret-link",
  });
  assert.equal("orgId" in body, false);
  assert.equal("org_id" in body, false);
});
