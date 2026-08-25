import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = raw.split(/\r?\n/).find((row) => row.startsWith("DATABASE_URL="));
if (!line) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
let value = line.slice("DATABASE_URL=".length).trim();
if (
  (value.startsWith('"') && value.endsWith('"')) ||
  (value.startsWith("'") && value.endsWith("'"))
) {
  value = value.slice(1, -1);
}
const url = new URL(value);
console.log(
  JSON.stringify(
    {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || "3306",
      username: url.username,
      database: url.pathname.replace(/^\//, ""),
      passwordSet: Boolean(url.password),
      passwordLength: url.password.length,
      hasQuery: Boolean(url.search),
    },
    null,
    2,
  ),
);
