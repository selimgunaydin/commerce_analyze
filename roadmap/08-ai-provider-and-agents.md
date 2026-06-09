# Faz 8 — AI Provider & Core Agents

AI Commerce Audit Platform projesinde sadece Faz 8'i geliştir.

Bu fazda amaç, AI provider abstraction kurmak ve temel AI agent’ları structured output ile çalışır hale getirmektir.

AI çıktıları kesinlikle doğrudan kullanılmamalı. Zod schema ile validate edilmeli.

## Yapılacaklar

1. AI provider abstraction oluştur.
2. OpenAI-compatible provider implementasyonu yaz.
3. AI prompt dosyası oluştur.
4. AI schema dosyası oluştur.
5. Zod validation ekle.
6. Structured JSON output parsing ekle.
7. Retry mekanizması ekle.
8. Repair prompt mekanizması ekle.
9. Site Profiler Agent oluştur.
10. Page UX Analyzer Agent oluştur.
11. AI sonuçlarını AuditPage.aiAnalysis alanına yaz.
12. AuditProject için site profile sonucu sakla.

## Oluşturulacak dosyalar

```txt
src/lib/ai/provider.ts
src/lib/ai/prompts.ts
src/lib/ai/schemas.ts
src/lib/ai/json-repair.ts
src/lib/ai/agents/site-profiler-agent.ts
src/lib/ai/agents/page-ux-analyzer-agent.ts
```

## Prisma eklemeleri

AuditPage modeline ekle:

```prisma
aiAnalysis Json?
```

AuditProject modeline ekle:

```prisma
siteProfile Json?
```

## AI provider interface

```ts
interface AIProvider {
  generateJSON<T>(params: {
    system: string;
    prompt: string;
    schemaName: string;
    maxRetries?: number;
  }): Promise<T>;
}
```

## SiteProfile tipi

```ts
type SiteProfile = {
  brandName: string | null;
  likelyIndustry: string;
  ecommerceType:
    | "fashion"
    | "electronics"
    | "grocery"
    | "beauty"
    | "home_living"
    | "sports"
    | "marketplace"
    | "other";
  targetAudience: string;
  pricePositioning: "budget" | "mid" | "premium" | "luxury" | "unknown";
  mainProductCategories: string[];
  businessModel: "b2c" | "b2b" | "marketplace" | "unknown";
  confidence: number;
  reasoning: string[];
};
```

## PageUXAnalysis tipi

```ts
type PageUXAnalysis = {
  pageType: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  missedOpportunities: string[];
  detectedPatterns: string[];
  ecommerceFindings: {
    conversion: string[];
    trust: string[];
    navigation: string[];
    productDiscovery: string[];
    mobileExperience: string[];
    content: string[];
  };
  technicalFindings: {
    performance: string[];
    seo: string[];
    accessibility: string[];
    frontendQuality: string[];
  };
  priorityScore: number;
};
```

## AI prompt kuralları

Tüm agent prompt’larına şu kuralları ekle:

- Kanıt yoksa kesin konuşma.
- Detector sonuçlarını dikkate al.
- Lighthouse skorlarını dikkate al.
- Accessibility bulgularını dikkate al.
- Screenshot varsa screenshot summary bilgisini dikkate al.
- Genel tavsiye verme.
- E-ticaret bağlamında yorum yap.
- Emin değilsen confidence düşük tut.
- Output sadece JSON olmalı.
- Markdown yazma.
- Açıklama metni JSON dışına çıkarma.

## Site Profiler Agent input

Şu verileri kullan:

- URL
- brandName input
- industry input
- country input
- homepage title
- meta description
- visible text
- nav links
- headings
- detected categories
- homepage detector results

## Page UX Analyzer input

Şu verileri kullan:

- pageType
- title
- meta description
- visible text
- headings
- links
- buttons
- forms
- detectorResults
- lighthouse summary
- accessibility summary

## Worker davranışı

1. Site profiler agent’ı homepage üzerinden çalıştır.
2. Sonucu AuditProject.siteProfile alanına yaz.
3. Her AuditPage için Page UX Analyzer çalıştır.
4. Sonuçları AuditPage.aiAnalysis alanına yaz.
5. Status’u `REPORT_READY` yap.

## Bu fazda yapılmayacaklar

- Competitor comparison AI yok.
- Opportunity generator yok.
- Final report writer yok.
- PDF export yok.

## Başarı kriteri

Audit tamamlandığında:

- AuditProject.siteProfile dolmalı.
- Her AuditPage.aiAnalysis dolmalı.
- AI output Zod ile validate edilmeli.
- Bozuk JSON gelirse retry/repair denenmeli.
- Build alınabilir durumda olmalı.
