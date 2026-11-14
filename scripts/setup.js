import fs from "node:fs/promises";
import crypto from "node:crypto";
try {
  const sample = await fs.readFile(".env.example", "utf8");
  await fs.writeFile(
    ".env",
    sample.replace(
      "replace-with-at-least-32-random-characters",
      crypto.randomBytes(48).toString("hex"),
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log("Created .env with a random session secret.");
} catch (e) {
  if (e.code === "EEXIST") console.log(".env already exists; left unchanged.");
  else throw e;
}
