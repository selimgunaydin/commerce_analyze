import { NextResponse } from "next/server";
import { getEnv } from "@/src/lib/config/env";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export function rateLimit(request: Request, params: { keyPrefix: string; maxRequests: number }) {
  const env = getEnv();
  const now = Date.now();
  const key = `${params.keyPrefix}:${getClientKey(request)}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + env.RATE_LIMIT_WINDOW_MS
    });
    return null;
  }

  existing.count += 1;

  if (existing.count <= params.maxRequests) {
    return null;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1_000));

  return NextResponse.json(
    {
      error: "Rate limit exceeded.",
      retryAfterSeconds
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds)
      }
    }
  );
}

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || "unknown";
}
