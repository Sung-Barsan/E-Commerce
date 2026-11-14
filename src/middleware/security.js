import crypto from "node:crypto";
import { User } from "../models/index.js";
import { can, owns } from "../policies/access.js";
export const fail = (status, message) =>
  Object.assign(new Error(message), { status });
export async function loadUser(req, res, next) {
  req.user = req.session.userId
    ? await User.findById(req.session.userId)
    : null;
  if (
    req.user &&
    (req.user.suspended || req.user.sessionVersion !== req.session.version)
  ) {
    req.user = null;
    delete req.session.userId;
  }
  res.locals.user = req.user;
  res.locals.can = (p) => can(req.user, p);
  next();
}
export function requireAuth(req, res, next) {
  if (!req.user)
    return req.method === "GET" && !req.path.startsWith("/api/")
      ? res.redirect("/auth/login")
      : next(fail(401, "Please sign in"));
  next();
}
export function requireGuest(req, res, next) {
  return req.user ? res.redirect("/account") : next();
}
export const requirePermission = (p) => (req, res, next) =>
  can(req.user, p) ? next() : next(fail(req.user ? 403 : 401, "Access denied"));
export const requireRole =
  (...roles) =>
  (req, res, next) =>
    req.user && roles.includes(req.user.role)
      ? next()
      : next(fail(403, "Access denied"));
export const requireOwnership = (owner) => (req, res, next) =>
  owns(req.user, owner(req)) ? next() : next(fail(404, "Record not found"));
export function requireApprovedSeller(req, res, next) {
  return req.user?.role === "seller" && req.user.approved
    ? next()
    : next(fail(403, "An approved seller account is required"));
}
export function csrf(req, res, next) {
  req.session.csrf ||= crypto.randomBytes(32).toString("hex");
  res.locals.csrf = req.session.csrf;
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const token = req.get("x-csrf-token") || req.body?._csrf;
    if (
      typeof token !== "string" ||
      token.length !== req.session.csrf.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrf))
    )
      return next(
        fail(403, "Invalid security token. Refresh the page and try again."),
      );
  }
  next();
}
