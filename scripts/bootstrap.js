import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { readConfig } from "../src/config/env.js";
import { passwordSchema } from "../src/routes/auth.js";
import { User } from "../src/models/index.js";
const config = readConfig();
if (config.NODE_ENV !== "development")
  throw new Error("Bootstrap is development-only");
const email = process.env.BOOTSTRAP_EMAIL;
const password = passwordSchema.parse(process.env.BOOTSTRAP_PASSWORD);
if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email))
  throw new Error(
    "Provide BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD environment variables",
  );
await mongoose.connect(config.MONGODB_URI);
if (await User.exists({ role: "superadmin" }))
  throw new Error(
    "A super admin already exists. Bootstrap will not replace it.",
  );
await User.create({
  name: "Local administrator",
  email: email.toLowerCase(),
  password: await bcrypt.hash(password, 12),
  role: "superadmin",
  approved: true,
  verified: true,
});
console.log("Created local super admin.");
await mongoose.disconnect();
