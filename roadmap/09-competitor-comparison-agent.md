# Faz 9 — Competitor Comparison Agent

AI Commerce Audit Platform projesinde sadece Faz 9'u geliştir.

Bu fazda amaç, müşteri sitesi ile manuel girilen rakip homepage verilerini karşılaştıran AI agent geliştirmektir.

## Yapılacaklar

1. Competitor Comparison Agent oluştur.
2. Customer homepage analysis verilerini input olarak kullan.
3. Competitor homepage detector sonuçlarını input olarak kullan.
4. Competitor lighthouse/accessibility sonuçlarını input olarak kullan.
5. Customer vs competitor gap listesi üret.
6. Gaps içinde net öneri üret.
7. Sonucu AuditReport.content veya AuditProject üzerinde sakla.
8. UI’da competitor comparison section göster.

## Oluşturulacak dosya

```txt
src/lib/ai/agents/competitor-comparison-agent.ts
```

## CompetitorComparison tipi

```ts
type CompetitorComparison = {
  summary: string;
  customerAdvantages: string[];
  competitorAdvantages: string[];
  gaps: {
    area: string;
    customerCurrentState: string;
    competitorObservation: string;
    recommendation: string;
    impact: "low" | "medium" | "high";
    evidence: string[];
  }[];
};
```

## Agent input

Şu verileri kullan:

- Customer site profile
- Customer homepage detector results
- Customer homepage AI analysis
- Customer homepage Lighthouse summary
- Customer homepage accessibility summary
- Customer scorecard
- Competitor list
- Her competitor için:
  - URL
  - title
  - meta description
  - homepage detector results
  - Lighthouse summary
  - accessibility summary
  - visible text summary
  - AI page analysis varsa onu da kullan

## AI prompt kuralları

- Sadece verilen evidence’a dayan.
- Rakipte olup müşteride olmayan pattern’ları tespit et.
- “Rakip daha iyi” gibi boş cümleler kurma.
- Hangi alanda daha iyi olduğunu açıkça söyle.
- Her gap için müşteri sitesindeki mevcut durumu yaz.
- Her gap için rakip gözlemini yaz.
- Her gap için uygulanabilir öneri üret.
- Evidence olmadan iddia kurma.
- Output sadece JSON olmalı.

## Örnek gap

```json
{
  "area": "Homepage category discovery",
  "customerCurrentState": "Müşteri homepage detector sonuçlarında kategori shortcut alanı bulunamadı.",
  "competitorObservation": "2 rakip homepage üzerinde hero altında kategori shortcut / collection linkleri bulundu.",
  "recommendation": "Mobil ve desktop homepage üzerinde hero altına 6-8 adet kategori shortcut alanı eklenmeli.",
  "impact": "high",
  "evidence": [
    "Customer detector: homepage_has_category_shortcuts=false",
    "Competitor A detector: homepage_has_category_shortcuts=true",
    "Competitor B detector: homepage_has_category_shortcuts=true"
  ]
}
```

## Bu fazda yapılmayacaklar

- Opportunity task generation yok.
- Final report writer yok.
- Otomatik rakip keşfi yok.
- PDF export yok.

## Başarı kriteri

Audit sonunda rakipler girilmişse sistem:

- Customer vs competitor comparison üretmeli.
- Gap listesi oluşturmalı.
- Evidence ile desteklemeli.
- UI’da comparison section göstermelidir.
