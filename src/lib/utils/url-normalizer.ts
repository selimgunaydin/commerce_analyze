const trackingParamPatterns = [
  /^utm_/i,
  /^hsa_/i,
  /^pk_/i,
  /^sc_/i
];

const disposableParams = new Set([
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "yclid",
  "mc_cid",
  "mc_eid",
  "irclickid",
  "_hsenc",
  "_hsmi",
  "sessionid",
  "phpsessid",
  "sid"
]);

const assetExtensions = /\.(avif|bmp|css|csv|doc|docx|gif|ico|jpeg|jpg|js|json|mp3|mp4|pdf|png|svg|webp|xls|xlsx|xml|zip)$/i;

export function normalizeUrlForDiscovery(inputUrl: string, baseUrl: string) {
  let url: URL;

  try {
    url = new URL(inputUrl, baseUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  url.hash = "";
  url.username = "";
  url.password = "";
  url.hostname = url.hostname.toLowerCase();

  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }

  url.pathname = normalizePathname(url.pathname);
  normalizeSearchParams(url.searchParams);

  return url.toString();
}

export function isInternalUrl(candidateUrl: string, baseUrl: string) {
  try {
    const candidate = new URL(candidateUrl);
    const base = new URL(baseUrl);

    if (candidate.protocol !== "http:" && candidate.protocol !== "https:") {
      return false;
    }

    return getComparableHostname(candidate.hostname) === getComparableHostname(base.hostname);
  } catch {
    return false;
  }
}

export function isLikelyHtmlUrl(url: string) {
  try {
    const parsed = new URL(url);
    return !assetExtensions.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function getUrlSignalText(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname} ${parsed.searchParams.toString()}`.replace(/[/_?&=.-]+/g, " ");
  } catch {
    return url;
  }
}

export function getUrlSegments(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizePathname(pathname: string) {
  const collapsed = pathname.replace(/\/{2,}/g, "/");

  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }

  return collapsed || "/";
}

function normalizeSearchParams(searchParams: URLSearchParams) {
  const entries = Array.from(searchParams.entries())
    .filter(([key, value]) => {
      const normalizedKey = key.toLowerCase();

      if (!value.trim()) {
        return false;
      }

      if (disposableParams.has(normalizedKey)) {
        return false;
      }

      return !trackingParamPatterns.some((pattern) => pattern.test(key));
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyCompare = leftKey.localeCompare(rightKey);
      return keyCompare === 0 ? leftValue.localeCompare(rightValue) : keyCompare;
    });

  Array.from(searchParams.keys()).forEach((key) => searchParams.delete(key));
  entries.forEach(([key, value]) => searchParams.append(key, value));
}

function getComparableHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}
