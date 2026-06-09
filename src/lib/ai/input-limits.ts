import { getEnv } from "@/src/lib/config/env";

export function stringifyForAIPrompt(value: unknown) {
  const env = getEnv();
  const limited = limitValue(value, {
    maxArrayItems: env.AI_MAX_ARRAY_ITEMS,
    maxStringChars: env.AI_MAX_STRING_CHARS
  });
  const json = JSON.stringify(limited);

  if (json.length <= env.AI_MAX_PROMPT_CHARS) {
    return json;
  }

  return JSON.stringify({
    ...asObject(limited),
    _truncatedForAICostGuard: true,
    _originalJsonLength: json.length,
    _contentPreview: json.slice(0, env.AI_MAX_PROMPT_CHARS)
  });
}

function limitValue(value: unknown, limits: { maxArrayItems: number; maxStringChars: number }): unknown {
  if (typeof value === "string") {
    return value.length > limits.maxStringChars ? `${value.slice(0, limits.maxStringChars)}... [truncated]` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, limits.maxArrayItems).map((item) => limitValue(item, limits));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, limitValue(nestedValue, limits)])
    );
  }

  return value;
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
