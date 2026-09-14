import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const password = randomBytes(24).toString("base64url");
const initPath = "C:\\Users\\pc\\mysql-init-root.sql";
const cnfPath = "C:\\Users\\pc\\mysql-client-root.cnf";
const notePath = "C:\\Users\\pc\\mysql-root-new.txt";

writeFileSync(
  initPath,
  `ALTER USER 'root'@'localhost' IDENTIFIED BY '${password}';\nFLUSH PRIVILEGES;\n`,
  { encoding: "utf8" },
);
writeFileSync(
  cnfPath,
  `[client]\nhost=127.0.0.1\nport=3306\nuser=root\npassword=${password}\n`,
  { encoding: "utf8" },
);
writeFileSync(
  notePath,
  `MySQL84 root@localhost was reset ${new Date().toISOString()}.\nKeep this file private; it is not in the repo.\n${password}\n`,
  { encoding: "utf8" },
);
console.log("WROTE_INIT=C:\\Users\\pc\\mysql-init-root.sql");
console.log("WROTE_CLIENT_CNF=C:\\Users\\pc\\mysql-client-root.cnf");
console.log("WROTE_NOTE=C:\\Users\\pc\\mysql-root-new.txt");
console.log("PASSWORD_LENGTH=" + String(password.length));
