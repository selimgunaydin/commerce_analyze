# Entysa E-Commerce Audit Stratejisi

## Amaç

Entysa E-Commerce Audit, ajansın müşteri e-ticaret sitelerini kanıtlı şekilde analiz edip uygulanabilir iş paketlerine dönüştürmesi için tasarlanır. Sistem yalnızca "rapor üretmek" için değil, satış görüşmesi, ürün önceliklendirme ve developer backlog'unu aynı kanıt seti üzerinde hizalamak için çalışmalıdır.

## Ana Kullanıcılar

- Ajans stratejisti: müşteriye sunulacak hikayeyi, teklif paketlerini ve öncelik sırasını belirler.
- Ürün yöneticisi: bulguları müşteri yolculuğu, iş etkisi ve kabul kriteriyle okur.
- Developer: görevleri net kapsam, kanıt, ekran görüntüsü ve teknik not ile alır.
- Satış ekibi: hızlı kazanımları giriş paketi, stratejik işleri retainer veya roadmap fırsatı olarak konumlandırır.

## Ürün İlkeleri

- Her tespit kanıta bağlı olmalı: URL, sayfa tipi, detector sonucu, ekran görüntüsü veya teknik metrik olmadan kritik iddia üretilmemeli.
- Aynı metin, aynı madde ve aynı fırsat tekrar etmemeli. Fırsatlar başlık, kategori, sayfa tipi ve öneri metnine göre tekilleştirilmeli.
- Detector sonucu kararsızsa kesin konuşulmamalı. Örneğin wishlist, footer linki veya mobil menü varsa sistem bunu yok saymamalı; emin değilse "kanıt zayıf" demeli.
- Rapor müşteriye okunabilir, panele ise operasyona uygun olmalı. Rapor ikna eder, audit ekranı işi üretime taşır.
- Her fırsat developer ve PM için ayrı ayrı kullanılabilir olmalı: uygulanacak iş, kabul kriteri, müşteri etkisi, tahmini efor ve beklenen etki aynı kartta yer almalı.

## Hedef İş Akışı

1. Ajans kullanıcısı tek kullanıcı login ile panele girer.
2. Müşteri sitesi ve varsa rakipler eklenir.
3. Sistem tüm sayfayı yeterli derinlikte crawl eder, desktop ve mobil ekran görüntüsü alır.
4. Detector, Lighthouse, erişilebilirlik ve AI analizleri aynı kanıt modeline bağlanır.
5. Audit detay ekranı ajans fırsat panosunu ve üretim backlog'unu gösterir.
6. Report ekranı müşteriye sunulacak özet, skor kartı, görev listesi, best practice ve ekran görüntüsü kanıtını verir.
7. Ajans satış ekibi hızlı kazanım sprinti veya stratejik paket teklifi çıkarır.

## Mevcut İyileştirme Yönleri

- Audit detay sayfası veri çekme, UI ve yorumlama mantığından ayrıldı. Bundan sonra route dosyaları ince kalmalı.
- Report sayfası bölümlere ayrıldı: hero, skor kartı, site profili, rakip özeti, müşteri içgörüsü, roadmap, görev listesi, ekran görüntüsü ve teknik ek.
- Ortak UI parçaları `audit-kit` altında toplandı. Yeni audit/report bileşenleri aynı kart, skor, badge, liste ve uyarı dilini kullanmalı.
- Fırsatlar ajans paketlerine çevriliyor: Conversion Sprint, UX Discovery Fix Pack, Trust & Retention Pack ve Technical Hygiene Pack.

## Sonraki Profesyonel Adımlar

- Kanıt modeli güçlendirilmeli: her detector sonucu DOM selector, bounding box veya screenshot crop referansı taşımalı.
- Screenshot anotasyonu eklenmeli: görev kartı problemli alanı kırpılmış görsel veya işaretlenmiş odak alanıyla göstermeli.
- Crawl kapsamı görünür olmalı: footer, mobil menü, PDP, PLP ve arama gibi kritik alanların hangi sayfalarda doğrulandığı panelde açıkça listelenmeli.
- Teklif üretimi eklenmeli: seçilen fırsatlardan paket, tahmini süre, kapsam dışı işler ve fiyat aralığı taslak olarak üretilebilmeli.
- Müşteri CRM akışı eklenmeli: audit sahibi, lead durumu, son görüşme notu, teklif durumu ve takip tarihi tutulmalı.
- Rapor kalite kapısı eklenmeli: İngilizce kalan metin, tekrar eden madde, kanıtsız iddia ve çelişkili tespit yayına çıkmadan yakalanmalı.
- Role göre görünüm planlanmalı: ajans içi panel detaylı, müşteri paylaşım linki daha sade ve sunuma hazır olmalı.
