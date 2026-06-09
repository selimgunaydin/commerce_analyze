import { validateAndNormalizeUrl } from "@/src/lib/utils/url-validation";
import { normalizeUrlForDiscovery } from "@/src/lib/utils/url-normalizer";
import type { CompetitorCandidate, CompetitorDiscoveryProvider } from "./competitor-provider";

export const MAX_MANUAL_COMPETITORS = 3;

export class ManualCompetitorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualCompetitorInputError";
  }
}

export class ManualCompetitorProvider implements CompetitorDiscoveryProvider {
  async discover(params: Parameters<CompetitorDiscoveryProvider["discover"]>[0]): Promise<CompetitorCandidate[]> {
    const lines = (params.manualCompetitors ?? []).map((line) => line.trim()).filter(Boolean);
    const candidates: CompetitorCandidate[] = [];
    const usedUrls = new Set<string>();
    const normalizedProjectUrl = (await validateAndNormalizeUrl(params.projectUrl)).normalizedUrl;

    for (const line of lines) {
      if (candidates.length >= MAX_MANUAL_COMPETITORS) {
        break;
      }

      const parsed = parseManualCompetitorLine(line);

      if (!parsed) {
        throw new ManualCompetitorInputError(`Invalid competitor URL line: ${line}`);
      }

      const validated = await validateAndNormalizeUrl(parsed.url);
      const normalizedUrl = normalizeUrlForDiscovery(validated.normalizedUrl, validated.normalizedUrl) ?? validated.normalizedUrl;

      if (normalizedUrl === normalizedProjectUrl || usedUrls.has(normalizedUrl)) {
        continue;
      }

      usedUrls.add(normalizedUrl);
      candidates.push({
        name: parsed.name,
        url: normalizedUrl,
        reason: "Manual competitor input",
        confidence: 1
      });
    }

    return candidates;
  }
}

export function parseManualCompetitorInput(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseManualCompetitorLine(line: string) {
  const urlMatch = line.match(/https?:\/\/\S+/i);

  if (!urlMatch) {
    return null;
  }

  const url = urlMatch[0].replace(/[),.;]+$/, "");
  const rawName = line.slice(0, urlMatch.index).trim().replace(/[-–—:|]+$/, "").trim();

  return {
    name: rawName || null,
    url
  };
}
