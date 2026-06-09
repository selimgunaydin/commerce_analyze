# Faz 0 — Product Scope & Technical Boundaries

Sen senior product-minded full-stack AI engineer gibi davran.

Bu fazda kod yazma. Amaç, AI Commerce Audit Platform projesinin MVP kapsamını, teknik sınırlarını ve geliştirme stratejisini netleştirmek.

## Proje amacı

Biz bir e-ticaret sistem sağlayıcısıyız. Müşterilerimizin web sitelerini analiz edip, sitelerinde yapılabilecek frontend, UX, performans, SEO, conversion, accessibility ve rekabet bazlı geliştirme fırsatlarını bulmak istiyoruz.

Kullanıcı sisteme bir web sitesi URL’i girecek. Sistem bu siteyi inceleyecek, sektörünü tahmin edecek, rakiplerle kıyaslayacak ve müşteriye satılabilecek net geliştirme task’ları üretecek.

## MVP kapsamı

İlk MVP sadece e-ticaret sitelerine odaklanacak.

MVP’de analiz edilecek sayfalar:

- Homepage
- 1 adet PLP / kategori sayfası
- 1 adet PDP / ürün detay sayfası
- Kullanıcı tarafından manuel girilen rakip homepage sayfaları

## MVP dışında bırakılacaklar

Bu fazda aşağıdakiler kapsam dışıdır:

- Otomatik Google/rakip araması
- Checkout analizi
- Login/register analizi
- Auth gerektiren sayfalar
- PDF export
- Multi-tenant auth
- Historical comparison
- Otomatik teklif dosyası üretimi

## Temel teknik kararlar

Frontend:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui veya sade component yapısı

Backend:

- Next.js Route Handlers
- PostgreSQL
- Prisma ORM
- Redis
- BullMQ

Crawler:

- Playwright
- Chromium headless
- Desktop ve mobile viewport

Audit:

- Lighthouse
- axe-core/playwright
- Custom deterministic e-commerce detectors

AI:

- AI provider abstraction
- Zod schema validation
- Structured JSON output
- Retry / repair mekanizması

Storage:

- İlk etapta local filesystem
- İleride S3-compatible provider’a geçilebilir adapter yapısı

## Ana başarı kriteri

Sistem bir e-ticaret sitesine ve rakip URL’lerine bakıp şu tarz net işler üretebilmelidir:

- Mobil PDP sayfasına sticky add-to-cart ekle
- Homepage hero alanına kampanya ve kategori shortcut yapısı ekle
- PLP ürün kartlarında rating/discount/variant görünürlüğünü iyileştir
- PDP teslimat/iade/güven mesajlarını yukarı taşı
- Görsel optimizasyonu yap
- Lighthouse mobile performansını artır
- Eksik H1/meta/alt text sorunlarını düzelt

## Ürün çıktısı

Final rapor sadece yorum değil, task listesi üretmelidir.

Her task şu yapıda olmalıdır:

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

## Beklenen çıktı

Bu fazın sonunda kod yazmadan şu kararları dokümante et:

1. MVP kapsamı
2. MVP dışında bırakılanlar
3. Teknik mimari
4. Ana entity’ler
5. Analiz pipeline’ı
6. Fazlara bölünmüş geliştirme planı
7. Riskler
8. Sonraki faza geçiş kriterleri
