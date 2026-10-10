import dotenv from "dotenv";
import path from "node:path";
dotenv.config({
  path: [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
  ],
  quiet: true,
});
import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4007),
  APP_ORIGIN: z.url(),
  // Extra exact browser origins allowed to call the API with credentials, comma separated
  // (for example a frontend on another domain that proxies /api here).
  ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((o) => o.trim().replace(/\/+$/, ""))
        .filter(Boolean),
    )
    .pipe(z.array(z.url())),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
  MONGODB_DB: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .min(1),
  SESSION_SECRET: z
    .string()
    .min(32)
    .refine((v) => !/^replace-with/i.test(v), "Replace the example value"),
  DEMO_DATE: z.iso
    .datetime()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // 1 runs the job worker inside the API process, for hosts that start a single service.
  INLINE_WORKER: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("ap-south-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().default(3310),
  SMTP_URL: z.string().optional(),
  // Meta WhatsApp Cloud API. Broadcasts stay disabled until both values are set.
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default("v21.0"),
  MAIL_FROM: z.string().default("no-reply@example.com"),
});
// Auto-detect public URL on Railway if APP_ORIGIN is not explicitly provided
if (!process.env.APP_ORIGIN) {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    process.env.APP_ORIGIN = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  } else if (process.env.RAILWAY_STATIC_URL) {
    process.env.APP_ORIGIN = `https://${process.env.RAILWAY_STATIC_URL}`;
  }
}
// A host that sets none of NODE_ENV is a deployment, not a laptop: do not silently run it as development
// (non-Secure cookies, localhost origins trusted).
if (!process.env.NODE_ENV && process.env.RAILWAY_ENVIRONMENT) {
  process.env.NODE_ENV = "production";
}
if (!process.env.TRUST_PROXY && process.env.RAILWAY_ENVIRONMENT) {
  process.env.TRUST_PROXY = "1";
}
// Railway starts only the API service from this repository, so jobs run in-process unless a
// dedicated worker service opts out with INLINE_WORKER=0.
if (!process.env.INLINE_WORKER && process.env.RAILWAY_ENVIRONMENT) {
  process.env.INLINE_WORKER = "1";
}

let parsedConfig: z.infer<typeof schema>;
try {
  parsedConfig = schema.parse(process.env);
} catch (err) {
  if (err instanceof z.ZodError) {
    const missing = err.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(
      `\n❌ [CRM Config Error] Missing or invalid environment variables:\n${missing}\n\n👉 Please configure these in Railway under the "Variables" tab.\n`,
    );
  }
  throw err;
}
export const config = parsedConfig;
// Behind a reverse proxy the client address and protocol come from the forwarded headers. Left at 0, a
// proxy's own address is the only client every rate limit sees, and Secure session cookies are never set.
// Require the operator to state the hop count (0 means the API is directly exposed) in production.
if (
  parsedConfig.NODE_ENV === "production" &&
  process.env.TRUST_PROXY === undefined
)
  throw new Error(
    "Set TRUST_PROXY in production: the number of reverse proxies in front of the API (0 if none)",
  );
if (
  config.NODE_ENV === "production" &&
  (config.DEMO_DATE || !config.APP_ORIGIN.startsWith("https://"))
)
  throw new Error("Production requires HTTPS and a real clock");
