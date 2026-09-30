import assert from "node:assert/strict";
import test from "node:test";
import { activeMentionQuery, commentBodyParts, commentPermalink, filterMentionMembers, insertMention, visibleThreads } from "./comment-panel-logic.ts";

test("detects an @mention being typed and inserts the selected name", () => {
  const query = activeMentionQuery("hello @sa", 9);
  assert.deepEqual(query, { start: 6, query: "sa" });
  const members = [{ userId: "1", name: "Sara Ali", email: "sara@example.com" }];
  assert.equal(filterMentionMembers(members, "sa")[0]?.userId, "1");
  const next = insertMention("hello @sa", 6, 9, "Sara Ali");
  assert.equal(next.text, "hello @Sara Ali ");
});

test("hides resolved threads until Show resolved is selected", () => {
  const rows = [{ id: "a", resolvedAt: null }, { id: "b", resolvedAt: "2026-01-01" }];
  assert.deepEqual(visibleThreads(rows, false).map((row) => row.id), ["a"]);
  assert.deepEqual(visibleThreads(rows, true).map((row) => row.id), ["b"]);
});

test("builds a comment link and highlights mentions", () => {
  assert.equal(commentPermalink("https://work.example", "file-1", "comment-1"), "https://work.example/files?file=file-1&comment=comment-1");
  const parts = commentBodyParts("See @Sara Ali today", ["Sara Ali"]);
  assert.equal(parts.some((part) => part.kind === "mention" && part.text === "@Sara Ali"), true);
});