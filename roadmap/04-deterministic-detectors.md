# Faz 4 — Deterministic E-commerce Detectors

AI Commerce Audit Platform projesinde sadece Faz 4'ü geliştir.

Mevcut crawled AuditPage verileri üzerine deterministic e-commerce detector engine ekle.

Bu fazda amaç, AI kullanmadan DOM/text/link/button/form verilerine bakarak e-ticaret UX ve teknik pattern’larını tespit etmektir.

## Yapılacaklar

1. `src/lib/audit/ecommerce-detectors.ts` oluştur.
2. DetectorResult tipini oluştur.
3. Homepage detector’ları yaz.
4. PLP detector’ları yaz.
5. PDP detector’ları yaz.
6. Technical detector’ları yaz.
7. Detector sonuçlarını AuditPage.detectorResults alanına yaz.
8. Her detector için confidence score üret.
9. Her detector için evidence üret.
10. Her detector için severity belirle.
11. `/audits/[id]` ekranında detector sonuçlarını göster.

## Prisma eklemesi

AuditPage modeline şu alanı ekle:

```prisma
detectorResults Json?
```

## DetectorResult tipi

```ts
type DetectorResult = {
  key: string;
  label: string;
  passed: boolean;
  confidence: number;
  severity: "info" | "low" | "medium" | "high";
  evidence: string[];
};
```

## Homepage detectors

Şu kontrolleri yap:

- Hero section var mı?
- H1 var mı?
- CTA button var mı?
- Kampanya/promosyon metni var mı?
- Kategori shortcut’ları var mı?
- Search input görünür mü?
- Trust badge var mı?
- Header navigation var mı?
- Mobile menu sinyali var mı?
- Footer linkleri var mı?

## PLP detectors

Şu kontrolleri yap:

- Product grid var mı?
- Product card sinyali var mı?
- Price text’i var mı?
- Discount badge var mı?
- Filter var mı?
- Sort var mı?
- Rating/review var mı?
- Color/size variant gösterimi var mı?
- Pagination veya infinite scroll sinyali var mı?
- Breadcrumb var mı?
- Empty state var mı?

## PDP detectors

Şu kontrolleri yap:

- Product title var mı?
- Price var mı?
- Discount price var mı?
- Add to cart button var mı?
- Variant selector var mı?
- Size guide var mı?
- Stock info var mı?
- Shipping/return info var mı?
- Product description var mı?
- Image gallery var mı?
- Review/rating var mı?
- Related products var mı?
- Sticky add to cart sinyali var mı?

## Technical detectors

Şu kontrolleri yap:

- Missing H1
- Multiple H1
- Missing meta description
- Images without alt
- Buttons without accessible name
- Links without text
- Console errors
- Failed network requests
- Excessive DOM text size
- External script count sinyali
- Form input label eksikleri

## Detector implementation kuralları

- AI kullanılmayacak.
- Heuristic kurallar yazılacak.
- DOM text, headings, links, buttons ve forms üzerinden çalışacak.
- Mümkünse selector/evidence text dönecek.
- Boolean tespitlerde confidence düşükse bunu belirt.
- Detector engine pageType’a göre doğru detector setini çalıştırmalı.

## Örnek output

```json
[
  {
    "key": "homepage_has_h1",
    "label": "Homepage has H1",
    "passed": true,
    "confidence": 0.95,
    "severity": "medium",
    "evidence": ["H1: Yeni Sezon Ürünleri"]
  },
  {
    "key": "pdp_has_size_guide",
    "label": "PDP has size guide",
    "passed": false,
    "confidence": 0.8,
    "severity": "medium",
    "evidence": []
  }
]
```

## Worker davranışı

1. Sayfaları crawl et.
2. Her AuditPage için detector engine çalıştır.
3. Sonuçları DB’ye yaz.
4. Status’u `REPORT_READY` yap.

## Bu fazda yapılmayacaklar

- AI yok.
- Lighthouse yok.
- Accessibility audit yok.
- Rakip analizi yok.
- Final rapor yok.

## Başarı kriteri

Her crawled page için deterministic detector sonuçları üretilmeli ve UI’da görüntülenmelidir.
