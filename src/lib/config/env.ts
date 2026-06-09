import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AUDIT_STATUS_STEP_DELAY_MS: z.coerce.number().int().positive().default(800),
  CRAWLER_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  CRAWLER_MAX_TEXT_LENGTH: z.coerce.number().int().positive().default(20_000),
  LOCAL_STORAGE_ROOT: z.string().min(1).default("public/storage"),
  LOCAL_STORAGE_PUBLIC_URL_PREFIX: z.string().min(1).default("/storage"),
  LIGHTHOUSE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  ACCESSIBILITY_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000)
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL,
      AUDIT_STATUS_STEP_DELAY_MS: process.env.AUDIT_STATUS_STEP_DELAY_MS,
      CRAWLER_TIMEOUT_MS: process.env.CRAWLER_TIMEOUT_MS,
      CRAWLER_MAX_TEXT_LENGTH: process.env.CRAWLER_MAX_TEXT_LENGTH,
      LOCAL_STORAGE_ROOT: process.env.LOCAL_STORAGE_ROOT,
      LOCAL_STORAGE_PUBLIC_URL_PREFIX: process.env.LOCAL_STORAGE_PUBLIC_URL_PREFIX,
      LIGHTHOUSE_TIMEOUT_MS: process.env.LIGHTHOUSE_TIMEOUT_MS,
      ACCESSIBILITY_TIMEOUT_MS: process.env.ACCESSIBILITY_TIMEOUT_MS
    });
  }

  return cachedEnv;
}
