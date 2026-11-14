import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { User, Token, SimulatedEmail } from "../models/index.js";
import { requireGuest, requireAuth, fail } from "../middleware/security.js";
const router = Router();
const limited = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
export const passwordSchema = z
  .string()
  .min(10)
  .max(72)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/);
const emailSchema = z
  .string()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase().trim());
async function signIn(req, user) {
  await new Promise((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
  req.session.userId = String(user._id);
  req.session.version = user.sessionVersion;
  await new Promise((resolve, reject) =>
    req.session.save((e) => (e ? reject(e) : resolve())),
  );
}
async function sendToken(req, user, kind) {
  if (req.app.locals.config.NODE_ENV !== "development") return;
  const raw = crypto.randomBytes(32).toString("hex");
  await Token.deleteMany({ user: user._id, kind });
  await Token.create({
    user: user._id,
    hash: crypto.createHash("sha256").update(raw).digest("hex"),
    kind,
    expires: new Date(Date.now() + 30 * 60 * 1000),
  });
  const url = `${req.app.locals.config.APP_BASE_URL}/auth/${kind === "reset" ? "reset-password" : "verify-email"}?token=${raw}`;
  await SimulatedEmail.create({
    user: user._id,
    subject:
      kind === "reset" ? "Reset your password" : "Verify your demo email",
    body: url,
    expires: new Date(Date.now() + 30 * 60 * 1000),
  });
}
for (const mode of [
  "login",
  "register",
  "forgot-password",
  "reset-password",
  "verify-email",
])
  router.get(`/${mode}`, (req, res) =>
    res.render("auth", {
      title: mode.replaceAll("-", " "),
      mode,
      token: typeof req.query.token === "string" ? req.query.token : "",
    }),
  );
router.post("/register", limited, requireGuest, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(80),
      email: emailSchema,
      password: passwordSchema,
      role: z.enum(["customer", "seller"]),
    })
    .parse(req.body);
  const user = await User.create({
    ...data,
    approved: data.role === "customer",
    password: await bcrypt.hash(data.password, 12),
  });
  await signIn(req, user);
  await sendToken(req, user, "verify");
  res.redirect("/account");
});
router.post("/login", limited, requireGuest, async (req, res) => {
  const data = z
    .object({ email: emailSchema, password: z.string().min(1).max(72) })
    .parse(req.body);
  const user = await User.findOne({ email: data.email }).select("+password");
  const valid = await bcrypt.compare(
    data.password,
    user?.password ||
      "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW",
  );
  if (!user || !valid || user.suspended)
    throw fail(401, "Incorrect email or password");
  await signIn(req, user);
  res.redirect("/account");
});
router.post("/logout", requireAuth, async (req, res) => {
  req.app.locals.io?.in(`session:${req.sessionID}`).disconnectSockets(true);
  await new Promise((resolve, reject) =>
    req.session.destroy((e) => (e ? reject(e) : resolve())),
  );
  res.clearCookie("nexora.sid");
  res.redirect("/");
});
router.post("/forgot-password", limited, async (req, res) => {
  const email = emailSchema.parse(req.body.email);
  const user = await User.findOne({ email });
  if (user) await sendToken(req, user, "reset");
  res.render("message", {
    title: "Check the local email simulator",
    message:
      "If the account exists, a reset link was created in development. The local operator can read it with npm run mail -- email@example.test. No email is sent.",
  });
});
router.post("/reset-password", limited, async (req, res) => {
  const data = z
    .object({
      token: z.string().regex(/^[a-f0-9]{64}$/),
      password: passwordSchema,
    })
    .parse(req.body);
  const token = await Token.findOneAndDelete({
    hash: crypto.createHash("sha256").update(data.token).digest("hex"),
    kind: "reset",
    expires: { $gt: new Date() },
  });
  if (!token) throw fail(400, "Invalid or expired link");
  await User.updateOne(
    { _id: token.user },
    {
      $set: { password: await bcrypt.hash(data.password, 12) },
      $inc: { sessionVersion: 1 },
    },
  );
  req.app.locals.io?.in(`user:${token.user}`).disconnectSockets(true);
  res.redirect("/auth/login");
});
router.post("/verify-email", requireAuth, async (req, res) => {
  const raw = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(req.body.token);
  const token = await Token.findOneAndDelete({
    hash: crypto.createHash("sha256").update(raw).digest("hex"),
    kind: "verify",
    user: req.user._id,
    expires: { $gt: new Date() },
  });
  if (!token) throw fail(400, "Invalid or expired link");
  await User.updateOne({ _id: req.user._id }, { verified: true });
  res.redirect("/account");
});
router.post("/resend-verification", requireAuth, limited, async (req, res) => {
  await sendToken(req, req.user, "verify");
  res.redirect("/account");
});
export default router;
