import { NextResponse } from "next/server";
import { getEnv } from "@/src/lib/config/env";

export function requireAdminApiKey(request: Request) {
  const env = getEnv();

  if (!env.ADMIN_API_KEY) {
    return NextResponse.json({ error: "Admin endpoints are disabled." }, { status: 404 });
  }

  const providedKey = request.headers.get("x-admin-api-key");

  if (providedKey !== env.ADMIN_API_KEY) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
}
