import http from "node:http";
import mongoose from "mongoose";
import { readConfig } from "./config/env.js";
import { createApp, logger } from "./app.js";
import { attachSockets } from "./sockets/index.js";
const config = readConfig();
await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
const hello = await mongoose.connection.db.admin().command({ hello: 1 });
if (!hello.setName)
  throw new Error(
    "MongoDB replica set required for safe checkout. See README.",
  );
const app = createApp(config);
const server = http.createServer(app);
const io = attachSockets(server, app);
server.listen(config.PORT, "127.0.0.1", () =>
  logger.info(`NEXORA demo: ${config.APP_BASE_URL}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    io.close();
    server.close(async () => {
      await app.locals.sessionStore.close();
      await mongoose.disconnect();
      process.exit(0);
    });
  });
