# Faz 10 — Opportunity Generator Agent

AI Commerce Audit Platform projesinde sadece Faz 10'u geliştir.

Bu faz projenin en kritik fazıdır.

Amaç, analiz sonuçlarından müşteriye satılabilecek net geliştirme task’ları üretmektir.

Genel tavsiye üretme. Her çıktı uygulanabilir task formatında olmalı.

## Yapılacaklar

1. Opportunity Generator Agent oluştur.
2. AuditOpportunity Zod schema oluştur.
3. AI output validation ekle.
4. Opportunity modelini Prisma schema’ya ekle.
5. Üretilen opportunity’leri DB’ye yaz.
6. Quick wins ve strategic projects ayrımı yap.
7. Opportunity list UI oluştur.
8. Priority, effort, impact ve complexity göster.
9. Acceptance criteria göster.
10. Evidence göster.

## Oluşturulacak dosya

```txt
src/lib/ai/agents/opportunity-generator-agent.ts
```

## Prisma model

```prisma
model Opportunity {
  id                         String       @id @default(cuid())
  projectId                  String
  project                    AuditProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  title                      String
  description                String
  category                   String
  priority                   String
  estimatedEffort            String
  expectedImpact             String
  implementationComplexity   String
  evidence                   Json
  affectedPages              Json
  acceptanceCriteria         Json
  relatedCompetitorExamples  Json?
  suggestedImplementation    String?
  createdAt                  DateTime     @default(now())
}
```

AuditProject relation:

```prisma
opportunities Opportunity[]
```

## AuditOpportunity tipi

```ts
type AuditOpportunity = {
  title: string;
  description: string;
  evidence: string[];
  affectedPages: string[];
  category:
    | "ux"
    | "ui"
    | "performance"
    | "seo"
    | "accessibility"
    | "conversion"
    | "frontend"
    | "analytics"
    | "content"
    | "merchandising";
  priority: "low" | "medium" | "high" | "critical";
  estimatedEffort: "half_day" | "1_day" | "2_3_days" | "1_week" | "2_weeks_plus";
  expectedImpact: "low" | "medium" | "high";
  implementationComplexity: "low" | "medium" | "high";
  suggestedImplementation: string;
  acceptanceCriteria: string[];
  relatedCompetitorExamples: string[];
};
```

## Agent input

Şu verileri kullan:

- Site profile
- Scorecard
- Customer page analyses
- Detector results
- Lighthouse summaries
- Accessibility findings
- Competitor comparison gaps
- Customer vs competitor differences

## Opportunity üretim kuralları

- Her öneri task formatında olmalı.
- “UX iyileştirilmeli” gibi genel cümle yasak.
- Her task bir geliştirici/tasarımcı tarafından uygulanabilir olmalı.
- Her task için acceptance criteria zorunlu.
- Her task için evidence zorunlu.
- Priority ticari etkiye göre belirlenmeli.
- Effort gerçekçi tahmin edilmeli.
- Rakip evidence varsa eklenmeli.
- Detector veya Lighthouse evidence yoksa kesin konuşma.
- En az 5, en fazla 15 opportunity üret.
- Tekrarlı opportunity üretme.
- Benzer işleri grupla.

## Quick win ayrımı

Quick win kriterleri:

- estimatedEffort: half_day veya 1_day
- expectedImpact: medium veya high
- implementationComplexity: low veya medium

## Strategic project ayrımı

Strategic project kriterleri:

- estimatedEffort: 1_week veya 2_weeks_plus
- expectedImpact: high
- implementationComplexity: medium veya high

## Örnek opportunity

```json
{
  "title": "Mobil PDP sayfasına sticky add-to-cart ekle",
  "description": "Mobil ürün detay sayfasında sepete ekle butonu scroll sırasında görünürlüğünü kaybediyor. Bu durum satın alma niyetindeki kullanıcı için friction yaratabilir.",
  "evidence": [
    "PDP detector: sticky_add_to_cart=false",
    "PDP detector: add_to_cart=true",
    "Competitor A detector: sticky_add_to_cart=true"
  ],
  "affectedPages": ["pdp"],
  "category": "conversion",
  "priority": "high",
  "estimatedEffort": "2_3_days",
  "expectedImpact": "high",
  "implementationComplexity": "medium",
  "suggestedImplementation": "Mobil viewport'ta kullanıcı ürün görseli veya ana CTA alanını geçtikten sonra bottom sticky add-to-cart bar gösterilmeli.",
  "acceptanceCriteria": [
    "Mobilde scroll sonrası bottom sticky add-to-cart görünmeli.",
    "Varyant seçimi yapılmadıysa CTA disabled olmalı.",
    "Seçili ürün fiyatı sticky bar üzerinde görünmeli.",
    "add_to_cart event'i mevcut analytics yapısına uygun tetiklenmeli."
  ],
  "relatedCompetitorExamples": [
    "Competitor A homepage/PDP detector result shows sticky add to cart."
  ]
}
```

## Worker davranışı

1. Page UX analysis tamamlanmış olmalı.
2. Competitor comparison varsa onu kullan.
3. Opportunity Generator Agent çalıştır.
4. Opportunity’leri validate et.
5. DB’ye yaz.
6. Quick wins ve strategic projects için sınıflandırma yap.

## Bu fazda yapılmayacaklar

- Final report writer yok.
- PDF export yok.
- Otomatik teklif üretimi yok.

## Başarı kriteri

Audit sonunda sistem 5-15 arası uygulanabilir opportunity üretmeli.

Her opportunity:

- Evidence içermeli.
- Priority içermeli.
- Effort içermeli.
- Acceptance criteria içermeli.
- UI’da görüntülenmelidir.
