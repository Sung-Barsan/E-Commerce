import { Server } from "socket.io";
import { User } from "../models/index.js";
export function attachSockets(server, app) {
  const io = new Server(server, {
    serveClient: true,
    allowRequest: (req, done) =>
      done(
        null,
        !req.headers.origin ||
          req.headers.origin === app.locals.config.APP_BASE_URL,
      ),
  });
  io.engine.use(app.locals.sessionMiddleware);
  io.use(async (socket, next) => {
    try {
      const session = socket.request.session;
      const user = session?.userId && (await User.findById(session.userId));
      if (!user || user.suspended || user.sessionVersion !== session.version)
        return next(new Error("Unauthorized"));
      socket.data.userId = String(user._id);
      socket.data.version = user.sessionVersion;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
    socket.join(`session:${socket.request.sessionID}`);
    // No client-selected room or subscription handlers are exposed.
    const timer = setInterval(async () => {
      try {
        const user = await User.findById(socket.data.userId);
        if (
          !user ||
          user.suspended ||
          user.sessionVersion !== socket.data.version ||
          socket.request.session.cookie.expires < new Date()
        )
          socket.disconnect(true);
      } catch {
        socket.disconnect(true);
      }
    }, 30000);
    socket.on("disconnect", () => clearInterval(timer));
  });
  app.locals.io = io;
  return io;
}
