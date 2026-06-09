import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AUTH_SECRET: z.string().optional().default(""),
  ENTYSA_ADMIN_EMAIL: z.string().optional().default(""),
  ENTYSA_ADMIN_PASSWORD: z.string().optional().default(""),
  AUDIT_STATUS_STEP_DELAY_MS: z.coerce.number().int().positive().default(800),
  CRAWLER_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  CRAWLER_MAX_TEXT_LENGTH: z.coerce.number().int().positive().default(20_000),
  LOCAL_STORAGE_ROOT: z.string().min(1).default("public/storage"),
  LOCAL_STORAGE_PUBLIC_URL_PREFIX: z.string().min(1).default("/storage"),
  LIGHTHOUSE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  ACCESSIBILITY_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  AI_MAX_PROMPT_CHARS: z.coerce.number().int().positive().default(60_000),
  AI_MAX_STRING_CHARS: z.coerce.number().int().positive().default(4_000),
  AI_MAX_ARRAY_ITEMS: z.coerce.number().int().positive().default(80),
  CRAWLER_MAX_PAGES: z.coerce.number().int().positive().default(10),
  CRAWLER_MAX_REDIRECTS: z.coerce.number().int().nonnegative().default(5),
  SCREENSHOT_MAX_BYTES: z.coerce.number().int().positive().default(4_000_000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  AUDIT_CREATE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUDIT_START_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  ADMIN_API_KEY: z.string().optional().default("")
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL,
      AUTH_SECRET: process.env.AUTH_SECRET,
      ENTYSA_ADMIN_EMAIL: process.env.ENTYSA_ADMIN_EMAIL,
      ENTYSA_ADMIN_PASSWORD: process.env.ENTYSA_ADMIN_PASSWORD,
      AUDIT_STATUS_STEP_DELAY_MS: process.env.AUDIT_STATUS_STEP_DELAY_MS,
      CRAWLER_TIMEOUT_MS: process.env.CRAWLER_TIMEOUT_MS,
      CRAWLER_MAX_TEXT_LENGTH: process.env.CRAWLER_MAX_TEXT_LENGTH,
      LOCAL_STORAGE_ROOT: process.env.LOCAL_STORAGE_ROOT,
      LOCAL_STORAGE_PUBLIC_URL_PREFIX: process.env.LOCAL_STORAGE_PUBLIC_URL_PREFIX,
      LIGHTHOUSE_TIMEOUT_MS: process.env.LIGHTHOUSE_TIMEOUT_MS,
      ACCESSIBILITY_TIMEOUT_MS: process.env.ACCESSIBILITY_TIMEOUT_MS,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
      AI_TIMEOUT_MS: process.env.AI_TIMEOUT_MS,
      AI_MAX_PROMPT_CHARS: process.env.AI_MAX_PROMPT_CHARS,
      AI_MAX_STRING_CHARS: process.env.AI_MAX_STRING_CHARS,
      AI_MAX_ARRAY_ITEMS: process.env.AI_MAX_ARRAY_ITEMS,
      CRAWLER_MAX_PAGES: process.env.CRAWLER_MAX_PAGES,
      CRAWLER_MAX_REDIRECTS: process.env.CRAWLER_MAX_REDIRECTS,
      SCREENSHOT_MAX_BYTES: process.env.SCREENSHOT_MAX_BYTES,
      RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
      AUDIT_CREATE_RATE_LIMIT_MAX: process.env.AUDIT_CREATE_RATE_LIMIT_MAX,
      AUDIT_START_RATE_LIMIT_MAX: process.env.AUDIT_START_RATE_LIMIT_MAX,
      ADMIN_API_KEY: process.env.ADMIN_API_KEY
    });
  }

  return cachedEnv;
}
