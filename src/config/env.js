import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().min(1),
  SESSION_SECRET: z
    .string()
    .min(32)
    .refine(
      (v) => !v.startsWith("replace-"),
      "Generate a random session secret",
    ),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DEMO_MODE: z.literal("true").default("true"),
});
export function readConfig(env = process.env) {
  return schema.parse(env);
}
