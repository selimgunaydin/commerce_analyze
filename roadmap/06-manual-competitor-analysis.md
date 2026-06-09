# Faz 6 — Manual Competitor Analysis

AI Commerce Audit Platform projesinde sadece Faz 6'yı geliştir.

Bu fazda amaç, kullanıcı tarafından manuel girilen rakip URL’lerini analiz sürecine dahil etmektir.

Otomatik rakip araması bu fazda yapılmayacak.

## Yapılacaklar

1. Yeni audit formuna competitor URL textarea ekle.
2. Her satırı ayrı competitor URL olarak parse et.
3. URL validation kurallarını competitor URL’leri için de uygula.
4. Competitor modelini ekle.
5. CompetitorPage modelini ekle.
6. AuditProject ile competitor relation kur.
7. Manual competitor provider oluştur.
8. Rakip homepage crawl et.
9. Rakip homepage screenshot al.
10. Rakip homepage DOM verilerini çıkar.
11. Rakip homepage detector sonuçlarını üret.
12. Rakip homepage Lighthouse/accessibility sonuçlarını üret.
13. Audit detay ekranında rakipleri göster.
14. Rakip sayfa verilerini UI’da göster.

## Prisma schema

```prisma
model Competitor {
  id           String       @id @default(cuid())
  projectId    String
  project      AuditProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name         String?
  url          String
  normalizedUrl String
  confidence   Float        @default(1)
  reason       String?
  pages        CompetitorPage[]
  createdAt    DateTime     @default(now())
}

model CompetitorPage {
  id                   String     @id @default(cuid())
  competitorId          String
  competitor            Competitor @relation(fields: [competitorId], references: [id], onDelete: Cascade)
  url                  String
  pageType             String
  title                String?
  metaDescription      String?
  screenshotPath       String?
  mobileScreenshotPath String?
  domText              String?
  headings             Json?
  links                Json?
  buttons              Json?
  forms                Json?
  detectorResults      Json?
  lighthouse           Json?
  accessibility        Json?
  createdAt            DateTime   @default(now())
}
```

AuditProject modeline relation ekle:

```prisma
competitors Competitor[]
```

## Manual competitor input format

Textarea içinde kullanıcı şunu girebilir:

```txt
https://competitor1.com
https://competitor2.com
https://competitor3.com
```

Opsiyonel olarak şu formatı da destekleyebilirsin:

```txt
Brand A - https://brand-a.com
Brand B - https://brand-b.com
```

## Competitor provider abstraction

```ts
interface CompetitorDiscoveryProvider {
  discover(params: {
    projectUrl: string;
    brandName?: string;
    industry?: string;
    country?: string;
    manualCompetitors?: string[];
  }): Promise<CompetitorCandidate[]>;
}

type CompetitorCandidate = {
  name: string | null;
  url: string;
  reason: string;
  confidence: number;
};
```

Bu fazda sadece `ManualCompetitorProvider` implemente et.

## Worker davranışı

1. Müşteri site sayfalarını analiz et.
2. Competitor URL’leri parse et.
3. Her competitor için Competitor kaydı oluştur.
4. Her competitor homepage’ini crawl et.
5. Detector çalıştır.
6. Lighthouse/accessibility çalıştır.
7. CompetitorPage olarak kaydet.
8. Status’u `REPORT_READY` yap.

## Limitler

- MVP’de max 3 competitor URL kabul et.
- Competitor başına sadece homepage analiz et.
- Hata alan competitor job’u tamamen fail etmesin.
- Hata bilgisi saklansın.

## Bu fazda yapılmayacaklar

- Otomatik Google/rakip araması yok.
- AI comparison yok.
- Final AI rapor yok.
- Rakip PLP/PDP analizi yok.

## Başarı kriteri

Kullanıcı audit oluştururken 2-3 rakip URL girdiğinde sistem:

- Rakipleri DB’ye kaydetmeli.
- Rakip homepage’lerini crawl etmeli.
- Screenshot almalı.
- Detector + Lighthouse + accessibility sonuçlarını üretmeli.
- Audit detay ekranında rakip verilerini göstermelidir.
