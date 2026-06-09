import { AuditDepth } from "@prisma/client";
import { discoverInternalLinks, type DiscoveredLink } from "./link-discovery";
import { classifyLinkCandidate, type PageClassification } from "./page-classifier";
import type { ExtractedPageData, PageType } from "./types";

type DepthConfig = {
  maxPages: number;
  includeHome: boolean;
  plpCount: number;
  pdpCount: number;
  searchCount: number;
  campaignCount: number;
};

export type DiscoveryCandidate = {
  link: DiscoveredLink;
  pageType: Exclude<PageType, "home">;
  classification: PageClassification;
};

export const depthConfig: Record<AuditDepth, DepthConfig> = {
  QUICK: {
    maxPages: 1,
    includeHome: true,
    plpCount: 0,
    pdpCount: 0,
    searchCount: 0,
    campaignCount: 0
  },
  STANDARD: {
    maxPages: 3,
    includeHome: true,
    plpCount: 1,
    pdpCount: 1,
    searchCount: 0,
    campaignCount: 0
  },
  DEEP: {
    maxPages: 10,
    includeHome: true,
    plpCount: 3,
    pdpCount: 3,
    searchCount: 1,
    campaignCount: 2
  }
};

export function createPageDiscoveryPlan(params: {
  depth: AuditDepth;
  homepage: ExtractedPageData;
  baseUrl: string;
}) {
  const config = depthConfig[params.depth];
  const discoveredLinks = discoverInternalLinks({
    baseUrl: params.baseUrl,
    links: params.homepage.links
  });
  const classifiedCandidates = discoveredLinks
    .map((link) => {
      const classification = classifyLinkCandidate(link);

      return {
        link,
        pageType: classification.pageType,
        classification
      };
    })
    .filter((candidate): candidate is DiscoveryCandidate => candidate.pageType !== "home" && candidate.pageType !== "content" && candidate.pageType !== "unknown");

  const selected = selectCandidates(classifiedCandidates, config);

  return {
    config,
    discoveredLinks,
    candidates: selected
  };
}

function selectCandidates(candidates: DiscoveryCandidate[], config: DepthConfig) {
  const selected: DiscoveryCandidate[] = [];
  const usedUrls = new Set<string>();
  const availableSlots = config.maxPages - (config.includeHome ? 1 : 0);

  selectByType(candidates, selected, usedUrls, "plp", config.plpCount, availableSlots);
  selectByType(candidates, selected, usedUrls, "pdp", config.pdpCount, availableSlots);
  selectByType(candidates, selected, usedUrls, "search", config.searchCount, availableSlots);
  selectByType(candidates, selected, usedUrls, "campaign", config.campaignCount, availableSlots);

  return selected.slice(0, availableSlots);
}

function selectByType(
  candidates: DiscoveryCandidate[],
  selected: DiscoveryCandidate[],
  usedUrls: Set<string>,
  pageType: DiscoveryCandidate["pageType"],
  count: number,
  maxCount: number
) {
  if (count <= 0 || selected.length >= maxCount) {
    return;
  }

  const sorted = candidates
    .filter((candidate) => candidate.pageType === pageType && !usedUrls.has(candidate.link.normalizedUrl))
    .sort((left, right) => {
      const scoreDelta = right.classification.scores[pageType] - left.classification.scores[pageType];

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.link.normalizedUrl.length - right.link.normalizedUrl.length;
    });

  for (const candidate of sorted) {
    if (selected.length >= maxCount || selected.filter((item) => item.pageType === pageType).length >= count) {
      break;
    }

    selected.push(candidate);
    usedUrls.add(candidate.link.normalizedUrl);
  }
}
