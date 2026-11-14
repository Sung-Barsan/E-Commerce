import mongoose from "mongoose";
import { readConfig } from "../src/config/env.js";
import { User, SimulatedEmail } from "../src/models/index.js";
const config = readConfig();
if (config.NODE_ENV !== "development")
  throw new Error("Local email inspection is development-only");
if (!process.argv[2])
  throw new Error("Usage: npm run mail -- customer@example.test");
await mongoose.connect(config.MONGODB_URI);
const user = await User.findOne({ email: process.argv[2].toLowerCase() });
if (user) {
  const messages = await SimulatedEmail.find({
    user: user._id,
    expires: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .limit(5);
  for (const message of messages)
    console.log(`${message.subject}\n${message.body}\n`);
}
await mongoose.disconnect();
