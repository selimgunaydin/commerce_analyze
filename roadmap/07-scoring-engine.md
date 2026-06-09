# Faz 7 — Scoring Engine

AI Commerce Audit Platform projesinde sadece Faz 7'yi geliştir.

Bu fazda amaç, AI kullanmadan deterministic verilerden 0-100 arası skorlar üretmektir.

Skorlar daha sonra AI raporlarında kullanılacaktır. Bu nedenle skorlar rastgele veya tamamen AI yorumuna bağlı olmamalıdır.

## Yapılacaklar

1. Scoring engine servisi oluştur.
2. Page-level skor hesapla.
3. Project-level skor hesapla.
4. UX score hesapla.
5. Performance score hesapla.
6. SEO score hesapla.
7. Accessibility score hesapla.
8. Conversion score hesapla.
9. Competitor positioning score hesapla.
10. Overall score hesapla.
11. Scorecard’ı AuditReport veya ayrı bir JSON alanında sakla.
12. Audit detay ekranında scorecard göster.

## Oluşturulacak servis

```txt
src/lib/audit/scoring.ts
```

## Scorecard tipi

```ts
type AuditScorecard = {
  ux: number;
  performance: number;
  seo: number;
  accessibility: number;
  conversion: number;
  competitorPositioning: number;
  overall: number;
};
```

## Overall ağırlıkları

```ts
const weights = {
  ux: 0.2,
  conversion: 0.25,
  performance: 0.15,
  seo: 0.15,
  accessibility: 0.1,
  competitorPositioning: 0.15
};
```

## Performance score

Lighthouse performance skoruna dayanmalı.

Eğer Lighthouse yoksa:

- Failed request count
- Console error count
- Large DOM/text size
- Technical detector sonuçları

ile fallback score üret.

## SEO score

Şu sinyalleri kullan:

- Lighthouse SEO score
- H1 var mı?
- Multiple H1 var mı?
- Meta description var mı?
- Link text kalitesi
- Image alt eksikleri
- Heading yapısı

## Accessibility score

Şu sinyalleri kullan:

- Lighthouse accessibility score
- axe violation count
- critical violation count
- serious violation count
- button accessible name eksikleri
- form label eksikleri
- image alt eksikleri

## UX score

Şu sinyalleri kullan:

- Homepage hero var mı?
- CTA var mı?
- Navigation var mı?
- Search görünür mü?
- Kategori shortcut var mı?
- PLP filter/sort var mı?
- PDP product title/price/add to cart var mı?
- Trust/shipping/return mesajları var mı?

## Conversion score

Şu sinyalleri kullan:

- CTA visibility
- PDP add to cart
- Sticky add to cart
- Variant selector
- Size guide
- Stock info
- Shipping/return info
- Rating/review
- Related products
- Product discovery signals

## Competitor positioning score

Şu sinyalleri kullan:

- Customer detector passed ratio
- Competitor detector passed ratio
- Rakiplerde olup müşteride olmayan pattern sayısı
- Performance farkı
- SEO farkı
- Accessibility farkı

Eğer competitor yoksa neutral score 50 ver.

## Prisma

AuditReport modeli yoksa ekle:

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

AuditProject modeline relation ekle:

```prisma
reports AuditReport[]
```

## Bu fazda yapılmayacaklar

- AI yok.
- Final rapor yazımı yok.
- Opportunity generation yok.
- Otomatik rakip keşfi yok.

## Başarı kriteri

Audit tamamlandığında deterministic verilerden scorecard üretilmeli.

UI’da şu skorlar gösterilmeli:

- UX
- Performance
- SEO
- Accessibility
- Conversion
- Competitor Positioning
- Overall
