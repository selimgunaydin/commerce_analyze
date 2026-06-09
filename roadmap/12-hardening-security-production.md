# Faz 12 — Hardening, Security & Production Readiness

AI Commerce Audit Platform projesinde sadece Faz 12'yi geliştir.

Bu fazda amaç sistemi production’a yaklaşacak şekilde güvenli, stabil ve sürdürülebilir hale getirmektir.

## Yapılacaklar

1. SSRF korumasını güçlendir.
2. Redirect sonrası URL validation tekrarını garanti et.
3. Private IP detection güçlendir.
4. DNS resolve sonrası private IP kontrolü ekle.
5. Rate limiting ekle.
6. Max crawl page limitlerini garanti et.
7. Max competitor limitlerini garanti et.
8. Timeout handling iyileştir.
9. Job retry stratejisi ekle.
10. Partial failure handling ekle.
11. Browser cleanup garanti et.
12. Worker idempotency iyileştir.
13. Audit tekrar çalıştırma desteği ekle.
14. Error loglarını yapılandır.
15. Structured logger ekle.
16. Environment validation ekle.
17. Storage cleanup helper ekle.
18. Screenshot dosya boyutu limitleri ekle.
19. AI token limitleri için input truncation iyileştir.
20. AI cost guard ekle.
21. Admin-only internal endpointleri koru.
22. Basic tests ekle.
23. README güncelle.
24. Deployment notları ekle.

## SSRF güvenliği

Şu kontroller kesin olmalı:

- Protocol sadece http/https
- localhost engelli
- 127.0.0.1 engelli
- 0.0.0.0 engelli
- Private IPv4 engelli
- Private IPv6 engelli
- Link-local IP engelli
- Metadata IP engelli
- Internal domain engelli
- DNS resolve sonrası IP kontrolü
- Redirect sonrası tekrar validation
- Max redirect limit

## Engellenecek IP aralıkları

- 10.0.0.0/8
- 172.16.0.0/12
- 192.168.0.0/16
- 127.0.0.0/8
- 169.254.0.0/16
- ::1
- fc00::/7
- fe80::/10
- 169.254.169.254

## Rate limiting

Şunlara rate limit ekle:

- POST /api/audits
- POST /api/audits/[id]/start

MVP’de basit IP bazlı in-memory veya Redis bazlı rate limit olabilir.

## Job retry

BullMQ retry stratejisi:

- max attempts: 2 veya 3
- exponential backoff
- failed status DB’ye yazılmalı
- errorMessage saklanmalı

## Partial failure

Şu durumlarda tüm audit fail olmamalı:

- Bir competitor açılamazsa
- Lighthouse timeout olursa
- Accessibility scan hata verirse
- PLP/PDP bulunamazsa
- AI page analysis bir sayfada fail olursa

Ancak şu durumlarda audit fail olabilir:

- Ana URL geçersizse
- Homepage hiç açılamıyorsa
- DB erişilemiyorsa
- Queue fatal hata alıyorsa

## AI guardrails

- DOM text truncate edilmeli.
- Link/button/form listeleri limitlenmeli.
- Lighthouse diagnostics limitlenmeli.
- Accessibility nodes limitlenmeli.
- AI response validate edilmeli.
- Retry sayısı limitli olmalı.
- AI error olursa partial report üretilmeli.

## Tests

Minimum test yaz:

- URL validation
- URL normalization
- Page classifier
- Detector engine
- Scoring engine
- Opportunity schema validation

## README içeriği

README’de şunlar olmalı:

- Proje amacı
- Kurulum
- Env değişkenleri
- Prisma migrate
- Redis başlatma
- Worker başlatma
- Playwright install
- Audit çalıştırma
- Faz kapsamı
- Bilinen limitler
- Güvenlik notları

## Bu fazda yapılmayacaklar

- Yeni büyük feature ekleme.
- Otomatik rakip keşfi ekleme.
- PDF export ekleme.
- Multi-tenant auth ekleme.

## Başarı kriteri

Sistem:

- Güvenli URL validation yapmalı.
- Job fail durumlarını düzgün yönetmeli.
- Browser kaynaklarını temizlemeli.
- Partial failure ile rapor üretmeye devam etmeli.
- Temel testleri geçmeli.
- README ile kurulabilir olmalı.
