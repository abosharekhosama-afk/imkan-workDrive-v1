import { describe, expect, it } from "node:test";
import fs from "node:fs";
import path from "node:path";

describe("action dropdown navigation guard", () => {
  it("prevents row/link navigation when an action is clicked", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/action-dropdown.tsx"),
      "utf8",
    );

    expect(source).toContain("event.preventDefault();");
    expect(source).toContain("event.stopPropagation();");
    expect(source).toContain("item.onSelect();");
  });
});
