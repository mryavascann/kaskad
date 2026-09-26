# ▼ Kaskad

**"Şu varlık %3 depeg olursa ne olur?" sorusunu zincirde, tek bir tx'te, herkesin doğrulayabileceği şekilde cevaplayan likidasyon kaskadı simülatörü.**

Monad Blitz İstanbul · 26 Eylül 2026 · Monad testnet üzerinde çalışır, veriyi Monad mainnet'teki Aave'den okur.

> **Demo: https://kaskad42.vercel.app** · Video: _1,5 dk Türkçe video linki_

---

## Problem

Lending protokollerinde risk kararlarını (LTV, borç limitleri, ne zaman durulmalı) zincir dışında çalışan risk firmaları veriyor. Aave, Gauntlet'e yılda $1,6M ödüyordu ([CoinDesk](https://www.coindesk.com/tech/2024/02/27/days-after-ditching-aave-risk-manager-gauntlet-moves-to-rival-lender-morpho)); Chaos Labs 2026'da Aave'den ayrıldı ([The Defiant](https://thedefiant.io/news/defi/chaos-labs-terminates-aave-engagement-citing-risk-misalignment)). Bu hesapları dışarıdan kimse göremiyor, doğrulayamıyor, kontratlar da kullanamıyor.

Monad'da TVL'nin çoğu lending'de ([DefiLlama](https://defillama.com/chain/monad)). Monad'daki Aave'nin defteri kaldıraçlı stablecoin döngülerinden oluşuyor. En büyük teminat **syrupUSDC: $138M**; bu teminat %92 likidasyon eşikli E-Mode'da ve üstünde **$123,7M borç** var. En büyük syrupUSDC borçlularının sağlık faktörü ~1,02, yani fiyat **%2,3** düşerse likide oluyorlar. Asıl risk depeg.

## Çözüm

Kaskad bu hesabı **zincirde** yapıyor. Şok → likidasyonlar → teminat satışı → fiyat etkisi → yeni likidasyonlar… Döngü durulana kadar sürüyor ve hepsi **tek tx'te**.

- **Protokol ekranı:** hazır senaryolar ("Salı Depegi", "Kur oracle'ı kalkanı", "10.000 pozisyon stres testi"…), düz Türkçe "Ne oldu?" anlatımı, turlar grafiği, stres eğrisi, Sınır Göstergesi.
- **Guard:** herkesin çağırabileceği zincir üstü devre kesici. Standart senaryoyu Kaskad'da çalıştırıyor; karşılıksız borç eşiği aşılırsa örnek Piyasa B'de borcu durduruyor ve maks. LTV'yi düşürüyor. Piyasa A (korumasız) yan yana duruyor.
- **"Param güvende mi?":** herhangi bir cüzdanın Monad Aave pozisyonunu okuyor ve şunları gösteriyor: *"syrupUSDC −%2,31'te likide olursun"*, kaskad senaryosunda ne olacağı, güvende kalmak için ne kadar teminat eklemen ya da borç ödemen gerektiği, mevduatının çekim riski. Mera passkey cüzdanıyla bağlanabiliyor.

### "Karşılıksız kalan borç" (kötü borç) ne demek?

Bir pozisyonun teminatı borcunun altına düşerse, teminatın tamamı satılsa bile borç kapanmaz. Geriye kalan ve kimsenin ödemeyeceği bu açık **karşılıksız kalan borç**tur (İngilizcesi *bad debt*). Bu parayı sonunda protokol, yani paraya faiz için yatıran mevduat sahipleri öder. Kaskad'ın büyük kırmızı sayısı bu.

**Likide edilemeyen riskli borç:** Pozisyon eşiğin altına inmiş, ama havuz o kadar sığ ki likidatör teminatı satarsa zarar edecek. Bu yüzden kimse dokunmuyor. Fiyat biraz daha düşerse bu borç da karşılıksız kalır.

## Öne çıkan sonuç (gerçek Aave Monad defteri, syrupUSDC −%3)

| Senaryo | Likide edilen | **Karşılıksız kalan** | **Likide edilemeyen** | Son fiyat |
|---|---|---|---|---|
| Gerçekçi: oracle dış fiyatı (Maple kuru) izler, −%3 | $0,13M | $0 | **$111M** | $1,18 → $1,15 |
| Gerçekçi, −%20 | $0,13M | **$13,3M** | $0,1M | → $0,95 |
| En kötü durum: oracle anlık DEX fiyatını izler, −%3 | $2,7M | **$115,9M** | $0 | $1,18 → $0,05 |

**Gerçekçi durumda asıl risk "likide edilemeyen borç".** $7M'lık havuz, likidatörlerin $124M'lık defteri temizlemesine yetmiyor ve havuzu dışarıdan dolduracak arbitraj yok (Maple itfası günler sürüyor). %3'lük depeg $111M borcu likide edilemez hale getiriyor; şok %20'ye çıkınca bunun $13M'ı karşılıksız kalıyor. Oracle anlık havuz fiyatına bağlı olsaydı (manipülasyona açık tasarım) aynı %3 ölüm sarmalına dönerdi. Uygulama bunu ayrı ve etiketli bir **en kötü durum** senaryosu olarak gösteriyor.

## Monad ↔ Ethereum: aynı şok, iki ağın verisi

Karşılaştırma defterleri Ethereum Aave V3'ten okundu (Envio HyperSync + public RPC); Ethereum'a hiçbir tx gönderilmedi. Simülasyonun tamamı Monad'da çalışıyor. Gerçekçi modda, yani oracle dış fiyatı izlerken ve arbitraj toparlanması açıkken:

| Defter | Borç | DEX derinliği | Arbitraj/blok (varsayım) | −%3: karşılıksız / likide edilemeyen | −%20: karşılıksız / likide edilemeyen |
|---|---|---|---|---|---|
| syrupUSDC (Monad) | $123,7M | $7,0M | %0 | $0 / **$111M** | **$13,3M** / $0,1M |
| syrupUSDT (Ethereum, aynı Maple döngüsü) | $98,8M | $5,1M | %0 | $0 / **$93,8M** | **$10,4M** / $4,4M |
| USDe (Monad) | $46,7M | $1M (varsayım) | %10 | $0 / **$45,6M** | **$5,1M** / $0,6M |
| USDe (Ethereum) | $515,6M | $47,8M | %50 | $0 / **$279M** | **$54,1M** / $11,2M |
| USDC (Ethereum, USDC borçlu döngüler hariç) | $26,9M | $631,6M | %90 | $0 / $0 | $0 / $0 |
| WETH (Monad), ETH yatır, stablecoin borç al | $2,1M | $25M (varsayım) | %50 | $0 / $0 | $0 / $0 |
| WETH (Ethereum), aynı klasik pozisyon | $513,2M | $430M | %90 | $0 / $0 | $0 / $0,2M |

- **Derinlik tek başına değil, riskteki borca oranla ve arbitraj kaynağıyla birlikte önemli.** Ethereum USDe havuzu 48 kat daha derin, ama üstündeki borç 11 kat büyük.
- **Derin ve arbitrajlı piyasalar (ETH, USDC) %20'lik düşüşü kayıpsız atlatıyor.** Maple ve Ethena döngüleri ise iki ağda da aynı zayıflığı taşıyor.

Sentetik varlık kimlikleri: 7 = WETH (Ethereum), 13 = USDC (Ethereum), 14 = USDe (Ethereum), 15 = syrupUSDT (Ethereum). syrupUSDC, Ethereum Aave'de listelenmediği için en yakın muadil olarak syrupUSDT kullanıldı.

## Monad'ın sınırlarını zorlamak

| | Monad (ölçülen, testnet) | Ethereum (aynı iş) |
|---|---|---|
| 10.000 pozisyonluk kaskad, tek tx | **17,7M gas** (30M limitin %59'u), sync receipt **150 ms** | ≈ 42M gas, EIP-7825 tx tavanının (16,77M) **~2,5 katı → sığmaz** |
| 1,63 MB bellek | 25k gas (lineer, `w/2`) | 5,2M gas (`3w + w²/512`) |
| 10.000 slot okuma | ~1,6M gas (MIP-8: 128 slotluk sayfa 8.100 + 100/slot) | 21M gas (soğuk SLOAD 2.100/slot) |

- **Lineer bellek:** motor tüm defteri belleğe alıyor ve likidasyonları bellekteki bir max-heap'te işliyor (anahtar = likidasyon fiyatı). Gas, pozisyon sayısıyla (yükleme) ve likidasyon × log N ile büyüyor, her turda defteri baştan taramıyor. `previewCurve` her şok noktası için durumun ayrı bir kopyasını tutuyor, yani bellek *nokta × pozisyon* kadar büyüyor.
- **MIP-8 storage sayfaları:** 1 pozisyon = 1 slot (32 byte paket), varlık başına ardışık dizi. Yeniden yüklemede yazılmış slotların üstüne 100 gas'a yazılıyor.
- **Tek kontrat:** defter + motor `Kaskad.sol` içinde, simülasyon sırasında harici çağrı yok. Kontrat 10 KB; Monad 128 KB'a izin veriyor.
- **Gas limitten kesilir:** motor kendi gas'ını `gasleft()` farkıyla ölçüyor. Ücretsiz `preview` (eth_call) bu değeri döndürüyor; gerçek tx limiti `preview × 1,15 + event'ler + sabit`. Hot path'te `eth_estimateGas` yok.
- **`eth_sendRawTransactionSync`:** tüm tx'ler receipt'i tek çağrıda alıyor (Alchemy testnette doğrulandı). Desteklenmezse `sendRawTransaction` + receipt beklemeye düşülüyor. Burner cüzdanda yerel nonce, sabit fee (150/2 gwei) ve tek seferde tek tx var.
- **Reserve balance:** burner'lar yalnızca gas harcıyor. Sponsor route'u sponsor bakiyesi 10 MON'un altına inecekse fonlamayı reddediyor.

## Bellek ve sınırlar (ölçüm)

Monad sütunları testnetteki `preview` / `previewMC` çağrılarından geliyor; motor kendi gas'ını `gasleft()` farkıyla, belleğini de serbest bellek işaretçisiyle (`mload(0x40)`) ölçüyor. `msize()` Yul optimizer'da yasak; motor memory-safe olduğu için ikisi aynı değeri veriyor.

Ethereum sütunları **Ethereum'da çalıştırılmadı.** Aynı kontrat ve aynı defter, yerel bir anvil fork'unda (Monad testnet durumu + Ethereum/Prague gas tarifesi) çalıştırılarak ölçüldü. İki ortamın sonuçları birebir aynı; fark yalnızca gas. Ethereum tx tavanı: 16.777.216 (EIP-7825, Fusaka, mainnet'te 3 Aralık 2025).

**Tek senaryo, çözünürlük (−%3, 20 blok × 3 dalga, oracle havuzu izler):**

| Pozisyon | Monad gas | Bellek | Byte/pozisyon | Ethereum gas (ölçüm) | Yalnızca bellek, Ethereum | Ethereum / tavan |
|---|---|---|---|---|---|---|
| 57 (gerçek syrupUSDC) | 0,77M | 36 KB | 639 | 0,86M | 5,9k | 0,05 → sığar, 1,1× pahalı |
| 500 | 1,68M | 106 KB | 217 | 2,66M | 33k | 0,16 → sığar, 1,6× |
| 2.000 | 4,22M | 340 KB | 174 | 8,34M | 265k | 0,50 → sığar, 2,0× |
| 5.000 | 9,41M | 809 KB | 166 | 20,5M | 1,39M | **1,22 → sığmaz** |
| 10.000 | 17,7M | 1,59 MB | 163 | 42,3M | 5,2M | **2,52 → sığmaz** |

- **Pozisyon başına ~160 byte bellek:** 5 word (teminat, borç, meta, heap, bekleyen kuyruk).
- **Monad'da önce gas doluyor.** 10.000 pozisyonda gas %59, bellek %19. 30M gas'a ~17.000 pozisyonda ulaşılıyor (~2,7 MB); 8 MB için ~50.000 pozisyon gerekirdi.
- **Ethereum'da sığmamanın sebebi bellek değil.** 10.000 pozisyonun belleği Ethereum'da yalnızca 5,2M gas tutuyor. Asıl fark pozisyon başına soğuk SLOAD (2.100'e karşı Monad'da ~160 gas) ve toplam hesap.
- **Arayüz kuralı:** Ethereum tahmini fork ölçümüyle ±%1 örtüşüyor. Arayüz "Ethereum'da tek işleme sığmıyor" cümlesini yalnızca tahmin tavanı aştığında gösteriyor; aksi halde "Ethereum'da N kat pahalı" yazıyor.
- **Gerçek defter küçük:** Monad Aave'de 255 borçlu pozisyon var. En büyük varlık defteri syrupUSDC'de 57 pozisyon ve 36 KB bellek.

**Monte Carlo (`KaskadMC`): tek tx'te K rastgele senaryo × gerçek defter.** Her senaryonun son düşüşü `S × 3u²` (ortalaması S, en fazla 3S) ve yol rastgele; sonuç tohumla deterministik. Her senaryo defterin MCOPY kopyası üzerinde çalışıyor ve bitince bellek geri alınıyor. Bu yüzden bellek K ile büyümüyor; senaryo başına yalnızca 3 sonuç word'ü birikiyor ve sınırı gas belirliyor. Tek tx'e sığan en büyük K (ikili arama ile ölçüldü):

| Defter, oracle | Monad K | Ethereum K | Monad: ortalama / %95 / en kötü karşılıksız |
|---|---|---|---|
| syrupUSDC Monad (57), havuzu izler | **57** (29,6M gas, 17 KB) | 34 | $84,9M / $119,4M / $119,4M |
| syrupUSDC Monad (57), dış fiyat | **213** | 114 | $0 |
| USDe Ethereum (63), havuzu izler | **82** | 43 | $201M / $433M / $441M |
| WETH Ethereum (300), dış fiyat, ort. −%20 | **101** | 53 | $2,8M / $23,2M / $34,0M |
| Kalibre syrupUSDC (2.000), havuzu izler | **15** | 3 | $17,6M / $22,6M / $22,6M |

Not: bu K ölçümleri toparlanması olmayan ilk KaskadMC ile yapıldı; syrupUSDC satırları v2 ile aynı, diğerlerinde güncel K arayüzdeki "Sınırı bul" ile ölçülür.

Küçük gerçek defterlerde Monad'ın avantajı ~1,8×; bu farkı esas olarak tx gas limiti yaratıyor (30M'e karşı 16,77M). Defter büyüdükçe fark açılıyor (2.000 pozisyonda 5×), çünkü Ethereum'da her pozisyonun soğuk okuması bütçeyi yiyor.

## Mimari

```
Monad MAINNET (salt okuma)                 Monad TESTNET (10143)
┌──────────────────────────┐   scripts/   ┌───────────────────────────────────────────┐
│ Aave V3 Pool / Oracle    │──multicall──▶│ Kaskad.sol  (PositionBook + motor)         │
│ Borrow event'leri        │──HyperSync──▶│   loadPositions (owner)  ─ 1 slot/pozisyon │
└──────────────────────────┘              │   preview / previewCurve (eth_call, ücretsiz)│
┌──────────────────────────┐              │   simulate → Round + SimulationDone event  │
│ GeckoTerminal / Pendle   │─ derinlik ──▶│ Guard.sol ──simulate──▶ Kaskad             │
└──────────────────────────┘              │   └─ eşik aşılırsa ─▶ MockMarket B.pause   │
                                          │ MockMarket A (korumasız)                   │
                                          └───────────────▲───────────────────────────┘
web/ (Next.js + viem) ── preview (eth_call) ──────────────┤
   burner cüzdan ── simulate / Guard.refresh (sendRawTransactionSync)
   /api/fund  (sponsor, server)     /api/position (mainnet Aave okuma, server)
```

## Model

1. Şoklanan varlığın dış fiyatı `steps` blokta `p0 → p0·(1−şok)` iniyor.
2. Her blokta en fazla `maxRoundsPerStep` likidasyon **dalgası** oluyor. Oracle dalga başında okunuyor.
   - `oracleFeedbackBps = 0` (varsayılan, gerçekçi): oracle yalnızca dış fiyatı görüyor (Chainlink / kur).
   - `10000` (en kötü durum): oracle anlık havuz fiyatını izliyor.
3. **Bloklar arası arbitraj toparlanması:** her yeni blokta havuzun dış fiyattan sapması, varlığa özgü bir oranda kapanıyor. Bu oran bir varsayım ve `KaskadMC.recoveryBps` içinde tutuluyor. Örnekler: ETH ve USDC için %90 (CEX arbitrajı), USDe (Ethereum) için %50, Maple ve Pendle varlıkları için %0. Toparlanma olmasaydı ETH gibi derin bir piyasa bile tek blokta boşalan havuz yüzünden gerçekçi olmayan bir çöküş gösterirdi. Gerçek defterler bu motorla çalışıyor; kalibre syrupUSDC defteri Kaskad v1'de kalıyor (syrupUSDC'nin toparlanması zaten %0).
4. HF < 1 olan pozisyonlar Aave v3.3 kurallarıyla likide ediliyor: close factor %50; HF < 0,95 ya da borç/teminat < $2.000 ise %100. E-Mode pozisyonlarında LT ve bonus E-Mode kategorisinden geliyor.
5. Ele geçirilen teminat sanal bir x·y=k havuzunda anında satılıyor. **Likidatör kârlılık sınırı:** satış getirisi ödenen borcu karşılamıyorsa likidatör durur (`x + dx ≤ y·(1+bonus)/p`) ve dalga biter.
6. Karşılıksız borç = son fiyatta `max(0, borç − teminat değeri)`. Likide edilemeyen borç = HF < 1 ama henüz karşılıksız olmayan borç.
7. Kısmi çözünürlükte havuz derinliği, simüle edilen borç payıyla ölçekleniyor; böylece satış/derinlik oranı temsili kalıyor.

## Veri

- **Borçlular:** Envio HyperSync ile Aave Pool'un tüm `Borrow` event'leri tarandı (borçlu = `onBehalfOf`). 663 adres çıktı, bunların 255'inin aktif borcu var.
- **Pozisyonlar:** tek blokta multicall ile okundu (`getUserAccountData`, `getUserConfiguration`, aToken/vToken bakiyeleri, oracle, E-Mode). Borçlu toplamı, rezerv toplamıyla kuruşu kuruşuna tutuyor. Model HF'i ile zincirdeki HF arasındaki medyan fark 0,000001.
- **Derinlik:** syrupUSDC için $7,0M (Uniswap v4, GeckoTerminal); PT-AUSD için $2,1M (Pendle AMM). USDe, sUSDe ve weETH'nin Monad'da zincir üstü çıkış likiditesi ~$5k; bunlar için **$1M varsayıldı ve UI'da "varsayım" olarak etiketlendi.**
- **Kalibre defter:** syrupUSDC için gerçek HF dağılımından borç ağırlıklı örneklenen 10.000 pozisyon. Toplam borç gerçekle birebir aynı. UI'da "Kalibre veri (gerçek toplamlar)" olarak etiketli.

## Testnet adresleri (Sourcify / MonadVision'da doğrulandı)

| Kontrat | Adres |
|---|---|
| Kaskad | [`0xdC2D3A2F4cffBf6a0d7945f6505399e2e474b661`](https://testnet.monadscan.com/address/0xdC2D3A2F4cffBf6a0d7945f6505399e2e474b661) |
| KaskadMC v2 (gerçek defterler için motor: arbitraj toparlanması + Monte Carlo; Kaskad defterlerini okur) | [`0x94f27456bBAfe2a8A69ADE8D4C98eB958abB1E6d`](https://testnet.monadscan.com/address/0x94f27456bBAfe2a8A69ADE8D4C98eB958abB1E6d) |
| Guard | [`0xc39996831d3759CD4E9fB25005B400CA6a22871e`](https://testnet.monadscan.com/address/0xc39996831d3759CD4E9fB25005B400CA6a22871e) |
| Piyasa A (korumasız) | [`0xedDE26053c7Df1D9970C1aE201FEc6e3681275Bd`](https://testnet.monadscan.com/address/0xedDE26053c7Df1D9970C1aE201FEc6e3681275Bd) |
| Piyasa B (Guard'lı) | [`0x0B545DfD67223Bb00A22701C38e53774dF0A51ed`](https://testnet.monadscan.com/address/0x0B545DfD67223Bb00A22701C38e53774dF0A51ed) |

## Kanıt tx'leri

| Senaryo | Motor gas | Tx |
|---|---|---|
| syrupUSDC gerçek, −%3, borsa fiyatı oracle'ı → $115,9M karşılıksız | 765k | [0x1437…5400](https://testnet.monadscan.com/tx/0x1437811dd1ec25af59ff5868dc35533cd65f47db9dcfb0fb369bb5fb2b615400) |
| syrupUSDC gerçek, −%3, kur oracle'ı → $0 karşılıksız, $111M likide edilemeyen | 240k | [0x3617…a057](https://testnet.monadscan.com/tx/0x3617194d6c8d2d12b5dfc5be1d83b895df4048159ad9b2b64e4425b85595a057) |
| syrupUSDC gerçek, −%12, kur oracle'ı → $2,3M karşılıksız | 271k | [0x167e…0cda](https://testnet.monadscan.com/tx/0x167e9b9aea9afd9ef051dd01469f3b8a7881b251091fddb49884b50662ab0cda) |
| PT-AUSD gerçek, −%2 → $45,3M karşılıksız | 605k | [0xca27…ec00](https://testnet.monadscan.com/tx/0xca2745d0d979e9e751147c1bb218e57583f844e7e15c52af00d7e8247c80ec00) |
| Kalibre 5.000 pozisyon, −%3 | 9,4M | [0xfa38…99b6](https://testnet.monadscan.com/tx/0xfa387f8df7c090104db92161c70badd10d1f68206905d7bfe6d45a8d842b99b6) |
| **Kalibre 10.000 pozisyon, −%3 (tek tx, 1,63 MB bellek)** | **17,7M** | [0x661f…185c](https://testnet.monadscan.com/tx/0x661facb56395f553be94399d004f0ca75834cc2f5037f54d37adff832d6d185c) |
| Guard.refresh → Piyasa B borcu durdurdu (`GuardTripped`) | 1,3M | [0xf779…3aa3](https://testnet.monadscan.com/tx/0xf779c8a68fcee03c9f4c7d10c297006efdbe85b24450826c496d5eb022693aa3) |

## Çalıştırma

```bash
# kontratlar
cd contracts && forge test                     # birim + fuzz + invariant
forge test --match-contract GasBench -vv --gas-limit 2000000000   # Ethereum kurallarıyla çözünürlük ölçümü

# veri hattı (repo kökünde .env: .env.example'a bak)
cd scripts && npm i
npm run fetch        # HyperSync + multicall → data/positions.json
npm run depth        # DEX derinliği → data/depth.json
npm run load         # testnet'e yükleme planı + MON maliyeti (göndermek için: -- --yes)
npm run smoke        # önizlemeler (kanıt tx'i için: -- --send --guard)
npm run reset-guard  # demo sonrası Piyasa B'yi yeniden aç

# web
cd web && npm i && npm run dev   # web/.env.local: MONAD_TESTNET_RPC, MONAD_MAINNET_RPC, SPONSOR_PRIVATE_KEY (hepsi sunucuda)
npm test                         # vitest: paketleme, HF, likidasyon eşiği, bellek maliyeti, kalibrasyon
```

## Güvenlik

- `loadPositions`, `setAsset`, `resetBook`, `setDataInfo`, Guard ayarları: yalnızca owner (OpenZeppelin `Ownable2Step`). `MarketB.setBorrowPaused/setMaxLtv`: yalnızca Guard ya da owner. `tx.origin` kullanılmıyor.
- Senaryo sınırları custom error'larla korunuyor: `shock ≤ %100`, `1 ≤ steps ≤ 100`, `1 ≤ rounds ≤ 20`, `1 ≤ maxPositions ≤ defter`, `feedback ≤ %100`, geçerli varlık. Fiyat 0'a inerse döngü güvenle bitiyor.
- `simulate` yalnızca çağıranın kendi sonuç kaydına ve event'lere yazıyor; defteri değiştiremiyor (invariant testiyle doğrulandı). `delegatecall`, `selfdestruct`, proxy, low-level `call`, `receive/fallback` yok.
- Testler: 34 Foundry testi (birim, 256 turluk fuzz, 2.048 çağrılık invariant: fiyat hiç artmıyor, likide edilen ≤ borç, karşılıksız + likide edilemeyen ≤ borç, tur ≤ sınır, defter değişmiyor, owner değişmiyor) ve 12 Vitest testi.
- **Slither** (yüksek/orta bulgu yok). Kalan 4 düşük bulgunun gerekçesi:
  - `_slots` "başlatılmamış": yanlış pozitif; mapping `loadPositions` içinde yazılıyor.
  - `d / 2` sonrası çarpma: %50 close factor'ün kendisi; kayıp ≤ 1 wei.
  - `setGuard` sıfır adres kontrolü: sıfır adres "Guard'ı kaldır" anlamına geliyor, yalnızca owner çağırabilir.
  - `Guard.refresh` çağrı sonrası event: çağrılan motor `immutable` ve güvenilir, geri çağrı yapmıyor.
- Özel anahtarlar ve RPC anahtarları yalnızca sunucuda. Tarayıcı `/api/rpc` proxy'si üzerinden konuşur: yalnızca izinli metodlar geçer, IP başına hız limiti var; Alchemy anahtarı tarayıcıya hiç çıkmaz. `/api/fund` adres doğruluyor, adres ve IP başına hız limiti uyguluyor, hibe tavanı koyuyor ve 10 MON rezervi koruyor. Burner anahtarı yalnızca testnette ve yalnızca bu uygulama için kullanılıyor.

## Sınırlamalar

- **Tek baskın teminat:** her pozisyonun en büyük teminatı şoklanıyor, diğer teminatlar sabit fiyatlı sayılıyor. 255 pozisyonun 13'ü bundan etkileniyor (~$222k borç).
- **Oracle modeli:** syrupUSDC'nin gerçek Aave oracle'ı Maple kuruna bağlı. "Borsa fiyatı" modu bir stres varsayımı, "kur oracle'ı" modu gerçeğe yakın durum. İkisi de UI'da ve stres eğrisinde yan yana gösteriliyor.
- **Havuz:** derinlik TVL'den türetilen sanal bir x·y=k havuzu (gerçek bir kayma eğrisi değil). Bloklar arasında arbitrajla toparlanma modellenmiyor. İnce varlıklarda $1M derinlik varsayımı etiketli.
- **Likidatör:** her dalgada kârlılık sınırına kadar satış yapıyor. Kısmi likidasyon optimizasyonu, gas maliyeti ve MEV modellenmiyor.
- **Kalibre defter** gerçek değil, gerçek dağılımdan örneklenmiş; ölçeklenmiş tutarlar yaklaşık.
- **Mevduat zararı payı** ("Param güvende mi?") kaba bir yaklaşım; Aave'de önce Umbrella ve rezervler devreye girer.
- **PT-AUSD** 8 Ekim 2026'da vadesine eriyor; fiyatı vadeye doğru 1'e yakınsıyor.

## Yapı

```
contracts/  Foundry: PositionBook, Kaskad, Guard, MockMarket + testler + Deploy script
scripts/    TS: HyperSync + multicall veri hattı, derinlik, testnet yükleyici, duman testi
web/        Next.js + viem: Protokol ekranı, "Param güvende mi?", /api/fund, /api/position
```

Monad üzerinde · Aave verisi · Envio HyperSync · Alchemy · Mera
