import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("keeps the action cell isolated from resource-row navigation", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/components/file-table.tsx"), "utf8");
  assert.match(source, /onClick=\{\(event\) => event\.stopPropagation\(\)\} onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(source, /onAssignWorkflow\?: \(resourceType: "FILE" \| "FOLDER"/);
});

test("passes workflow assignment to both table and grid action menus", () => {
  const table = fs.readFileSync(path.join(process.cwd(), "src/components/file-table.tsx"), "utf8");
  const grid = fs.readFileSync(path.join(process.cwd(), "src/components/file-grid-view.tsx"), "utf8");
  const browser = fs.readFileSync(path.join(process.cwd(), "src/components/file-browser.tsx"), "utf8");
  assert.match(table, /onAssignWorkflow && canMutate \? \(\) => onAssignWorkflow\("FILE"/);
  assert.match(grid, /onAssignWorkflow\?:/);
  assert.match(grid, /onAssignWorkflow: canMutate && onAssignWorkflow/);
  assert.match(browser, /onAssignWorkflow=\{\(type,id,name\)=>setWorkflowTarget\(\{type,id,name\}\)\}/);
});

test("isolates command menu clicks from ancestor navigation", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/components/action-dropdown.tsx"), "utf8");
  assert.match(source, /event\.preventDefault\(\);/);
  assert.match(source, /event\.stopPropagation\(\);/);
  assert.match(source, /item\.onSelect\(\);/);
});
