import { isInternalUrl, isLikelyHtmlUrl, normalizeUrlForDiscovery } from "@/src/lib/utils/url-normalizer";
import type { ExtractedPageData } from "./types";

export type DiscoveredLink = {
  url: string;
  normalizedUrl: string;
  text: string;
  texts: string[];
};

export function discoverInternalLinks(params: {
  baseUrl: string;
  links: ExtractedPageData["links"];
  maxLinks?: number;
}) {
  const maxLinks = params.maxLinks ?? 500;
  const normalizedBase = normalizeUrlForDiscovery(params.baseUrl, params.baseUrl) ?? params.baseUrl;
  const linksByUrl = new Map<string, DiscoveredLink>();

  for (const link of params.links) {
    const normalizedUrl = normalizeUrlForDiscovery(link.href, normalizedBase);

    if (!normalizedUrl) {
      continue;
    }

    if (normalizedUrl === normalizedBase) {
      continue;
    }

    if (!isInternalUrl(normalizedUrl, normalizedBase) || !isLikelyHtmlUrl(normalizedUrl)) {
      continue;
    }

    const text = link.text.replace(/\s+/g, " ").trim();
    const existing = linksByUrl.get(normalizedUrl);

    if (existing) {
      if (text && !existing.texts.includes(text)) {
        existing.texts.push(text);
        existing.text = existing.text || text;
      }
      continue;
    }

    linksByUrl.set(normalizedUrl, {
      url: normalizedUrl,
      normalizedUrl,
      text,
      texts: text ? [text] : []
    });

    if (linksByUrl.size >= maxLinks) {
      break;
    }
  }

  return Array.from(linksByUrl.values());
}
