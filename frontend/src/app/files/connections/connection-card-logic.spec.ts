import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDisconnectConfirmationCopy,
  formatGrantedScopes,
  getConnectionActionLabel,
  resolveConnectedAccount,
} from "./connection-card-logic.ts";

test("ACTIVE connection action label switches to Disconnect on hover only", () => {
  assert.equal(getConnectionActionLabel("ACTIVE", false), "ACTIVE");
  assert.equal(getConnectionActionLabel("ACTIVE", true), "Disconnect");
  assert.equal(getConnectionActionLabel("PENDING_AUTH", true), "Connect");
});

test("connection details use backend account data or Not available", () => {
  assert.equal(resolveConnectedAccount({ authorizedAccount: { email: "user@example.com" } }), "user@example.com");
  assert.equal(resolveConnectedAccount({ authorizedAccount: null }), "Not available");
});

test("disconnect confirmation shows real governance counts", () => {
  const copy = buildDisconnectConfirmationCopy({
    providerName: "Google",
    governance: {
      activeWorkflowIds: ["w1", "w2"],
      workflowReferences: 3,
      functionReferences: 1,
    },
  });
  assert.match(copy.title, /Disconnect Google/);
  assert.match(copy.body, /Active workflows: 2/);
  assert.match(copy.body, /Workflow references: 3/);
  assert.match(copy.body, /Function references: 1/);
});

test("granted scopes come from the connection scope string", () => {
  assert.deepEqual(formatGrantedScopes("openid email profile"), ["openid", "email", "profile"]);
});
