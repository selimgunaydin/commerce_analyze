export interface CompetitorDiscoveryProvider {
  discover(params: {
    projectUrl: string;
    brandName?: string | null;
    industry?: string | null;
    country?: string | null;
    manualCompetitors?: string[];
  }): Promise<CompetitorCandidate[]>;
}

export type CompetitorCandidate = {
  name: string | null;
  url: string;
  reason: string;
  confidence: number;
};
