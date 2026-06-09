# Faz 2 — Browser Crawler & Screenshot Engine

AI Commerce Audit Platform projesinde sadece Faz 2'yi geliştir.

Mevcut Faz 1 altyapısına dokunmadan Playwright tabanlı browser crawler ve screenshot engine ekle.

Bu fazda amaç, verilen URL’in homepage’ini gerçek browser ile açmak, desktop/mobile screenshot almak ve temel DOM verilerini DB’ye kaydetmektir.

## Bu fazda yapılacaklar

1. Playwright kurulumu ekle.
2. Chromium headless çalışacak şekilde browser manager yaz.
3. Browser context manager oluştur.
4. Her job sonunda browser context kapatılmalı.
5. Desktop viewport desteği ekle.
6. Mobile viewport desteği ekle.
7. Full-page desktop screenshot al.
8. Full-page mobile screenshot al.
9. Screenshot dosyalarını local storage’a kaydet.
10. Storage provider abstraction oluştur.
11. Local storage provider oluştur.
12. Page extractor servisi oluştur.
13. Sayfa title çıkar.
14. Meta description çıkar.
15. Visible text çıkar.
16. H1/H2/H3 heading’leri çıkar.
17. Linkleri çıkar.
18. Button’ları çıkar.
19. Form alanlarını çıkar.
20. Console error’ları topla.
21. Failed network request’leri topla.
22. Redirect sonrası final URL’i tekrar validate et.
23. Crawler timeout ekle.
24. Max text length truncate et.
25. AuditPage modelini Prisma schema’ya ekle.
26. Homepage için AuditPage kaydı oluştur.
27. `/audits/[id]` sayfasında crawled page bilgilerini göster.
28. Screenshot preview göster.

## Oluşturulacak servisler

```txt
src/lib/audit/browser-manager.ts
src/lib/audit/crawler.ts
src/lib/audit/page-extractor.ts
src/lib/audit/screenshot-service.ts
src/lib/storage/storage-provider.ts
src/lib/storage/local-storage-provider.ts
```

## Prisma schema eklemesi

```prisma
model AuditPage {
  id                   String       @id @default(cuid())
  projectId            String
  project              AuditProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
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
  consoleErrors        Json?
  failedRequests       Json?
  createdAt            DateTime     @default(now())
}
```

AuditProject modeline relation ekle:

```prisma
pages AuditPage[]
```

## Page extractor output tipi

```ts
type ExtractedPageData = {
  url: string;
  finalUrl: string;
  title: string | null;
  metaDescription: string | null;
  visibleText: string;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  links: {
    text: string;
    href: string;
  }[];
  buttons: {
    text: string;
    type?: string;
    ariaLabel?: string;
  }[];
  forms: {
    action?: string;
    method?: string;
    fields: {
      name?: string;
      type?: string;
      placeholder?: string;
      label?: string;
    }[];
  }[];
  consoleErrors: string[];
  failedRequests: {
    url: string;
    status?: number;
    errorText?: string;
  }[];
};
```

## Storage provider beklentisi

```ts
interface StorageProvider {
  saveBuffer(params: {
    buffer: Buffer;
    path: string;
    contentType: string;
  }): Promise<{
    path: string;
    url?: string;
  }>;
}
```

## Worker davranışı

Dummy worker artık gerçek homepage crawl yapmalı.

Akış:

1. AuditProject oku.
2. Status’u `CRAWLING` yap.
3. Homepage’i Playwright ile aç.
4. Desktop screenshot al.
5. Mobile screenshot al.
6. DOM verilerini çıkar.
7. AuditPage olarak DB’ye yaz.
8. Status’u `REPORT_READY` yap.

## Bu fazda yapılmayacaklar

- Lighthouse yok.
- Accessibility audit yok.
- AI agent yok.
- Rakip analizi yok.
- Rapor üretimi yok.
- PLP/PDP keşfi yok.

## Başarı kriteri

Bir audit başlatıldığında:

- Homepage açılmalı.
- Desktop screenshot alınmalı.
- Mobile screenshot alınmalı.
- DOM verileri çıkarılmalı.
- AuditPage DB’ye kaydedilmeli.
- Screenshot ve extracted data UI’da görülebilmeli.
- Build alınabilir durumda olmalı.
