# Faz 5 — Lighthouse & Accessibility Audit

AI Commerce Audit Platform projesinde sadece Faz 5'i geliştir.

Bu fazda amaç, crawled sayfalar için teknik performans, SEO, best practices ve accessibility verilerini toplamaktır.

## Yapılacaklar

1. Lighthouse runner servisi oluştur.
2. Lighthouse’u Node API veya CLI wrapper ile çalıştır.
3. Mobile Lighthouse audit çalıştır.
4. Desktop Lighthouse audit opsiyonel olarak destekle.
5. Lighthouse skorlarını normalize et.
6. Performance score kaydet.
7. SEO score kaydet.
8. Accessibility score kaydet.
9. Best practices score kaydet.
10. Önemli Lighthouse audit detaylarını kaydet.
11. axe-core/playwright accessibility runner oluştur.
12. Accessibility violation’ları kaydet.
13. Violation severity normalize et.
14. AuditPage modeline lighthouse ve accessibility alanlarını ekle.
15. UI’da teknik audit sonuçlarını göster.

## Oluşturulacak servisler

```txt
src/lib/audit/lighthouse-runner.ts
src/lib/audit/accessibility-runner.ts
src/lib/audit/technical-audit-normalizer.ts
```

## Prisma eklemesi

AuditPage modeline şu alanları ekle:

```prisma
lighthouse Json?
accessibility Json?
```

## Lighthouse output normalize tipi

```ts
type LighthouseSummary = {
  url: string;
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  metrics: {
    firstContentfulPaint?: number;
    largestContentfulPaint?: number;
    totalBlockingTime?: number;
    cumulativeLayoutShift?: number;
    speedIndex?: number;
  };
  opportunities: {
    id: string;
    title: string;
    description?: string;
    score?: number | null;
    numericValue?: number | null;
    displayValue?: string;
  }[];
  diagnostics: {
    id: string;
    title: string;
    displayValue?: string;
    score?: number | null;
  }[];
};
```

## Accessibility output tipi

```ts
type AccessibilitySummary = {
  violations: {
    id: string;
    impact: "minor" | "moderate" | "serious" | "critical" | null;
    description: string;
    help: string;
    nodes: {
      target: string[];
      html?: string;
      failureSummary?: string;
    }[];
  }[];
  violationCount: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
};
```

## Worker davranışı

Her AuditPage için:

1. Lighthouse audit çalıştır.
2. Accessibility audit çalıştır.
3. Sonuçları normalize et.
4. DB’ye yaz.
5. Teknik hata olursa tüm job fail olmasın.
6. Partial result mantığını koru.

## Timeout kuralları

- Lighthouse timeout env’den gelmeli.
- Crawler timeout’tan ayrı olmalı.
- Timeout olursa AuditPage üzerinde hata bilgisi saklanmalı.
- Tüm job fail edilmeden devam edilebilmeli.

## Bu fazda yapılmayacaklar

- AI yok.
- Rakip analizi yok.
- Final rapor yok.
- Otomatik task üretimi yok.

## Başarı kriteri

Her crawled page için mümkünse:

- Lighthouse skorları
- Lighthouse fırsatları
- Accessibility violation listesi

DB’ye yazılmalı ve UI’da görüntülenmelidir.
