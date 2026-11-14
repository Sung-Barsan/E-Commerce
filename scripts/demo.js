// Disposable, real MongoDB replica set for preview/QA. Never connects to your configured database.
import crypto from "node:crypto";
import http from "node:http";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { attachSockets } from "../src/sockets/index.js";
import { seed } from "./seed.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Temporary demo is not available in production");
const repl = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  binary: { version: process.env.MONGOMS_VERSION || "7.0.24" },
});
const uri = repl.getUri("nexora_preview");
await mongoose.connect(uri);
await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
await seed();
const port = Number(process.env.PORT || 3000);
const config = {
  NODE_ENV: "development",
  MONGODB_URI: uri,
  SESSION_SECRET: crypto.randomBytes(48).toString("hex"),
  APP_BASE_URL: `http://localhost:${port}`,
};
const app = createApp(config);
const server = http.createServer(app);
const io = attachSockets(server, app);
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Temporary NEXORA demo: ${config.APP_BASE_URL}\nAll data disappears when this process stops. Demo password: NexoraDemo123!`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await new Promise((resolve) => io.close(resolve));
    await app.locals.sessionStore.close();
    await mongoose.disconnect();
    await repl.stop();
    process.exit(0);
  });
