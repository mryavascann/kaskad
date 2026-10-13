# Perpl Risk Tool — çekim planı arşivi

**Submitted and finalized · 13 October 2026 · Ready for judging.** [Final video](https://youtu.be/styCT_l5ayU) — **1:45**. [Tamamlanan teslim](../submission/README.md).

Bu belge orijinal İngilizce seslendirme ve Türkçe çekim yönergelerinin arşividir. Aşağıdaki sahne süreleri planlama hedefidir; son videonun zaman damgaları veya bekleyen görevler değildir. Kayıt, yükleme ve nihai Submit tamamlandı.

Panel sınırı 2:00. İngilizce seslendirme; yalnızca `>` ile başlayan paragraflar okunur. [Sadece okunacak metin](perpl-voiceover.txt) ayrı dosyada. Aşağıdaki süreler orijinal kurgu hedefidir; ölçülmüş son video süresi üstte kayıtlıdır.

Protokol ve cüzdan görünümleri [PR #14](https://github.com/mryavascann/kaskad/pull/14) sonrası canlı. Bu akış iki görünümü de kapsar; son video kaydedildi, yüklendi ve tamamlanan başvuruya eklendi.

## Kayıt öncesi hazırlık

1. İngilizce [Perps sayfasını](https://kaskad42.vercel.app/perps) aç. BTC verisi yüklensin; `Read … ago` güncel olsun. Aynı sayfanın [cüzdan bölümünü](https://kaskad42.vercel.app/perps#perpl-wallet-title) ikinci sekmede hazır tut.
2. Cüzdan örneği olarak aşağıdaki herkese açık adresi `Wallet address` alanına yapıştırıp **Check wallet** düğmesine bas. Bu adres takımın cüzdanı olarak tanıtılmayacak. `Account #6`, güncel `Last successful read` ve en az bir pozisyon görünmesini doğrula.

   ```text
   0xf91b2eCb1cD59A36F3AED20B46943a75dB08795b
   ```

3. 7 Ekim provasında bu hesapta BTC long pozisyonu vardı ve ±%20'ye kadar bütün şok satırları sıfırdı. Sıfır sonuç kullanılabilir: yalnızca gösterilen şokların o andaki likidasyon eşiğini geçmediğini gösterir. Hesabın gelecekte de aynı kalacağını veya risksiz olduğunu söyleme. Pozisyon kapanırsa kayıt öncesinde başka doğrulanmış, herkese açık Perpl hesabı seç; olmayan veriyi doldurma.
4. Yedi sahneyi ayrı klipler halinde çek; her klibe başta/sonda 2 saniye kurgu payı bırak. Aşağıdaki süreler bu paylar kesildikten sonraki akıştır. Mikrofon sesini kısa bir denemeyle dinle; ekran ve ses ayrı alınabilir.
5. Son videoda uygulamanın kendi blok/zaman etiketleri görünsün. Başlıktaki genel ağ göstergesi testnet'e aittir; Perpl verisinin kaynağını `Monad mainnet block` satırıyla anlat. Protokol ve cüzdan okumalarının aynı blokta olduğunu iddia etme.

## 00:00–00:15 · Canlı kaynak

**Ekran:** BTC seçili; `Read … ago`, blok, mark/spot ve açık pozisyon bilgisi. Alt etiket: **Live Monad mainnet reads · modeled stress outcomes**.

> This is Kaskad's Perpl risk dashboard. It reads positions from contracts on Monad mainnet and depth from Perpl's public order book. The displayed block and read time identify the data.

## 00:15–00:30 · Likidasyon yoğunlaşması

**Ekran:** `Liquidation map`; önce long, sonra short bantları. Gerekirse `Data table` ile aynı gerçek değerleri göster.

> The liquidation map groups notional into one-percent price bands. Long liquidations sit below the mark, shorts above it. We can see where liquidation demand concentrates before comparing it with available depth.

## 00:30–00:50 · Emir defteri ve backstop

**Ekran:** `What catches them` → `Price moves`. −%20 satırını soldan sağa takip et: `Notional` → `Absorbed by the book` → `To the backstop` → `Beyond collateral` → `Insurance fund after`. O anki sonucu değiştirmeden göster; sıfır değeri kriz olarak anlatma.

> The stress table separates liquidated notional, book absorption, backstop demand and deficits beyond collateral. The final column shows modeled insurance remaining. It assumes a five-percent execution band, frozen funding and no book refill. These assumptions shape the results.

## 00:50–01:02 · Piyasayı değiştir

**Ekran:** Market → `ETH`. Yeni `Read … ago`, piyasa adı ve yenilenen harita görünsün. Yüklemeyi kısaltmak için kurgu kesmesi yapılabilir; bunu veri okuma hızı ölçümü gibi sunma.

> Switching to ETH loads that market's positions and depth. Visible views refresh every ten seconds, with their read times displayed.

## 01:02–01:24 · Cüzdanın pozisyonları

**Ekran:** `Wallet risk on Perpl` → örnek adres → `Check wallet` → `Account #6`, `Monad mainnet block`, `Last successful read`. Ardından `This wallet's positions` tablosunda `Equity`, `Liquidation price` ve `Adverse move to liquidation`. Adresi tek tek yazmak yerine yapıştır. Kullanılabilir hesap bakiyesi pozisyon özkaynağından ayrı; sıfır kullanılabilir bakiye “teminat yok” demek değildir.

> Now I enter a public wallet address, without connecting or signing. Its account and positions are read at one mainnet block. We can inspect position equity, notional, liquidation prices and the adverse move needed to reach each threshold.

## 01:24–01:42 · Cüzdanın şok maruziyeti

**Ekran:** `Wallet exposure under a price move`. −5/10/20 ve +5/10/20 satırları; `Positions crossing` ve `Notional crossing`. Cüzdan bölümü altı desteklenen piyasadaki pozisyonları kapsar; üstte ETH seçmek cüzdanı yalnızca ETH'ye filtrelemez. Kapsam dışı piyasa uyarısı çıkarsa kadrajda tut ve toplamları tam portföy gibi sunma.

> Wallet shocks apply the same price move across supported markets. The table counts positions crossing liquidation thresholds and their current notional. Those amounts are exposure, not predicted losses or guaranteed liquidation fills.

## 01:42–01:55 · Sınır ve kapanış

**Ekran:** Tablonun altındaki varsayım metni; kapanışta **kaskad42.vercel.app/perps**. Arayüzü küçültüp bütün sayfayı tek kareye sığdırma; metrikler okunur kalsın.

> Each position uses its own collateral; free balance is not added to margin. This gives protocol reviewers and wallet users a shared, inspectable view of risk.

## Arşiv: kurgu kontrol notları

- Son kurgu 1:55 hedefinde ve mutlaka 2:00 altında olmalı. Prova uzarsa ETH geçişini kısalt; cüzdanın pozisyon ve şok tablolarını, ağ/kapsam açıklamalarını koru.
- Görünen fiyatlar ve pozisyonlar gerçek kayıt anına ait olsun. Eski ekran görüntüsünü canlı sorgu gibi kullanma. `Refresh failed` uyarısı veya eski okuma varsa yeni başarılı veriyi bekle.
- Cüzdan şok toplamlarını protokolün backstop/insurance hesaplarıyla karıştırma. Cüzdan tablosu ayrı bir likidasyon-eşiği hesabıdır, cüzdana tahsis edilmiş backstop payı değildir.
- Dosya adı önerisi: `kaskad-perpl-risk-en.mp4`. Oynatma, ses, son kare ve toplam süre kontrolünden sonra yükleme bağlantısı hazırlanır.

Kaynaklar: [protokol modeli](../../web/lib/chain/perpl-model.ts), [cüzdan modeli](../../web/lib/chain/perpl-wallet-risk.ts), [cüzdan okuyucusu](../../web/lib/kaskad/perpl-wallet.ts), [İngilizce arayüz metinleri](../../web/i18n/messages/perpl-wallet.ts). 7 Ekim canlı provasında İngilizce hesap/pozisyon/şok bölümü ve BTC → ETH geçişi kontrol edildi; bu bir ses veya video kaydı değildir.
