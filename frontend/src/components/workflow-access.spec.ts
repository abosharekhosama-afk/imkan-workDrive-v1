import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("uses a server-backed capabilities endpoint and does not expose admin routes to members in the shell", () => {
  const access = fs.readFileSync(path.join(process.cwd(), "src/components/workflow-access.tsx"), "utf8");
  const shell = fs.readFileSync(path.join(process.cwd(), "src/components/workflow-shell.tsx"), "utf8");
  assert.match(access, /listWorkflowCapabilities/);
  assert.match(access, /canViewTemplates/);
  assert.match(access, /canViewQueue/);
  assert.match(shell, /visibleItems/);
  assert.match(shell, /access\[capability\]/);
});

test("treats builder creation and owned-draft editing as different capabilities", () => {
  const access = fs.readFileSync(path.join(process.cwd(), "src/components/workflow-access.tsx"), "utf8");
  assert.match(access, /searchParams\.get\("id"\) \? "canEditOwnedDrafts" : "canCreate"/);
});
