# 💜 Mani — Gelir Gider Takibi

Sade ve şık bir kişisel harcama/gelir takip uygulaması. **Tamamen ücretsiz**, sunucu gerektirmez — tüm verilerin yalnızca senin telefonunda saklanır.

Bir **PWA** (Progressive Web App) olarak çalışır: tarayıcıda açıp "Ana ekrana ekle" deyince gerçek bir uygulama gibi (tam ekran, ikonlu, internetsiz çalışan) kurulur.

---

## ✨ Neler yapabilir?

**Temel:**
- **Harcama & gelir ekle:** tutar, kategori, *nereden* (işletme/kişi), *ne aldın* (ürün), tarih-saat, etiketler, fiş fotoğrafı, not.
- **🧾 Çok kalemli harcama:** tek bir gidere birden çok ürün ekle; her biri için **miktar + birim** (5 adet, 3 kg, 1 lt...) ve tutar gir → toplam otomatik hesaplanır. Bu kalemler **Fiyatlar** bölümünü de otomatik besler.
- **🏷️ Fiyatlar bölümü (ayrı ekran):** sadece fiyat takibi için. "1 kg domates şu tarihte şu fiyat" diye kaydet; her ürünün **birim fiyat geçmişini** (en düşük/yüksek/ortalama + artış-azalış) gör. Giderlere eklediğin kalemler de burada görünür.
- **Özet ekranı:** toplam bakiye + bu ayki gelir/gider + bütçe uyarıları + hızlı ekle kısayolları + son işlemler.
- **İşlemler:** güne göre gruplanmış liste; arama (ürün/yer/etiket), gelir-gider filtresi ve **tarih aralığı** (bu ay, geçen ay, 7/30 gün).
- **Açık / Koyu / Sistem teması**, **çoklu para birimi** (₺, $, €, £…).

**Akıllı:**
- **🎯 Bütçeler:** kategori başına aylık limit koy; limite yaklaşınca/aşınca uyarı al.
- **🔁 Tekrarlayan işlemler:** kira, maaş, abonelik gibi düzenli kayıtlar otomatik eklenir (günlük/haftalık/aylık).
- **💳 Taksitli işlemler:** 1000₺'lik alışverişi 5 taksit seç → her ayın aynı gününe 200₺ olarak otomatik bölünür (`💳 2/5` rozetiyle). Silerken tüm planı ya da tek taksidi seçebilirsin.
- **⚡ Hızlı ekle:** sık yaptığın harcamalar özet ekranında tek dokunuşla hazır.
- **🏷️ Otomatik öneri:** daha önce girdiğin işletme/ürün adları yazarken önerilir.

**Analiz:**
- Aylık gelir/gider/net + **geçen aya göre değişim** (%).
- **📈 Ay sonu gider tahmini** (mevcut harcama hızına göre).
- Günlük harcama grafiği, kategori dağılımı, **en çok harcadığın yerler**.
- **Kişisel enflasyon:** tekrar aldığın ürünlerin fiyat artış ortalaması.
- **Ürün fiyat geçmişi:** "döner" yaz → ne zaman, nereden, kaça aldığını + en düşük/yüksek/ortalama + artış/azalış okları.

**Güvenlik & gelişmiş (v3):**
- **🔒 Uygulama kilidi:** açılışta 4 haneli PIN; destekleyen cihazlarda **parmak izi / yüz** ile açma. Arka plandan 20 sn sonra dönünce tekrar kilitlenir.
- **💳 Cüzdanlar / hesaplar:** Nakit / Kart / Banka (özelleştirilebilir) ayrı bakiyeler + aralarında **transfer**.
- **💱 Gerçek kur çevirme:** farklı para birimindeki işlemler güncel kura göre ana birime çevrilir (kurlar çevrimiçiyken otomatik güncellenir, çevrimdışı son kuru kullanır).
- **🎯 Tasarruf hedefleri:** hedef koy, para ekle/çıkar, ilerlemeni gör.
- **📅 Takvim görünümü:** ayın hangi günü ne harcadığını gör, güne dokun → o günün işlemleri.
- **📆 Yıllık özet:** Analiz'de Ay/Yıl modu; 12 aylık gelir-gider grafiği.
- **🔔 Bildirimler:** bütçe aşımı ve yaklaşan tekrarlayan ödemeler için (günde bir, uygulamayı açtığında).
- **🧾 PDF rapor:** aylık/yıllık özeti yazdır veya "PDF olarak kaydet".

**Veri:**
- **Yedek al / geri yükle** (JSON) ve **CSV dışa aktarma** (Excel/Sheets).
- **Kategori yönetimi:** kendi kategorilerini emoji ile ekle/sil.

> Not: Kilit (PIN/biyometrik), bildirimler ve kur çevirme yalnızca **https** üzerinden (Netlify/GitHub Pages gibi) çalışır — dosyayı `file://` ile açınca bu üçü devre dışı kalır. Diğer her şey her durumda çalışır.

---

## 📲 Telefona kurmak (en kolay yol: Netlify Drop)

> PWA'ların telefona kurulabilmesi ve internetsiz çalışabilmesi için `https` üzerinden yayınlanması gerekir. Aşağıdaki yöntemlerin hepsi **ücretsiz**.

### Yöntem 1 — Netlify Drop (hesap gerekmeden, ~1 dakika)
1. Bilgisayarda <https://app.netlify.com/drop> adresini aç.
2. Bu `Mani` klasörünü olduğu gibi sürükleyip bırak.
3. Sana `https://...netlify.app` gibi bir adres verir.
4. Bu adresi telefonunda **Chrome** ile aç → sağ üstteki **⋮** menüsü → **Uygulamayı yükle** / **Ana ekrana ekle**.
5. Artık ana ekranında "Mani" ikonu olarak duruyor. 🎉

> Not: Hesapsız yükleme geçicidir. Kalıcı olması için ücretsiz Netlify hesabı açıp aynı klasörü oraya bağlaman yeterli (yine bedava).

### Yöntem 2 — GitHub Pages (kalıcı, ücretsiz)
1. GitHub'da yeni bir repo aç, bu klasördeki tüm dosyaları yükle.
2. Repo → **Settings → Pages → Branch: main / root → Save**.
3. Birkaç dakika içinde `https://kullaniciadi.github.io/repo-adi/` adresi hazır olur.
4. Telefonda Chrome ile aç → **Ana ekrana ekle**.

### Yöntem 3 — Vercel
1. <https://vercel.com> → ücretsiz hesap → "Add New Project" → klasörü yükle/repo bağla → Deploy.

---

## 📦 Gerçek APK üretmek (ücretsiz, isteğe bağlı)

PWA'yı yukarıdaki gibi yayınladıktan sonra, onu **kurulabilen bir `.apk` dosyasına** çevirebilirsin — kodu değiştirmeden, bedavaya:

1. Önce uygulamayı bir adrese yayınla (Netlify/GitHub Pages — yukarıdaki adımlar).
2. <https://www.pwabuilder.com> adresine git (Microsoft'un ücretsiz aracı).
3. Yayınladığın `https://...` adresini yapıştır → **Start**.
4. **Android** kartında **Generate Package** → **Download** de.
5. İnen zip içindeki **`.apk`** dosyasını telefonuna at ve kur.
   - Telefonda *Ayarlar → "Bilinmeyen kaynaklardan yükleme"ye izin ver* demen gerekebilir.

> İstersen aynı paketi Google Play'e de yükleyebilirsin (tek seferlik 25$ geliştirici ücreti gerekir — sadece sen/arkadaşların kullanacağı için **gerek yok**, APK'yı doğrudan kurmak yeterli).

**Özetle:** PWA = anında, sıfır araç. APK = "gerçek uygulama" hissi, yine ücretsiz, PWABuilder ile tek tık. İkisi de aynı koddan çıkıyor.

---

## 💻 Bilgisayarda test etmek

PWA özelliklerinin (service worker, kurulum) çalışması için dosyayı çift tıklayıp `file://` ile açmak **yeterli değildir** — küçük bir yerel sunucu gerekir:

```powershell
# Python varsa:
python -m http.server 8080

# veya Node varsa:
npx serve .
```

Sonra tarayıcıda <http://localhost:8080> aç. Telefonla aynı Wi-Fi'daysan `http://<bilgisayar-ip>:8080` ile telefondan da deneyebilirsin (kurulum için yine de https/Netlify önerilir).

---

## 🔒 Verilerim nerede?

Her şey telefonunun tarayıcı deposunda (**IndexedDB**) tutulur. Hiçbir sunucuya gitmez.
- Avantaj: tamamen ücretsiz ve gizli.
- Dikkat: tarayıcı verisini temizlersen ya da telefon değişirse veri gider → **düzenli olarak Ayarlar → Yedek al** demeyi unutma.

Arkadaşların da kullanacaksa: herkes kendi telefonuna kurar, herkesin verisi kendinde ayrı durur.

---

## 🗂️ Dosya yapısı

```
Mani/
├── index.html              # uygulama kabuğu
├── manifest.webmanifest    # PWA tanımı (isim, ikon, renk)
├── sw.js                   # service worker (offline)
├── css/styles.css          # tasarım sistemi
├── js/db.js                # veri katmanı (IndexedDB)
├── js/app.js               # uygulama mantığı / ekranlar
└── icons/                  # uygulama ikonları (SVG)
```
