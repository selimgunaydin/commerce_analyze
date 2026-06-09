import dns from "node:dns/promises";
import net from "node:net";

export type ValidatedUrl = {
  originalUrl: string;
  normalizedUrl: string;
};

const blockedHostnames = new Set(["localhost"]);
const blockedHostnameSuffixes = [".localhost", ".local", ".internal", ".lan", ".home"];

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValidationError";
  }
}

export async function validateAndNormalizeUrl(input: string): Promise<ValidatedUrl> {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new UrlValidationError("URL is required.");
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UrlValidationError("URL must be absolute and include http or https.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlValidationError("Only http and https URLs are supported.");
  }

  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  normalizeDefaultPort(parsed);

  const hostname = normalizeHostname(parsed.hostname);

  if (blockedHostnames.has(hostname) || blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw new UrlValidationError("Local or internal hostnames are not allowed.");
  }

  if (isIpAddressBlocked(hostname)) {
    throw new UrlValidationError("Private, local, or internal IP addresses are not allowed.");
  }

  await rejectPrivateDnsTargets(hostname);

  return {
    originalUrl: trimmed,
    normalizedUrl: parsed.toString()
  };
}

function normalizeDefaultPort(url: URL) {
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

async function rejectPrivateDnsTargets(hostname: string) {
  if (net.isIP(hostname)) {
    return;
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: false });
    const blocked = addresses.some((entry) => isIpAddressBlocked(entry.address));

    if (blocked) {
      throw new UrlValidationError("URL resolves to a private, local, or internal address.");
    }
  } catch (error) {
    if (error instanceof UrlValidationError) {
      throw error;
    }
  }
}

function isIpAddressBlocked(address: string) {
  const normalized = normalizeHostname(address);
  const ipVersion = net.isIP(normalized);

  if (ipVersion === 4) {
    return isBlockedIpv4(normalized);
  }

  if (ipVersion === 6) {
    return isBlockedIpv6(normalized);
  }

  return false;
}

function isBlockedIpv4(address: string) {
  const octets = address.split(".").map((part) => Number(part));

  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string) {
  const normalized = address.toLowerCase();

  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1" || normalized === "::" || isUniqueLocalIpv6(normalized) || isLinkLocalIpv6(normalized)) {
    return true;
  }

  const ipv4MappedPrefix = "::ffff:";

  if (normalized.startsWith(ipv4MappedPrefix)) {
    return isBlockedIpv4(normalized.slice(ipv4MappedPrefix.length));
  }

  return false;
}

function isUniqueLocalIpv6(address: string) {
  return address.startsWith("fc") || address.startsWith("fd");
}

function isLinkLocalIpv6(address: string) {
  const firstHextet = Number.parseInt(address.split(":")[0] ?? "", 16);

  if (!Number.isFinite(firstHextet)) {
    return false;
  }

  return firstHextet >= 0xfe80 && firstHextet <= 0xfebf;
}
