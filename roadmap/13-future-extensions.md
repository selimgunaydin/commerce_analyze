# Faz 13 — Future Extensions

Bu faz MVP sonrası genişletme fazıdır.

Bu fazı hemen geliştirme. Önce önceki fazların production’a yakın çalıştığından emin ol.

## Amaç

AI Commerce Audit Platform’u SaaS ürün haline getirecek gelişmiş özellikleri planlamak.

## Potansiyel geliştirmeler

1. Otomatik rakip keşfi
2. PDF export
3. Multi-tenant auth
4. Organization/team sistemi
5. Historical comparison
6. Scheduled recurring audits
7. Website change detection
8. Jira/Linear task export
9. Notion/Slack integration
10. Proposal generator
11. Cost estimation engine
12. Screenshot visual diff
13. Design system compliance checker
14. GA4/GTM analytics audit
15. PDP/PLP deep crawl
16. Checkout flow audit
17. CMS-specific recommendations
18. Akinon/Shopify/Magento/WooCommerce platform detection
19. AI sales pitch generator
20. Benchmark database

## Otomatik rakip keşfi

Bunun için provider abstraction kullanılmalı:

```ts
interface CompetitorDiscoveryProvider {
  discover(params: {
    projectUrl: string;
    brandName?: string;
    industry?: string;
    country?: string;
  }): Promise<CompetitorCandidate[]>;
}
```

Provider alternatifleri:

- Search API provider
- SerpAPI provider
- Tavily provider
- Manual provider
- Internal benchmark provider

## PDF export

Rapor HTML’den PDF’e dönüştürülebilir.

Alternatifler:

- Playwright PDF
- React PDF
- Puppeteer PDF

## Multi-tenant yapı

Entity’lere şu alanlar eklenebilir:

- organizationId
- createdById
- assignedToId

## Scheduled audit

Recurring audit için:

- cron schedule
- previous report comparison
- score trend
- diff summary
- new opportunity detection

## Analytics audit

İleride GA4/GTM audit için:

- dataLayer event detection
- add_to_cart
- view_item
- begin_checkout
- purchase
- page_view
- custom event consistency
- duplicate event detection

## Platform detection

Şu platformlar tespit edilebilir:

- Shopify
- Magento
- WooCommerce
- Akinon
- Ticimax
- Ideasoft
- Custom Next.js
- Custom React SPA

## Başarı kriteri

Bu faz sadece roadmap olarak kalsın.

Önceki fazlar stabil olduktan sonra tek tek feature olarak açılmalıdır.
