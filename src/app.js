import path from "node:path";
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pino from "pino";
import { ZodError } from "zod";
import { Cart, Notification } from "./models/index.js";
import { csrf, loadUser } from "./middleware/security.js";
import auth from "./routes/auth.js";
import store from "./routes/store.js";
import customer from "./routes/customer.js";
import management from "./routes/management.js";
export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
});
export function createApp(config) {
  const app = express();
  app.locals.config = config;
  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", path.resolve("src/views"));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "style-src": ["'self'"],
          "img-src": ["'self'", "data:"],
          "connect-src": ["'self'"],
          "upgrade-insecure-requests":
            config.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.use(
    "/uploads",
    express.static(path.resolve("src/public/uploads"), {
      maxAge: "1d",
      dotfiles: "deny",
    }),
  );
  app.use(
    express.static(path.resolve("src/public"), {
      maxAge: config.NODE_ENV === "production" ? "1d" : 0,
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  app.use(express.json({ limit: "32kb" }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const sessionStore = MongoStore.create({
    mongoUrl: config.MONGODB_URI,
    collectionName: "sessions",
    ttl: 86400,
  });
  app.locals.sessionStore = sessionStore;
  const sessionMiddleware = session({
    name: "nexora.sid",
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400000,
    },
  });
  app.locals.sessionMiddleware = sessionMiddleware;
  app.use(sessionMiddleware);
  app.use(loadUser);
  app.use(csrf);
  app.use(async (req, res, next) => {
    res.locals.money = (n) =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(n / 100);
    res.locals.path = req.path;
    res.locals.baseUrl = config.APP_BASE_URL;
    res.locals.cartCount = 0;
    res.locals.unread = 0;
    if (req.user) {
      const cart = await Cart.findOne({ user: req.user._id });
      res.locals.cartCount =
        cart?.items.reduce((n, i) => n + i.quantity, 0) || 0;
      res.locals.unread = await Notification.countDocuments({
        user: req.user._id,
        read: false,
      });
    }
    next();
  });
  app.get("/health", (req, res) => res.json({ status: "ok", demo: true }));
  app.use("/auth", auth);
  app.use(store);
  app.use(customer);
  app.use(management);
  app.use((req, res) =>
    res
      .status(404)
      .render("message", {
        title: "Page not found",
        message:
          "This page has moved or does not exist. Explore the collection to find something good.",
      }),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    let status = err.status || 500,
      message = err.message;
    if (err instanceof ZodError) {
      status = 400;
      message = err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    }
    if (err.code === 11000) {
      status = 409;
      message = "This record already exists. Please use a different value.";
    }
    if (
      err.name === "CastError" ||
      err.name === "ValidationError" ||
      err.name === "MulterError"
    ) {
      status = 400;
      message = "Invalid input or image. Check the form and try again.";
    }
    if (status === 500) {
      logger.error({ name: err.name, code: err.code }, "Request failed");
      message = "Something went wrong. Please try again.";
    }
    if (
      req.get("accept")?.includes("application/json") ||
      req.path.startsWith("/api/")
    )
      return res.status(status).json({ error: message });
    res
      .status(status)
      .render("message", {
        title: status === 403 ? "Access restricted" : "Let’s try that again",
        message,
      });
  });
  return app;
}
