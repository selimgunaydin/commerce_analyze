# Faz 1 — Project Foundation

AI Commerce Audit Platform projesinde sadece Faz 1'i geliştir.

Bu fazda amaç, temel proje altyapısını kurmak ve audit oluşturma akışını çalışır hale getirmektir.

Bu fazda Playwright, Lighthouse, AI agent, crawler, screenshot veya rapor üretimi yapma.

## Kullanılacak stack

- Next.js App Router
- TypeScript strict
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ

## Yapılacaklar

1. Mevcut repo yapısını incele.
2. Repo boşsa Next.js App Router projesi oluştur.
3. TypeScript strict yapı kullan.
4. Tailwind CSS kur.
5. Prisma kurulumu yap.
6. PostgreSQL için `DATABASE_URL` env değişkenini kullan.
7. Redis için `REDIS_URL` env değişkenini kullan.
8. BullMQ queue setup oluştur.
9. Temel logger helper oluştur.
10. Environment config helper oluştur.
11. URL validation helper oluştur.
12. AuditProject modelini oluştur.
13. AuditStatus enumunu oluştur.
14. AuditDepth enumunu oluştur.
15. Audit oluşturma API route’unu yaz.
16. Audit listeleme API route’unu yaz.
17. Audit detay API route’unu yaz.
18. Audit başlatma route’unu yaz.
19. Dummy worker oluştur.
20. Dashboard layout oluştur.
21. `/audits` sayfasını oluştur.
22. `/audits/new` sayfasını oluştur.
23. `/audits/[id]` sayfasını oluştur.
24. `.env.example` oluştur.

## URL validation kuralları

Şu kuralları uygula:

- Sadece `http` ve `https` kabul et.
- `localhost` engelle.
- `127.0.0.1` engelle.
- `0.0.0.0` engelle.
- Private IP engelle.
- Link-local IP engelle.
- Internal network adreslerini engelle.
- URL normalize et.
- Final normalized URL’i DB’ye yaz.

## Prisma schema

Minimum şu modeli oluştur:

```prisma
model AuditProject {
  id            String      @id @default(cuid())
  url           String
  normalizedUrl String
  brandName     String?
  industry      String?
  country       String?
  depth         AuditDepth  @default(STANDARD)
  status        AuditStatus @default(QUEUED)
  errorMessage  String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}

enum AuditStatus {
  QUEUED
  CRAWLING
  AUDITING
  COMPETITOR_ANALYSIS
  AI_ANALYSIS
  REPORT_READY
  FAILED
}

enum AuditDepth {
  QUICK
  STANDARD
  DEEP
}
```

## API route’ları

```txt
POST /api/audits
GET /api/audits
GET /api/audits/[id]
POST /api/audits/[id]/start
```

## UI sayfaları

```txt
/audits
/audits/new
/audits/[id]
```

## Dummy worker davranışı

Audit başlatıldığında queue’ya job ekle.

Worker şimdilik gerçek analiz yapmasın. Sadece status’ları sırayla güncellesin:

1. QUEUED
2. CRAWLING
3. AUDITING
4. AI_ANALYSIS
5. REPORT_READY

Her status değişimi DB’ye yazılmalı.

## Bu fazda yapılmayacaklar

- Playwright kurulmayacak.
- Lighthouse kurulmayacak.
- AI entegrasyonu yapılmayacak.
- Screenshot alınmayacak.
- Rakip analizi yapılmayacak.
- Rapor üretilmeyecek.

## Başarı kriteri

Kullanıcı `/audits/new` sayfasından URL girip analiz başlatabilmeli.

Sistem:

- AuditProject oluşturmalı
- Queue’ya job atmalı
- Dummy worker çalışmalı
- Status değişimleri DB’de görünmeli
- `/audits/[id]` sayfasında status gösterilmeli
- Build alınabilir durumda olmalı
