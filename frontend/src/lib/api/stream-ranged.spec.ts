import test from "node:test";
import assert from "node:assert/strict";
import { nextRange, parseContentRange, STREAM_CHUNK_BYTES } from "./stream-ranged.ts";

test("parseContentRange reads RFC 7233 byte ranges", () => {
  assert.deepEqual(parseContentRange("bytes 0-1048575/4718592"), { start: 0, end: 1048575, total: 4718592 });
  assert.deepEqual(parseContentRange("bytes 2048-4095/*"), { start: 2048, end: 4095, total: -1 });
});

test("parseContentRange rejects absent or malformed headers", () => {
  assert.equal(parseContentRange(null), null);
  assert.equal(parseContentRange(""), null);
  assert.equal(parseContentRange("items 0-10/20"), null);
  assert.equal(parseContentRange("bytes 9-3/100"), null);
  assert.equal(parseContentRange("bytes a-b/c"), null);
});

test("nextRange walks sequential windows until the total is consumed", () => {
  const chunk = STREAM_CHUNK_BYTES;
  assert.equal(nextRange(0, chunk * 2), `bytes=0-${chunk - 1}`);
  assert.equal(nextRange(chunk, chunk * 2), `bytes=${chunk}-${chunk * 2 - 1}`);
  assert.equal(nextRange(chunk * 2, chunk * 2), null);
  // Unknown totals keep requesting fixed-size windows forever.
  assert.equal(nextRange(chunk, null), `bytes=${chunk}-${chunk * 2 - 1}`);
  // Final partial window is clamped to the last byte.
  assert.equal(nextRange(chunk * 2 - 500, chunk * 2), `bytes=${chunk * 2 - 500}-${chunk * 2 - 1}`);
  assert.equal(nextRange(0, 0), null);
});
