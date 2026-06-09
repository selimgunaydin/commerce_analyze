# Faz 3 — Page Discovery & Page Classification

AI Commerce Audit Platform projesinde sadece Faz 3'ü geliştir.

Mevcut crawler üzerine page discovery ve page classification ekle.

Bu fazda amaç, homepage içinden internal linkleri keşfetmek, e-ticaret için önemli sayfa tiplerini bulmak ve sınırlı sayıda ek sayfayı crawl etmektir.

## Yapılacaklar

1. Internal link discovery servisi yaz.
2. Homepage’den çıkan linkleri normalize et.
3. Duplicate URL’leri temizle.
4. External domainleri dışla.
5. Hash fragment’ları temizle.
6. Gereksiz query parametrelerini normalize et.
7. Page classifier servisi yaz.
8. PLP candidate scoring yap.
9. PDP candidate scoring yap.
10. Search page detection yap.
11. Campaign/landing page detection yap.
12. Audit depth’e göre max page count belirle.
13. Worker’ı homepage dışındaki sayfaları crawl edecek şekilde güncelle.
14. Her keşfedilen sayfayı AuditPage olarak kaydet.
15. `/audits/[id]` ekranında pageType bazlı liste göster.

## Oluşturulacak servisler

```txt
src/lib/audit/link-discovery.ts
src/lib/audit/page-classifier.ts
src/lib/audit/page-discovery.ts
src/lib/utils/url-normalizer.ts
```

## Page type tipi

```ts
type PageType =
  | "home"
  | "plp"
  | "pdp"
  | "search"
  | "campaign"
  | "content"
  | "unknown";
```

## Audit depth davranışı

```ts
const depthConfig = {
  QUICK: {
    maxPages: 1,
    includeHome: true,
    plpCount: 0,
    pdpCount: 0,
    searchCount: 0,
    campaignCount: 0
  },
  STANDARD: {
    maxPages: 3,
    includeHome: true,
    plpCount: 1,
    pdpCount: 1,
    searchCount: 0,
    campaignCount: 0
  },
  DEEP: {
    maxPages: 10,
    includeHome: true,
    plpCount: 3,
    pdpCount: 3,
    searchCount: 1,
    campaignCount: 2
  }
};
```

## PLP scoring sinyalleri

URL veya link text içinde şu kelimeler varsa skor artır:

- category
- categories
- kategori
- koleksiyon
- collection
- collections
- c
- products
- urunler
- ürünler
- shop
- list

Sayfa içeriğinde şu sinyaller varsa skor artır:

- Ürün grid yapısı
- Çoklu fiyat text’i
- Filter text’i
- Sort text’i
- Product card benzeri tekrar eden elementler

## PDP scoring sinyalleri

URL veya link text içinde şu kelimeler varsa skor artır:

- product
- products
- urun
- ürün
- p
- item
- detail

Sayfa içeriğinde şu sinyaller varsa skor artır:

- Add to cart button
- Sepete ekle text’i
- Price
- Product title
- Variant selector
- Size selector
- Image gallery

## Search page detection

Şu sinyalleri kullan:

- URL içinde search, arama, q=
- Search input
- Arama sonuçları text’i

## Campaign page detection

Şu sinyalleri kullan:

- URL içinde campaign, kampanya, indirim, sale, outlet
- Campaign banner text
- Landing page pattern

## Worker davranışı

Standard depth için:

1. Homepage crawl et.
2. Homepage links çıkar.
3. PLP candidate bul.
4. PDP candidate bul.
5. PLP ve PDP sayfalarını crawl et.
6. AuditPage kayıtlarını oluştur.
7. Status’u `REPORT_READY` yap.

## Bu fazda yapılmayacaklar

- AI yok.
- Lighthouse yok.
- Accessibility yok.
- Rakip analizi yok.
- Final rapor yok.

## Başarı kriteri

Standard depth ile audit başlatıldığında sistem mümkünse:

- home
- 1 PLP
- 1 PDP

sayfasını crawl edip DB’ye kaydetmelidir.

Her sayfada `pageType` doğru şekilde atanmalıdır.
