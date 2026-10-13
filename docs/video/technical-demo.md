# Teknik demo — çekim planı arşivi

**Submitted and finalized · 13 October 2026 · Ready for judging.** [Final video](https://youtu.be/OZ5R2g6rRJo) — **2:48**. [Tamamlanan teslim](../submission/README.md).

Bu belge orijinal İngilizce seslendirme ve Türkçe çekim yönergelerinin arşividir. Aşağıdaki sahne süreleri planlama hedefidir; son videonun zaman damgaları veya bekleyen görevler değildir. Kayıt, yükleme ve nihai Submit tamamlandı.

**Buğra için:** İngilizce seslendirme; yalnızca `>` paragrafları okunur. Türkçe satırlar çekim yönergesidir. Temiz okuma dosyası: [technical-voiceover.txt](technical-voiceover.txt). Dokuz sahne, kurgu hedefi **2:55**, panel üst sınırı **3:00**. Süre hedefi gerçek sesli prova ve son videoyla ölçülmelidir; sahne geçişlerini konuşma hızına göre ayarla.

İngilizce ürün ekranlarını kullan. Ekran ve sesi ayrı kaydedebilirsin. Beklemeleri kesmek mümkündür; kesmeleri işlem/finality hızı diye sunma. Yeni testnet işlemi gerekmiyor. Bu sürüm PR #19 sonrası canlı ürün ve 13 Ekim'de başarılı üretim watchlist testiyle eşleşir.

## 00:00–00:12 · Somut soru

**Ekran:** [Console](https://kaskad42.vercel.app/app), `Tuesday depeg`, `External price`, `Preview ready`.

**Ekran etiketi:** Recorded Aave snapshot · Monad testnet simulation

> When collateral falls, can liquidators actually clear the debt? Kaskad simulates liquidation waves, collateral sales and price impact on Monad, using recorded Aave borrower books.

## 00:12–00:39 · Ücretsiz −%3 önizlemesi

**Ekran:** `Tuesday depeg` → `External price`: **$0 bad debt / $111.0M stuck**. Ardından `Cascade, block by block` → `Replay`: **$133.9K liquidated**. İmza düğmesine basma.

**Ekran etiketi:** Modeled outcome · not current losses

> Here, a three-percent syrup USDC depeg triggers a free contract preview. Liquidators repay about one hundred thirty-four thousand dollars before further sales become unprofitable. About one hundred eleven million dollars of debt remains in positions below the liquidation threshold. That is debt the model cannot clear profitably, not current losses.

## 00:39–00:58 · −%10 ve gizli borç

**Ekran:** `Quick shocks` → `−10%`; oracle aynı kalsın. Yeni sonuç: **$17.7K bad debt / +$8.8M hidden / $96.8M stuck**. “Eighteen thousand”, $17.7K'nın yuvarlatılmış hâlidir.

**Ekran etiketi:** Oracle valuation → simulated pool valuation

> At a ten-percent shock, oracle-valued bad debt reaches about eighteen thousand dollars. Valuing remaining collateral at the simulated pool price reveals another eight point eight million dollars of hidden shortfall. The valuation assumption matters.

## 00:58–01:13 · Nansen: kim risk altında?

**Ekran:** Aynı syrupUSDC defterinde `Deeper analysis` → `Who is exposed`. Adresler, maruziyet tutarları ve etiketsiz kategori görünür olsun. Bilinen syrupUSDC önbelleği kullanılır; çekim için başka defterlerde toplu Nansen sorgusu başlatma. Kontrol edilen Monad adreslerinde public label yok; sahibi belliymiş gibi anlatma.

**Ekran etiketi:** Snapshot borrower exposure · public labels when available

> Who is exposed links simulated risk to snapshot borrowers. Server-side Nansen labels add public context when available. Unlabeled addresses stay unidentified; the interface never invents an owner.

## 01:13–01:27 · Risk haritası ve Monte Carlo

**Ekran:** Önceden yüklenmiş [ana sayfa](https://kaskad42.vercel.app/) → `02 THE RISK MAP` (6 sn). Konsolda `Deeper analysis` → `Monte Carlo`, **30 yol**, ortalama/P95/en kötü değerler (8 sn). Harita hücrelerinin konsolda otomatik senaryo seçtiğini varsayma.

> The risk map compares borrower books across five shocks. Monte Carlo explores different price paths, showing a distribution of outcomes rather than one answer.

## 01:27–01:54 · RiskOracle → GuardV2 → vault + CRE

**Ekran:** [Guard](https://kaskad42.vercel.app/guard) → **RiskOracle → GuardV2 → vault**, ardından son 6 sn **4 Ekim CRE işlem kanıtı**. Eski üst Guard örneğiyle karıştırma. `Report stale` görünür kalsın; publish/refresh/rebalance yapma.

**Ekran etiketi:** Stored demo state · demo assets / Recorded CRE broadcast simulation · 4 Oct 2026 · mock forwarder

> RiskOracle turns stress results into bounded lending recommendations. GuardV2 pauses flagged demo markets, and the demo vault reallocates tokens. Chainlink CRE coordinates this pipeline. Our recorded proof uses a CLI broadcast simulation through a mock forwarder on Monad testnet. These are stored demo states, not a continuously deployed production workflow.

## 01:54–02:16 · Perpl: protokol ve cüzdan

**Ekran:** [Perps](https://kaskad42.vercel.app/perps) → BTC `Liquidation map` ve `Price moves` (11 sn); önceden sorgulanmış **Wallet risk on Perpl** → pozisyonlar ve şok tablosu (11 sn). [Ayrıntılı akış](perpl-demo.md). Canlı fiyat/pozisyon sayısını metne sabitleme.

**Ekran etiketi:** Live Monad mainnet reads · modeled stress

> Perpl adds live Monad mainnet analysis. The protocol view compares liquidation demand with order-book depth and backstop capacity. A public wallet lookup reveals positions, liquidation distances and shock exposure without signing. Wallet amounts measure notional crossing thresholds, not predicted losses.

## 02:16–02:32 · Tarihsel replay

**Ekran:** [10 Oct replay](https://kaskad42.vercel.app/replay) → `Kaskad against Aave` ve `Where they differ, and why`. Ham karşılaştırma **$48.3M model / $26.9M gerçekleşen**; sonradan ayarlanmış sonucu önceden tahmin başarısı gibi sunma.

**Ekran etiketi:** 10 Oct 2025 · retrospective analysis · later liquidity assumption

> The historical replay compares our model with observed Aave liquidations during the October twenty twenty-five ETH drawdown. It exposes assumptions, including liquidity measured later. This is retrospective analysis.

## 02:32–02:55 · Mera, doğrulanmış watchlist ve kapanış

**Ekran:** [Wallet](https://kaskad42.vercel.app/wallet) → aynı passkey ile tekrar giriş sonrası kayıtlı etiket ve **%7** eşik (12 sn); 10.000 pozisyon kayıtlı kanıtı (6 sn); ürün URL'si (5 sn). Yeniden açılma klibini daha önce kaydet: örnek adresi kaydet, eşiği 7 yap, tam sayfa yenile, cihaz doğrulamasını kullanıcı tamamlasın, dönen satırı göster. Cihaz penceresini/özel bilgileri kayda alma. Yeni zincir işlemi yok.

**Ekran etiketi:** Encrypted watchlist · reopened with the same passkey / Recorded 10,000-position benchmark · Monad testnet

> Previews need no login. Mera passkeys support signing and decrypt a private watchlist. The saved address and alert threshold return after signing in again. Our recorded benchmark processes ten thousand positions in one transaction. Open Kaskad and inspect the assumptions and proofs.

## Kanıt bağlantıları

- CRE, **4 Ekim 2026 kaydı**: [cron işlemi](https://testnet.monadscan.com/tx/0x07161a3ab2b540af3e1177e40161027893e800a9551df37bb019f8e38f89c5b5) · [çalıştırma logu](https://github.com/mryavascann/kaskad/blob/main/cre/runs/01-cron-stale-broadcast.log).
- [10.000 pozisyon benchmark işlemi](https://testnet.monadscan.com/tx/0x661facb56395f553be94399d004f0ca75834cc2f5037f54d37adff832d6d185c). Blitz dönemindeki motor ölçümü; 17.7M engine gas ile 21.7M receipt gas farklıdır. Ses metninde gas rakamı kullanılmaz.
- [syrupUSDC −%3 external oracle kayıtlı işlem](https://testnet.monadscan.com/tx/0xc80dfd34835edcba1028b76945f4793598cf3b27bee470e79cffdd75b8a53a99).
- [Kod, model sınırları ve diğer kanıtlar](https://github.com/mryavascann/kaskad).

## Arşiv: kayıt günü kontrol notları

- **−%3 → −%10**, her ikisinde **External price**. Yeni sonuç hazır olmadan rakam okunmaz.
- Nansen ve watchlist akışları 13 Ekim'de üretimde doğrulandı. Nansen'de etiketsiz adresi tanınan bir kurum gibi sunma; yeni sorgular krediye bağlıdır. Watchlist'in başarılı testi videonun kendisi değildir, gerçek yeniden açılma klibini kaydet.
- Watchlist örneği, herkese açık syrupUSDC borçlusu: `0x815f5BB257e88b67216a344C7C83a3eA4EE74748`. Kullanıcının testindeki etiket `Kaskad doğrulama · 13 Ekim`, eşik %7. Bu adresi takımın cüzdanı olarak sunma. Buğra kendi passkey'iyle girerse kendi listesini oluşturmalıdır.
- Perpl'de başarılı güncel okuma görünmeli; hata/eski veri sahnesini canlı diye kaydetme. Örnek hesabın pozisyonu kapanmışsa kayıttan önce başka doğrulanmış public örnek seç.
- RiskOracle raporları stale; ana metin kayıtlı durumu anlatır. Ayrı CRE videosunda yeni **broadcast yapılmayan** başarılı CLI simülasyonu gösterilir. Sürekli keeper tamamlanmış özellik değildir.
- Prova uzarsa kapanıştaki “Our recorded benchmark processes ten thousand positions in one transaction.” cümlesini ve benchmark klibini çıkar; yaklaşık 5 saniye kazanılır. Ağ, model ve kayıtlı durum açıklamaları kalsın.
- Explorer açılmazsa [How it works](https://kaskad42.vercel.app/how-it-works) kanıt tablosu kullanılabilir; eski işlemi yeniymiş gibi gösterme.
- Bu dosya üretim planı arşividir. Son video yayımlandı ve nihai başvuru tamamlandı; bağlantı ve süre üstte kayıtlıdır.
