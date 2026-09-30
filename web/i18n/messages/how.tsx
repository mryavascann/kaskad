/**
 * Copy of /how-it-works (EN) and /tr/nasil-calisir (TR). Sentences that carry numbers are functions:
 * the page passes values read from deployment.json, the contracts' constants or the chain, so no
 * metric is ever typed into the copy. The Turkish object must match the English shape.
 */
import type { ReactNode } from "react";
import type { Locale } from "../config";

const code = (s: string) => <code className="font-mono text-[0.92em] text-fg-1">{s}</code>;

type Stat = string;

const en = {
  meta: {
    title: "How it works",
    description: "The model, the data, the assumptions and the on-chain proofs behind Kaskad.",
  },
  hero: {
    kicker: "How it works",
    title: "Every number, traceable to the chain.",
    lead: (v: { shock: Stat }) =>
      `Kaskad answers “what happens if this asset drops ${v.shock}?” on chain: it replays the liquidation cascade across a snapshot of real Aave borrowers inside a single Monad transaction. This page covers the model, the data, what we assume and how to check every number yourself.`,
  },
  toc: {
    label: "On this page",
    cascade: "The cascade",
    method: "Methodology",
    data: "Data",
    assumptions: "Assumptions",
    monad: "Why Monad",
    proofs: "Proofs",
    verify: "Verify it yourself",
    security: "Security and tests",
  },
  cascade: {
    title: "The cascade, in one transaction",
    intro: "A price shock sets off a loop. Kaskad runs the whole loop inside one transaction and writes the result to the chain.",
    loopLabel: "The liquidation loop",
    loop: [
      ["Price drops", "The collateral price falls block by block along the shock path."],
      ["Positions cross the threshold", "Borrowers whose health factor falls below 1 become liquidatable."],
      ["Liquidators sell", "They repay debt, seize collateral with a bonus and sell it into the pool."],
      ["The sale moves the price", "Each sale pushes the pool price down; if the oracle follows the pool, that drop starts the next wave."],
    ] as [string, string][],
    again: "and again, wave after wave",
    pipelineLabel: "From the snapshot to the result",
    pipeline: [
      ["Envio HyperSync", "Every Borrow event of Aave on Monad mainnet"],
      ["Snapshot", "Positions read at one block with multicall"],
      ["Monad testnet", "Book and engine contracts"],
      ["One transaction", "The full cascade, every wave"],
      ["Events", "Result on MonadScan, readable by contracts"],
      ["Guard and UI", "A contract reacts; people read it here"],
    ] as [string, string][],
  },
  method: {
    title: "Methodology",
    items: {
      book: { term: "Book", def: "Each position is packed into one 32-byte storage slot, stored contiguously per asset so reads stay on the same MIP-8 page." },
      shock: {
        term: "Shock",
        def: (v: { steps: Stat; rounds: Stat; maxSteps: Stat; maxRounds: Stat }) =>
          `The collateral price falls over a number of blocks (${v.steps} by default, up to ${v.maxSteps}). In every block liquidators work in up to ${v.rounds} waves (up to ${v.maxRounds}).`,
      },
      rules: {
        term: "Liquidation rules",
        def: (v: { closeFactor: Stat; hf: Stat; small: Stat }) =>
          `Aave v3.3: a liquidation repays ${v.closeFactor} of the debt, or all of it when the health factor is below ${v.hf} or the debt or collateral is worth less than ${v.small}. E-Mode thresholds and bonuses apply. Pending positions wait in an in-memory max-heap keyed by liquidation price, so no wave rescans the book.`,
      },
      market: {
        term: "Market",
        def: "Seized collateral is sold into a virtual constant-product (x·y=k) pool sized to the measured DEX depth. A liquidator sells only up to the point where the trade still breaks even; beyond it the position waits. Between blocks, arbitrage pulls the pool back toward the external price by an assumed share per asset.",
      },
      oracle: {
        term: "Oracle",
        def: "By default the oracle follows the external price (Chainlink or the asset's exchange rate), which is what Aave uses. The mode where the oracle follows the DEX pool is labelled as the worst case.",
      },
      outputs: {
        term: "Outputs",
        def: "Bad debt is the shortfall left after all collateral is sold; depositors end up paying it. Debt that can't be liquidated instantly (stuck debt) belongs to positions below the threshold that no instant-sale liquidator can clear at a profit; a little more price drop turns it into bad debt. Both are recorded with every wave.",
      },
    },
    oracleCheck: (
      <>
        Aave&apos;s syrupUSDC oracle on Monad reads the Maple exchange rate, not the DEX. This was checked on chain: the feed is{" "}
        {code("Capped SyrupUSDC / USDC / USD")}, a {code("RATIO_PROVIDER")} times USDC/USD.
      </>
    ) as ReactNode,
  },
  data: {
    title: "Data",
    borrowers: (v: { block: Stat; borrowers: Stat; debt: Stat; supplied: Stat }) => (
      <>
        Every {code("Borrow")} event of the Aave Pool on Monad mainnet was scanned with Envio HyperSync (borrower ={" "}
        {code("onBehalfOf")}). Positions were then read at a single block, {v.block}, with multicall: {v.borrowers} borrowers
        with debt, {v.debt} of debt against {v.supplied} supplied. Borrower totals reconcile with the reserve totals, and the
        model&apos;s health factors match the on-chain values.
      </>
    ),
    depthsTitle: "Exit pools and recovery",
    depthsNote: "Where the depth could not be measured, it is assumed, and every screen says so.",
    columns: { asset: "Asset", book: "Book", debt: "Debt", depth: "Pool depth", recovery: "Arbitrage recovery / block" },
    chain: { monad: "Monad", ethereum: "Ethereum, simulated on Monad" },
    noRecovery: "none",
    fullNote: "Full source note",
    ethereum:
      "For comparison, Aave V3 Core borrowers on Ethereum were read the same way and loaded into the same engine on Monad (read only; nothing was sent to Ethereum).",
    calibrated: (v: { n: Stat; asset: string }) =>
      `For the scale test, a synthetic book of ${v.n} positions was sampled from the real ${v.asset} health-factor distribution, keeping the real book's total debt. Everything built on it is labelled synthetic.`,
  },
  assumptions: {
    title: "Assumptions and limits",
    items: (v: { steps: Stat; block: Stat; maturity: Stat | null }) =>
      [
        "One exit: the model sells into a single Monad DEX pool through an instant-sale (flash-loan) liquidator. Maple redemptions and other venues are excluded.",
        "Stuck debt is liquidator economics, not an Aave rule: liquidators who hold the collateral and redeem it later would clear it.",
        "Dominant collateral: each position's largest collateral takes the shock; its other collateral keeps its price.",
        "The pool is a constant-product proxy sized by liquidity, not a measured slippage curve.",
        "Arbitrage recovery between blocks is an assumption per asset, shown with its reason.",
        `Short window: the default shock plays over ${v.steps} blocks. Depegs that unfold over hours are not modelled.`,
        `The book is a snapshot taken at block ${v.block}, not live positions.`,
        ...(v.maturity ? [`PT-AUSD matures on ${v.maturity}; its price converges to 1 as that date approaches.`] : []),
        "The contracts run on Monad testnet; the positions come from mainnet.",
      ] as string[],
  },
  monad: {
    title: "Why Monad",
    intro: "The whole cascade has to fit in one transaction, and every position is a storage read. That is where Monad differs:",
    gas: (v: { monad: Stat; eth: Stat }) => `Gas per transaction: ${v.monad} on Monad, ${v.eth} on Ethereum (the EIP-7825 cap).`,
    reads: (v: { monad: Stat; eth: Stat; slots: Stat }) =>
      `Reading a position: about ${v.monad} gas on Monad (a warm read plus the MIP-8 page cost, shared by the ${v.slots} slots of a page) against ${v.eth} for a cold read on Ethereum.`,
    proof: (v: { n: Stat; gas: Stat; share: Stat; eth: Stat; ratio: Stat }) =>
      `The ${v.n}-position cascade (synthetic book) used ${v.gas} gas on chain, ${v.share} of Monad's limit. The same run is estimated at ${v.eth} gas on Ethereum, ${v.ratio} its cap: it does not fit in one transaction there.`,
    proofMissing: "The scale proof could not be read from the RPC right now; the limits above still hold.",
    estimateNote: (v: { cold: Stat }) =>
      `Ethereum figure: an estimate from the measured Monad run (cold reads at ${v.cold} gas each and quadratic memory cost).`,
    sync: (
      <>
        Proofs are sent with {code("eth_sendRawTransactionSync")}, which returns the receipt in the same call.
      </>
    ) as ReactNode,
  },
  proofs: {
    title: "Proofs on chain",
    intro: "Transactions sent as evidence, read back from Monad testnet when this page was built: the scenario from the calldata, the result from the event.",
    columns: { when: "When", what: "Scenario", result: "Recorded result", gas: "Engine gas", tx: "Transaction" },
    oracle: { external: "external price", pool: "oracle follows the pool (worst case)" },
    book: { real: "real book", synthetic: "synthetic book" },
    cascade: (v: { asset: string; shock: Stat; oracle: string; book: string; positions: Stat }) =>
      `${v.asset} ${v.shock}, ${v.book} (${v.positions} positions), ${v.oracle}`,
    monteCarlo: (v: { paths: Stat; positions: Stat; oracle: string }) =>
      `Monte Carlo: ${v.paths} random shock paths × ${v.positions} positions, ${v.oracle}`,
    guard: "KaskadGuard.refresh(): runs its stored scenario on the engine",
    cascadeResult: (v: { liquidated: Stat; bad: Stat }) => `Liquidated ${v.liquidated} · bad debt ${v.bad}`,
    monteCarloResult: (v: { mean: Stat; p95: Stat; worst: Stat }) => `Bad debt mean ${v.mean} · p95 ${v.p95} · worst ${v.worst}`,
    guardResult: (v: { ratio: Stat; tripped: boolean }) =>
      v.tripped ? `Bad debt at ${v.ratio} of the book: borrowing paused on market B` : `Bad debt at ${v.ratio}: below the threshold`,
    failed: "Could not be read from the RPC right now.",
    open: "Open on MonadScan",
  },
  verify: {
    title: "Verify it yourself",
    steps: [
      ["Run a free preview", "Every scenario in the console runs as an eth_call first: nothing is signed or sent."],
      ["Prove it on chain", "“Prove on-chain” sends the same scenario as a transaction. The cost is shown before you send; on testnet the sponsor pays for the burner wallet."],
      ["Read the event", "The receipt carries SimulationDone, MonteCarloDone or GuardChecked with the totals. Open it on MonadScan."],
      ["Check the code", "The contracts are verified on Sourcify and MonadVision, and the source is on GitHub."],
      ["Rebuild the data", "The scripts in the repository re-scan the Borrow events, re-read the positions and re-load the books."],
    ] as [string, string][],
    console: "Open the console",
    contracts: "Contracts",
    roles: {
      kaskad: "Engine and position books (calibrated books)",
      kaskadMC: "Engine with arbitrage recovery and Monte Carlo (real books)",
      guard: "Circuit breaker for market B",
      marketA: "Demo lending market, unprotected",
      marketB: "Demo lending market, guarded",
    },
  },
  security: {
    title: "Security and tests",
    items: [
      "Only the owner can write books or settings (Ownable2Step). simulate writes only the caller's own record. No delegatecall, no proxies, no ETH custody.",
      "Foundry unit, fuzz and invariant tests. Invariants: the price never rises during a shock; liquidated ≤ debt; bad debt + stuck debt ≤ debt; simulate never changes the book; Monte Carlo memory does not grow with the number of paths.",
      "Slither findings reviewed one by one.",
      "Keys stay on the server. The browser talks to an allow-listed RPC proxy; the gas sponsor is rate-limited and keeps a reserve.",
    ] as string[],
    source: "Source code on GitHub",
  },
};

export type HowMessages = typeof en;

const tr = {
  meta: {
    title: "Nasıl çalışır",
    description: "Kaskad'ın modeli, verisi, varsayımları ve zincirdeki kanıtları.",
  },
  hero: {
    kicker: "Nasıl çalışır",
    title: "Her rakamın izi zincirde.",
    lead: (v: { shock: Stat }) =>
      `Kaskad, “bu varlık ${v.shock} düşerse ne olur?” sorusunu zincirde cevaplar: gerçek Aave borçlularının anlık görüntüsü üzerinde likidasyon kaskadını tek bir Monad işleminde yeniden oynatır. Bu sayfa modeli, veriyi, varsayımları ve her rakamı kendin nasıl doğrulayacağını anlatır.`,
  },
  toc: {
    label: "Bu sayfada",
    cascade: "Kaskad",
    method: "Yöntem",
    data: "Veri",
    assumptions: "Varsayımlar",
    monad: "Neden Monad",
    proofs: "Kanıtlar",
    verify: "Kendin doğrula",
    security: "Güvenlik ve testler",
  },
  cascade: {
    title: "Tek işlemde kaskad",
    intro: "Bir fiyat şoku bir döngü başlatır. Kaskad bu döngünün tamamını tek bir işlemde çalıştırır ve sonucu zincire yazar.",
    loopLabel: "Likidasyon döngüsü",
    loop: [
      ["Fiyat düşer", "Teminat fiyatı şok yolu boyunca blok blok düşer."],
      ["Pozisyonlar eşiği geçer", "Sağlık faktörü 1'in altına inen borçlular likide edilebilir hale gelir."],
      ["Likidatörler satar", "Borcu öder, teminata bonusla el koyar ve havuza satarlar."],
      ["Satış fiyatı iter", "Her satış havuz fiyatını düşürür; oracle havuzu izliyorsa bu düşüş sonraki dalgayı başlatır."],
    ] as [string, string][],
    again: "ve yeniden, dalga dalga",
    pipelineLabel: "Anlık görüntüden sonuca",
    pipeline: [
      ["Envio HyperSync", "Monad mainnet'teki Aave'nin tüm Borrow event'leri"],
      ["Anlık görüntü", "Pozisyonlar tek blokta multicall ile okunur"],
      ["Monad testnet", "Defter ve motor kontratları"],
      ["Tek işlem", "Kaskadın tamamı, her dalga"],
      ["Event'ler", "Sonuç MonadScan'de, kontratlar okuyabilir"],
      ["Guard ve arayüz", "Bir kontrat tepki verir; insanlar burada okur"],
    ] as [string, string][],
  },
  method: {
    title: "Yöntem",
    items: {
      book: { term: "Defter", def: "Her pozisyon 32 byte'lık tek bir depolama slotuna paketlenir; varlık başına ardışık tutulur, böylece okumalar aynı MIP-8 sayfasında kalır." },
      shock: {
        term: "Şok",
        def: (v: { steps: Stat; rounds: Stat; maxSteps: Stat; maxRounds: Stat }) =>
          `Teminat fiyatı belli sayıda blok boyunca düşer (varsayılan ${v.steps}, en fazla ${v.maxSteps}). Her blokta likidatörler en fazla ${v.rounds} dalga halinde çalışır (üst sınır ${v.maxRounds}).`,
      },
      rules: {
        term: "Likidasyon kuralları",
        def: (v: { closeFactor: Stat; hf: Stat; small: Stat }) =>
          `Aave v3.3: bir likidasyonda ödenen borç oranı ${v.closeFactor}; sağlık faktörü ${v.hf} altındaysa ya da borç veya teminat ${v.small} altındaysa borcun tamamı ödenir. E-Mode eşik ve bonusları uygulanır. Bekleyen pozisyonlar bellekte, likidasyon fiyatına göre sıralı bir max-heap'te tutulur; hiçbir dalga defteri baştan taramaz.`,
      },
      market: {
        term: "Piyasa",
        def: "El konulan teminat, ölçülen DEX derinliğinde sanal bir sabit çarpım (x·y=k) havuzuna satılır. Likidatör yalnızca işlem başa baş kaldığı noktaya kadar satar; ötesinde pozisyon bekler. Bloklar arasında arbitraj, havuzu varlık başına varsayılan bir oranla dış fiyata doğru geri çeker.",
      },
      oracle: {
        term: "Oracle",
        def: "Varsayılan olarak oracle dış fiyatı (Chainlink ya da varlığın kuru) izler; Aave'nin kullandığı budur. Oracle'ın DEX havuzunu izlediği mod en kötü durum olarak etiketlenir.",
      },
      outputs: {
        term: "Çıktılar",
        def: "Karşılıksız borç (bad debt), tüm teminat satıldıktan sonra kalan açıktır; sonunda mevduat sahipleri öder. Anında likide edilemeyen borç, eşiğin altında olduğu halde hiçbir anında-satış likidatörünün kârla kapatamadığı pozisyonların borcudur; fiyat biraz daha düşerse karşılıksız borca dönüşür. İkisi de her dalgada kaydedilir.",
      },
    },
    oracleCheck: (
      <>
        Aave&apos;nin Monad&apos;daki syrupUSDC oracle&apos;ı DEX&apos;i değil Maple kurunu okur. Bu zincirden doğrulandı: kaynak{" "}
        {code("Capped SyrupUSDC / USDC / USD")}, yani bir {code("RATIO_PROVIDER")} çarpı USDC/USD.
      </>
    ) as ReactNode,
  },
  data: {
    title: "Veri",
    borrowers: (v: { block: Stat; borrowers: Stat; debt: Stat; supplied: Stat }) => (
      <>
        Monad mainnet&apos;teki Aave Pool&apos;un tüm {code("Borrow")} event&apos;leri Envio HyperSync ile tarandı (borçlu ={" "}
        {code("onBehalfOf")}). Pozisyonlar ardından tek bir blokta, {v.block}, multicall ile okundu: borcu olan {v.borrowers}{" "}
        borçlu, {v.supplied} mevduata karşı {v.debt} borç. Borçlu toplamları rezerv toplamlarıyla tutuyor, modelin sağlık
        faktörleri zincirdeki değerlerle eşleşiyor.
      </>
    ),
    depthsTitle: "Çıkış havuzları ve toparlanma",
    depthsNote: "Derinliğin ölçülemediği yerde varsayım kullanıldı ve her ekran bunu söylüyor.",
    columns: { asset: "Varlık", book: "Defter", debt: "Borç", depth: "Havuz derinliği", recovery: "Blok başına arbitraj toparlanması" },
    chain: { monad: "Monad", ethereum: "Ethereum, Monad'da simüle" },
    noRecovery: "yok",
    fullNote: "Kaynak notunun tamamı",
    ethereum:
      "Karşılaştırma için Ethereum'daki Aave V3 Core borçluları aynı yöntemle okundu ve Monad'daki aynı motora yüklendi (salt okuma; Ethereum'a hiçbir şey gönderilmedi).",
    calibrated: (v: { n: Stat; asset: string }) =>
      `Ölçek testi için gerçek ${v.asset} sağlık faktörü dağılımından ${v.n} pozisyonluk sentetik bir defter örneklendi; gerçek defterin toplam borcu korundu. Bunun üzerine kurulan her şey sentetik olarak etiketli.`,
  },
  assumptions: {
    title: "Varsayımlar ve sınırlar",
    items: (v: { steps: Stat; block: Stat; maturity: Stat | null }) =>
      [
        "Tek çıkış: model, anında satış yapan (flash-loan) bir likidatörle tek bir Monad DEX havuzuna satar. Maple itfası ve diğer piyasalar hariçtir.",
        "Anında likide edilemeyen borç bir Aave kuralı değil, likidatör ekonomisidir: teminatı tutup sonra itfa eden likidatörler bunu kapatabilir.",
        "Baskın teminat: şoku her pozisyonun en büyük teminatı alır; diğer teminatları fiyatını korur.",
        "Havuz, likiditeye göre boyutlanmış bir sabit çarpım vekilidir; ölçülmüş bir kayma eğrisi değildir.",
        "Bloklar arası arbitraj toparlanması varlık başına bir varsayımdır ve gerekçesiyle gösterilir.",
        `Kısa pencere: varsayılan şok ${v.steps} blokta oynar. Saatlere yayılan depeg'ler modellenmez.`,
        `Defter, ${v.block} bloğunda alınmış bir anlık görüntüdür; canlı pozisyonlar değildir.`,
        ...(v.maturity ? [`PT-AUSD ${v.maturity} tarihinde vadesine erer; bu tarih yaklaştıkça fiyatı 1'e yakınsar.`] : []),
        "Kontratlar Monad testnet'te çalışır; pozisyonlar mainnet'ten gelir.",
      ] as string[],
  },
  monad: {
    title: "Neden Monad",
    intro: "Kaskadın tamamı tek bir işleme sığmalı ve her pozisyon bir depolama okumasıdır. Monad'ın farkı burada:",
    gas: (v: { monad: Stat; eth: Stat }) => `İşlem başına gas: Monad'da ${v.monad}, Ethereum'da ${v.eth} (EIP-7825 tavanı).`,
    reads: (v: { monad: Stat; eth: Stat; slots: Stat }) =>
      `Bir pozisyonu okumak: Monad'da yaklaşık ${v.monad} gas (sıcak okuma artı bir sayfanın ${v.slots} slotuna paylaştırılan MIP-8 sayfa maliyeti), Ethereum'da soğuk okuma için ${v.eth}.`,
    proof: (v: { n: Stat; gas: Stat; share: Stat; eth: Stat; ratio: Stat }) =>
      `${v.n} pozisyonluk kaskad (sentetik defter) zincirde ${v.gas} gas kullandı; Monad limitine oranı ${v.share}. Aynı çalışmanın Ethereum'daki tahmini ${v.eth} gas, tavana oranı ${v.ratio}: orada tek işleme sığmaz.`,
    proofMissing: "Ölçek kanıtı şu an RPC'den okunamadı; yukarıdaki sınırlar yine geçerli.",
    estimateNote: (v: { cold: Stat }) =>
      `Ethereum rakamı: ölçülen Monad çalışmasından bir tahmin (soğuk okuma başına ${v.cold} gas ve karesel bellek maliyeti).`,
    sync: (
      <>
        Kanıtlar {code("eth_sendRawTransactionSync")} ile gönderilir; receipt aynı çağrıda döner.
      </>
    ) as ReactNode,
  },
  proofs: {
    title: "Zincirdeki kanıtlar",
    intro: "Kanıt olarak gönderilen işlemler, bu sayfa oluşturulurken Monad testnet'ten geri okundu: senaryo çağrı verisinden, sonuç event'ten.",
    columns: { when: "Tarih", what: "Senaryo", result: "Kaydedilen sonuç", gas: "Motor gas'ı", tx: "İşlem" },
    oracle: { external: "dış fiyat", pool: "oracle havuzu izler (en kötü durum)" },
    book: { real: "gerçek defter", synthetic: "sentetik defter" },
    cascade: (v: { asset: string; shock: Stat; oracle: string; book: string; positions: Stat }) =>
      `${v.asset} ${v.shock}, ${v.book} (${v.positions} pozisyon), ${v.oracle}`,
    monteCarlo: (v: { paths: Stat; positions: Stat; oracle: string }) =>
      `Monte Carlo: ${v.paths} rastgele şok yolu × ${v.positions} pozisyon, ${v.oracle}`,
    guard: "KaskadGuard.refresh(): kayıtlı senaryosunu motorda çalıştırır",
    cascadeResult: (v: { liquidated: Stat; bad: Stat }) => `Likide edilen ${v.liquidated} · karşılıksız borç ${v.bad}`,
    monteCarloResult: (v: { mean: Stat; p95: Stat; worst: Stat }) => `Karşılıksız borç ortalama ${v.mean} · p95 ${v.p95} · en kötü ${v.worst}`,
    guardResult: (v: { ratio: Stat; tripped: boolean }) =>
      v.tripped ? `Karşılıksız borcun deftere oranı ${v.ratio}: B piyasasında borç durduruldu` : `Karşılıksız borcun deftere oranı ${v.ratio}: eşiğin altında`,
    failed: "Şu an RPC'den okunamadı.",
    open: "MonadScan'de aç",
  },
  verify: {
    title: "Kendin doğrula",
    steps: [
      ["Ücretsiz önizleme", "Konsoldaki her senaryo önce eth_call olarak çalışır: hiçbir şey imzalanmaz ya da gönderilmez."],
      ["Zincirde kanıtla", "“Zincirde kanıtla” aynı senaryoyu işlem olarak gönderir. Maliyet göndermeden önce gösterilir; testnet'te geçici cüzdanın gas'ını sponsor öder."],
      ["Event'i oku", "Receipt, toplamlarla birlikte SimulationDone, MonteCarloDone ya da GuardChecked taşır. MonadScan'de aç."],
      ["Kodu kontrol et", "Kontratlar Sourcify ve MonadVision'da doğrulandı; kaynak kod GitHub'da."],
      ["Veriyi yeniden üret", "Repodaki script'ler Borrow event'lerini yeniden tarar, pozisyonları yeniden okur ve defterleri yeniden yükler."],
    ] as [string, string][],
    console: "Konsolu aç",
    contracts: "Kontratlar",
    roles: {
      kaskad: "Motor ve pozisyon defterleri (kalibre defterler)",
      kaskadMC: "Arbitraj toparlanması ve Monte Carlo'lu motor (gerçek defterler)",
      guard: "B piyasası için devre kesici",
      marketA: "Demo borç piyasası, korumasız",
      marketB: "Demo borç piyasası, Guard korumalı",
    },
  },
  security: {
    title: "Güvenlik ve testler",
    items: [
      "Defterlere ve ayarlara yalnızca owner yazabilir (Ownable2Step). simulate yalnızca çağıranın kendi kaydına yazar. delegatecall, proxy ya da ETH saklama yok.",
      "Foundry birim, fuzz ve invariant testleri. Invariant'lar: şok sırasında fiyat hiç artmaz; likide edilen ≤ borç; karşılıksız + anında likide edilemeyen ≤ borç; simulate defteri hiç değiştirmez; Monte Carlo belleği yol sayısıyla büyümez.",
      "Slither bulguları tek tek incelendi.",
      "Anahtarlar sunucuda kalır. Tarayıcı, izinli metodları geçiren bir RPC proxy'siyle konuşur; gas sponsoru hız sınırlıdır ve rezerv tutar.",
    ] as string[],
    source: "GitHub'da kaynak kod",
  },
} satisfies HowMessages;

export const howMessages: Record<Locale, HowMessages> = { en, tr };
