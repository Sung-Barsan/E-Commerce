import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ejs from "ejs";
let count = 0;
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["build", "uploads"].includes(entry.name)) visit(file);
    } else if (file.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", file], {
        encoding: "utf8",
      });
      if (result.status) {
        console.error(result.stderr);
        process.exit(1);
      }
      count++;
    } else if (file.endsWith(".ejs")) {
      ejs.compile(fs.readFileSync(file, "utf8"), { filename: file });
      count++;
    }
  }
}
for (const dir of ["src", "scripts", "tests"]) visit(dir);
console.log(
  `Syntax checked ${count} JavaScript and EJS files. This is a syntax check, not a full style linter.`,
);
