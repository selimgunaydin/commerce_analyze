# Faz 11 — Final Report Writer & Report UI

AI Commerce Audit Platform projesinde sadece Faz 11'i geliştir.

Bu fazda amaç, tüm analiz çıktılarını tek bir okunabilir rapor haline getirmek ve report UI oluşturmaktır.

## Yapılacaklar

1. Report Writer Agent oluştur.
2. FinalAuditReport Zod schema oluştur.
3. Executive summary üret.
4. Site profile section oluştur.
5. Scorecard section oluştur.
6. Competitor summary section oluştur.
7. Top findings üret.
8. Opportunities section oluştur.
9. Quick wins section oluştur.
10. Strategic projects section oluştur.
11. Technical appendix oluştur.
12. Markdown report üret.
13. JSON report DB’ye yaz.
14. `/audits/[id]/report` sayfasını oluştur.
15. Report ready ise `/audits/[id]` sayfasından rapora link ver.

## Oluşturulacak dosya

```txt
src/lib/ai/agents/report-writer-agent.ts
src/lib/report/report-builder.ts
src/components/report/*
```

## FinalAuditReport tipi

```ts
type FinalAuditReport = {
  executiveSummary: string;
  siteProfile: SiteProfile;
  scorecard: {
    ux: number;
    performance: number;
    seo: number;
    accessibility: number;
    conversion: number;
    competitorPositioning: number;
    overall: number;
  };
  topFindings: string[];
  competitorSummary: string;
  opportunities: AuditOpportunity[];
  quickWins: AuditOpportunity[];
  strategicProjects: AuditOpportunity[];
  technicalAppendix: {
    lighthouse: unknown;
    accessibility: unknown;
    crawledPages: string[];
    screenshots: string[];
  };
};
```

## Report sections

Report UI şu bölümlerden oluşmalı:

1. Executive Summary
2. Site Profile
3. Scorecard
4. Top Findings
5. Competitor Summary
6. Homepage Findings
7. PLP Findings
8. PDP Findings
9. Technical Audit
10. SEO Audit
11. Accessibility Audit
12. Conversion Opportunities
13. Quick Wins
14. Strategic Projects
15. Full Task List
16. Evidence Screenshots
17. Technical Appendix

## AuditReport Prisma modeli

```prisma
model AuditReport {
  id                String       @id @default(cuid())
  projectId          String
  project            AuditProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  title             String
  executiveSummary  String?
  scorecard         Json?
  content           Json?
  markdown          String?
  createdAt         DateTime     @default(now())
}
```

## Report writer prompt kuralları

- Rapor profesyonel ama net olmalı.
- Boş danışmanlık dili kullanma.
- Evidence olmayan iddia kurma.
- Müşteriye satılabilir işlere odaklan.
- Rakip kıyasını açıkça yaz.
- Teknik bulguları sadeleştir.
- Opportunity listesi korunmalı.
- AI yeni opportunity uydurmamalı; mevcut opportunity’leri düzenleyebilir ama evidence dışına çıkmamalı.
- Output JSON olmalı.

## Markdown export

Markdown çıktısı şu başlıklarla üretilmeli:

```md
# AI Commerce Audit Report

## Executive Summary

## Scorecard

## Top Findings

## Competitor Summary

## Quick Wins

## Strategic Projects

## Full Opportunity List

## Technical Appendix
```

## UI beklentisi

`/audits/[id]/report` sayfası:

- Üstte overall score
- Scorecard kartları
- Executive summary
- Top findings
- Rakip gap’leri
- Opportunity card listesi
- Quick wins
- Strategic projects
- Screenshot evidence
- Technical appendix
- Markdown copy/download butonu

## Bu fazda yapılmayacaklar

- PDF export yok.
- Otomatik rakip keşfi yok.
- Multi-tenant auth yok.

## Başarı kriteri

Audit tamamlandığında:

- FinalAuditReport JSON üretilmeli.
- AuditReport DB’ye yazılmalı.
- Markdown report oluşmalı.
- `/audits/[id]/report` sayfasında rapor görüntülenmeli.
