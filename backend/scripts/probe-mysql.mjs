import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = raw.split(/\r?\n/).find((row) => row.startsWith("DATABASE_URL="));
let value = line.slice("DATABASE_URL=".length).trim();
if (
  (value.startsWith('"') && value.endsWith('"')) ||
  (value.startsWith("'") && value.endsWith("'"))
) {
  value = value.slice(1, -1);
}
const url = new URL(value);
const mysql = "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe";
const sql = [
  "SELECT VERSION() AS version, @@version_comment AS comment, @@default_authentication_plugin AS default_plugin;",
  "SELECT USER() AS session_user, CURRENT_USER() AS current_user;",
  "SELECT user, host, plugin FROM mysql.user WHERE user IN ('workdrive_dev_user','root');",
  "SHOW DATABASES LIKE 'workdrive_dev';",
].join(" ");

const result = spawnSync(
  mysql,
  [
    "-h",
    url.hostname,
    "-P",
    url.port || "3306",
    "-u",
    url.username,
    `-p${url.password}`,
    "--connect-timeout=8",
    "-e",
    sql,
  ],
  { encoding: "utf8" },
);

const redact = (text) =>
  (text ?? "").replaceAll(url.password, "***").replace(/-p\S+/g, "-p***");
process.stdout.write(redact(result.stdout));
process.stderr.write(redact(result.stderr));
process.exit(result.status ?? 1);
