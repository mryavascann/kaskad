# ▼ Kaskad

**"Bu varlık %3 düşerse Aave'de ne olur?" sorusunu, gerçek pozisyonlar üzerinde, zincirde ve tek bir işlemde cevaplayan likidasyon kaskadı simülatörü.**

**[Canlı demo](https://kaskad42.vercel.app)** · **Video:** _eklenecek_ · Monad Blitz İstanbul, 26 Eylül 2026

---

## 30 saniyede

Lending protokollerinin "ne kadar risk alabiliriz?" kararlarını bugün zincir dışındaki risk firmaları veriyor. Aave bunun için Gauntlet'e yılda $1,6M ödüyordu ([CoinDesk](https://www.coindesk.com/tech/2024/02/27/days-after-ditching-aave-risk-manager-gauntlet-moves-to-rival-lender-morpho)); Chaos Labs 2026'da ayrıldı ([The Defiant](https://thedefiant.io/news/defi/chaos-labs-terminates-aave-engagement-citing-risk-misalignment)). Bu modelleri kimse göremiyor, doğrulayamıyor, kontratlar da kullanamıyor.

**Kaskad bu hesabı zincire taşıyor.** Monad mainnet'teki Aave'nin gerçek borçlularını okuyor, Monad'da tek bir tx içinde şu zinciri yürütüyor: fiyat şoku → likidasyonlar → teminat satışı → fiyat etkisi → yeni likidasyonlar. Sonucu herkes MonadScan'de doğrulayabiliyor. Bir kontrat (Guard) bu sonucu okuyup bir piyasayı kendiliğinden durdurabiliyor.

## Ne bulduk

Monad'daki Aave'de **$531M** teminat ve **$238,8M** borç var. En büyük risk **syrupUSDC**: $138M teminat, üstünde $123,7M borç, %92 likidasyon eşiği. En büyük borçlu tek başına bu borcun %24,8'ini taşıyor ve syrupUSDC **%2,31** düşerse likide oluyor.

| syrupUSDC şoku (gerçek defter, 57 pozisyon) | Karşılıksız kalan borç | Anında likide edilemeyen borç |
|---|---|---|
| −%3 | $0 | **$111,0M** (30 pozisyon) |
| −%20 | **$13,3M** | $0,1M |
| −%3, oracle anlık DEX fiyatını izleseydi (en kötü durum) | **$115,9M** | $0 |

- **Asıl risk, likidatörlerin çıkış yolunun olmaması.** syrupUSDC'nin Monad'daki tek DEX havuzu $7M. Başa baş satış bu havuzda ancak ~$134k'ya kadar mümkün. Sonrasında flash-loan likidatörleri kârla çıkamıyor ve 30 pozisyon, eşiğin altında beklemeye başlıyor. Bunları ancak teminatı elde tutup Maple'dan itfa etmeye razı, sermayeli likidatörler temizleyebilir.
- **Oracle tasarımı $116M'lık fark yaratıyor.** Aave Monad'ın syrupUSDC oracle'ı DEX'i değil Maple kurunu okuyor. Bunu zincirden doğruladık: `"Capped SyrupUSDC / USDC / USD"`, `RATIO_PROVIDER` × USDC/USD. Anlık DEX fiyatını okuyan bir oracle, aynı %3'lük şoku ölüm sarmalına çevirirdi.
- **Derin piyasalar dayanıklı.** Aynı motora Ethereum Aave'den yüklenen defterlerde ETH teminatlı $513M borç, %20'lik düşüşte **$0 kayıpla** atlatıyor. Aynı Maple döngüsü Ethereum'da da var (syrupUSDT, $98,8M borç) ve orada da aynı zayıflığı taşıyor.

"Karşılıksız kalan borç" (bad debt), teminatı borcun altına düşmüş ve hepsi satılsa bile kapanmayan açıktır; sonunda mevduat sahipleri öder. "Anında likide edilemeyen borç" ise eşiğin altındaki ama DEX'te kârla satılamadığı için bekleyen borçtur; fiyat biraz daha düşerse karşılıksız borca dönüşür.

## Neden Monad

Aşağıdaki Monad değerleri testnette ölçüldü. Ethereum değerleri aynı kontratın, aynı defter üzerinde, Ethereum gas tarifesiyle çalışan yerel bir fork'ta koşturulmasıyla ölçüldü; Ethereum'a hiçbir tx gönderilmedi. İki ortamın sonuçları birebir aynı, fark yalnızca gas.

| Tek tx'te | Monad | Ethereum |
|---|---|---|
| 10.000 pozisyonluk kaskad | **17,7M gas** (30M limitin %59'u), 1,6 MB bellek | 42,3M gas: tx tavanının (16.777.216, EIP-7825) **2,52 katı → sığmaz** |
| 5.000 pozisyon | 9,4M gas | 20,5M gas: tavanın 1,22 katı → sığmaz |
| Monte Carlo: gerçek syrupUSDC defteri (57 pozisyon) × rastgele şok senaryoları | **213 senaryo** (dış fiyat oracle'ı) / 57 (en kötü durum) | 114 / 34 senaryo |
| Pozisyon başına depolama okuma | ~164 gas (MIP-8: 128 slotluk sayfa) | 2.100 gas (soğuk SLOAD) |
| Gönderimden receipt'e (`eth_sendRawTransactionSync`) | **ortalama 336 ms** (4 tx) | — |

- **Farkı yaratan:** pozisyon başına ucuz depolama okuması (MIP-8) ve 30M'lik tx limiti. Ethereum'da her pozisyonun soğuk okuması bütçeyi tüketiyor.

## Nasıl çalışır

```
Monad MAINNET (salt okuma)                         Monad TESTNET
Aave Pool, Oracle ── Envio HyperSync ───────▶ Kaskad       defter (1 pozisyon = 1 slot) + motor, tek kontrat
                     + multicall                   KaskadMC    aynı motor + arbitraj toparlanması + Monte Carlo
Ethereum Aave (karşılaştırma) ── salt okuma ─▶      Guard ──▶ Piyasa B'yi durdurur
                                                   ▲
web (Next.js) ── ücretsiz önizleme (eth_call) ─────┤
               ── simulate / simulateMC / Guard.refresh (tek tx, sendRawTransactionSync)
```

1. **Defter:** her pozisyon tek bir 32 byte'lık slota paketleniyor; varlık başına ardışık dizi (MIP-8 sayfa dostu).
2. **Şok:** teminat fiyatı N blok boyunca düşüyor. Her blokta likidatörler en fazla birkaç dalga halinde çalışıyor.
3. **Likidasyon:** Aave v3.3 kuralları uygulanıyor (close factor %50, HF < 0,95'te %100; E-Mode eşik ve bonusları). Bekleyen pozisyonlar bellekte bir max-heap'te tutuluyor, anahtar likidasyon fiyatı. Böylece motor her turda defteri baştan taramıyor.
4. **Piyasa:** el konulan teminat, ölçülen derinlikteki sanal bir x·y=k havuzuna satılıyor. Likidatör yalnızca başa baş kaldığı sürece satıyor. Bloklar arasında arbitraj havuzu dış fiyata doğru geri çekiyor.
5. **Oracle:** varsayılan olarak dış fiyatı (Chainlink / kur) izliyor. "Anlık DEX fiyatı" modu açıkça etiketlenmiş en kötü durum.

## Dene

- **[Protokol](https://kaskad42.vercel.app)**
  - Hazır senaryolar: Salı Depegi, En kötü durum, ETH %20 çakılırsa, 10.000 pozisyon stres testi…
  - Her sonuçta düz Türkçe bir "Ne oldu?" özeti, likidasyon dalgaları grafiği ve Sınır Göstergesi (gas, bellek, Ethereum karşılaştırması).
  - Monte Carlo paneli: ortalama, %95 dilimi, en kötü senaryo. "Sınırı bul" düğmesi tek tx'e sığan en büyük stres testini canlı ölçüyor.
  - Monad ↔ Ethereum karşılaştırması ve stres eğrisi.
  - Guard: Piyasa A korumasız, Piyasa B Guard'lı. Guard eşik aşılınca "BORÇ DURDURULDU".
- **[Param güvende mi?](https://kaskad42.vercel.app/cuzdan)** Herhangi bir mainnet adresi için: "syrupUSDC −%2,31'te likide olursun · güvende kalmak için +$1,96M teminat ekle ya da $1,67M borç öde", ayrıca mevduatın çekim riski.
- **[Cüzdan bağla](https://kaskad42.vercel.app/baglan)** Varsayılan, gas'ı sponsor tarafından ödenen geçici cüzdan. İstersen kendi tarayıcı cüzdanını ya da **Mera passkey** cüzdanını kullanabilirsin.
- **Maliyet her zaman önceden belli:** önizlemeler ücretsiz. Zincire giden her düğmenin altında tahmini MON maliyeti yazıyor (Monad gas'ı limitten keser); 1 MON üstü işlemler onay ister.

## Kanıt

Kontratlar Sourcify / MonadVision'da doğrulandı:

| Kontrat | Adres |
|---|---|
| Kaskad (defter + motor) | [`0xdC2D3A2F4cffBf6a0d7945f6505399e2e474b661`](https://testnet.monadscan.com/address/0xdC2D3A2F4cffBf6a0d7945f6505399e2e474b661) |
| KaskadMC (arbitraj toparlanması + Monte Carlo) | [`0x94f27456bBAfe2a8A69ADE8D4C98eB958abB1E6d`](https://testnet.monadscan.com/address/0x94f27456bBAfe2a8A69ADE8D4C98eB958abB1E6d) |
| Guard | [`0xc39996831d3759CD4E9fB25005B400CA6a22871e`](https://testnet.monadscan.com/address/0xc39996831d3759CD4E9fB25005B400CA6a22871e) |
| Piyasa A (korumasız) / Piyasa B (Guard'lı) | [`0xedDE…75Bd`](https://testnet.monadscan.com/address/0xedDE26053c7Df1D9970C1aE201FEc6e3681275Bd) / [`0x0B54…51ed`](https://testnet.monadscan.com/address/0x0B545DfD67223Bb00A22701C38e53774dF0A51ed) |

| İşlem | Sonuç | Tx |
|---|---|---|
| syrupUSDC −%3, gerçek defter | $0 karşılıksız, $111M anında likide edilemeyen · 309 ms | [0xc80d…3a99](https://testnet.monadscan.com/tx/0xc80dfd34835edcba1028b76945f4793598cf3b27bee470e79cffdd75b8a53a99) |
| Aynısı, en kötü durum | $115,9M karşılıksız · 232 ms | [0xb0a5…288b](https://testnet.monadscan.com/tx/0xb0a5d7d76f17c728f6b33f0a58cd049ab3d5a6149e9288a83086d4a60a8a288b) |
| **10.000 pozisyonluk kaskad, tek tx** | 17,7M motor gas'ı, 1,6 MB bellek | [0x661f…185c](https://testnet.monadscan.com/tx/0x661facb56395f553be94399d004f0ca75834cc2f5037f54d37adff832d6d185c) |
| **Monte Carlo: 208 senaryo × 57 pozisyon, tek tx** | ortalama / %95 / en kötü: $0 | [0x1dba…42ce](https://testnet.monadscan.com/tx/0x1dbadcecf6248281f71c63b41552092f03d1eb2a75dd793e4cd1985f272c42ce) |
| Monte Carlo: 56 senaryo, en kötü durum | ortalama $84,3M, %95 $119,4M, 46/56 senaryoda zarar | [0x124f…635f](https://testnet.monadscan.com/tx/0x124fedb1e345dbc68ac800c9bf6bccd108d2a16c9188d8c618cb3d87ada7635f) |
| Guard.refresh | Piyasa B'de borç durduruldu, maks. LTV %90 → %70 | [0xf779…3aa3](https://testnet.monadscan.com/tx/0xf779c8a68fcee03c9f4c7d10c297006efdbe85b24450826c496d5eb022693aa3) |

## Veri

- **Monad Aave:** Envio HyperSync ile Pool'un tüm `Borrow` event'leri tarandı (borçlu = `onBehalfOf`). 663 adres çıktı, bunların 255'inin aktif borcu var. Pozisyonlar tek blokta multicall ile okundu (#108.133.182). Borçlu toplamı, rezerv toplamıyla kuruşu kuruşuna tutuyor; model HF'si ile zincirdeki HF arasındaki medyan fark 0,000001.
- **DEX derinliği:** GeckoTerminal ve Pendle'dan ölçüldü. syrupUSDC $7,0M (Uniswap v4), PT-AUSD $2,1M. Ölçülemeyen ya da ~$5k olan varlıklar için varsayım kullanıldı ve arayüzde etiketlendi.
- **Ethereum karşılaştırması:** Aave V3 Core'dan WETH, USDe, USDC ve syrupUSDT teminatlı borçlular okundu (salt okuma, Envio HyperSync + public RPC).
- **Kalibre defter:** 10.000 pozisyonluk ölçek testi için gerçek syrupUSDC HF dağılımından örneklendi; toplam borç gerçekle aynı. Arayüzde "Kalibre veri" olarak etiketli.

## Varsayımlar ve sınırlamalar

- **Tek baskın teminat:** her pozisyonun en büyük teminatı şoklanıyor, diğer teminatlar sabit fiyatlı sayılıyor. 255 pozisyonun 13'ü bundan etkileniyor (~$222k borç).
- **Havuz:** DEX derinliği tek bir sanal x·y=k havuzu olarak modelleniyor; bu bir kayma eğrisi değil.
- **Arbitraj toparlanması:** blok başına oranlar varlık başına varsayım (ETH ve USDC %90, USDe/Ethereum %50, Maple ve Pendle varlıkları %0) ve arayüzde gösteriliyor.
- **Likidatör:** teminatı anında DEX'te sattığı varsayılıyor. Elde tutup itfa eden likidatörler modelde yok. Bu yüzden "anında likide edilemeyen borç" gerçek Aave'deki bir kural değil, flash-loan likidatörlerinin ekonomisidir.
- **Simülasyon penceresi kısa:** varsayılan 20 blok (~8 sn); saatlere yayılan depeg'ler modellenmiyor.
- **PT-AUSD** 8 Ekim 2026'da vadesine eriyor; fiyatı 1'e yakınsıyor.

## Güvenlik ve testler

- **Testler:** 43 Foundry testi (birim, fuzz ve invariant). Invariant'lar: fiyat hiç artmıyor, likide edilen ≤ borç, karşılıksız + likide edilemeyen ≤ borç, `simulate` defteri değiştirmiyor, Monte Carlo belleği senaryo sayısıyla büyümüyor. Ayrıca 13 Vitest testi var. CI her push'ta çalışıyor.
- **Kontratlar:** yazma yetkisi yalnızca owner'da (`Ownable2Step`). Senaryo sınırları custom error'larla korunuyor. `simulate` yalnızca çağıranın kendi kaydına yazıyor. `delegatecall`, proxy ya da ETH tutma yok.
- **Slither:** tüm bulgular tek tek incelendi; açık yok (yanlış pozitifler ve kasıtlı hesaplamalar).
- **Anahtarlar:** RPC ve özel anahtarlar yalnızca sunucuda. Tarayıcı, izinli metodları geçiren bir `/api/rpc` proxy'si üzerinden konuşuyor. Sponsor route'unda hız limiti ve 10 MON rezerv koruması var.

## Çalıştırma

```bash
cd contracts && forge test                       # kontrat testleri
cd scripts && npm i && npm run fetch && npm run load   # veri: HyperSync + multicall → testnet (maliyeti önce gösterir)
cd web && npm i && npm run dev                   # arayüz (web/.env.local: MONAD_TESTNET_RPC, MONAD_MAINNET_RPC, SPONSOR_PRIVATE_KEY)
```

`contracts/` Foundry: Kaskad, KaskadMC, Guard, MockMarket · `scripts/` veri hattı, yükleyici, ölçüm · `web/` Next.js + viem

Monad · Aave verisi · Envio HyperSync · Alchemy · Mera
