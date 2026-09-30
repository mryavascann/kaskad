/**
 * Copy of the protocol console (/app, /tr/app). Every amount, ratio, count, date and shock is a
 * parameter: presets come from `presetFacts()`, results from the engine preview, books from
 * deployment.json. Sentences that carry numbers are functions of already formatted strings.
 */
import type { ReactNode } from "react";
import type { ConnectErrorCode } from "@/lib/chain/status";
import type { PresetId } from "@/lib/chain/scenario";
import type { GasGaugeCopy } from "@/viz/gas-gauge";
import type { MonteCarloCopy } from "@/viz/monte-carlo-chart";
import type { PositionsCopy } from "@/viz/position-tiles";
import type { StressCurveCopy } from "@/viz/stress-curve";
import type { WaveTimelineCopy } from "@/viz/wave-timeline";
import type { Locale } from "../config";

type S = string;
const accent = (s: string) => <em className="font-serif font-normal tracking-[-0.02em] text-fg-2">{s}</em>;
const en_ = (s: string) => <span lang="en">{s}</span>;

/** Preset facts already formatted for copy (see views/console/presets.ts). */
export type PresetText = {
  symbol: S;
  shock: S;
  debt: S;
  depth: S;
  depthToDebt: S;
  positions: S;
  days: S | null;
  chain: "monad" | "ethereum";
};

/** Narrative facts already formatted (lib/chain/narrative.ts NarrativeFacts, per locale). */
export type NarrativeText =
  | { kind: "no-liquidations"; symbol: S; steps: S; shock: S }
  | {
      kind: "cascade";
      symbol: S;
      steps: S;
      shock: S;
      liquidations: S;
      depth: S;
      oracle: { kind: "spiral"; start: S; end: S; drop: S } | { kind: "external"; arbitrage: "recovers" | "thin"; recovery: S };
      bad: S | null;
      total: S;
      stuck: S | null;
    };

const en = {
  meta: {
    title: "Console",
    description:
      "Shock a real Aave book and watch every liquidation wave, free as a preview, then prove the whole cascade on Monad in one transaction.",
  },
  hero: {
    kicker: "Console · Monad testnet",
    title: (<>Shock the book. {accent("Watch")} the waves.</>) as ReactNode,
    lead: "Pick a scenario, move the shock and read the cascade as it happens: every preview is a free eth_call against the real positions. When it looks right, prove the whole run on chain in one transaction.",
  },
  market: {
    label: "Real data · Monad mainnet Aave" as ReactNode,
    labelText: "Real data · Monad mainnet Aave",
    supplied: "Total supplied",
    debt: "Total debt",
    borrowers: "Borrowers with debt",
    focus: (v: { symbol: S }) => `${v.symbol} collateral`,
    focusCaption: (v: { lt: S }) => `${v.lt} liquidation threshold`,
    source: (v: { block: S }): ReactNode => `Block ${v.block} · Envio HyperSync + multicall`,
  },
  signer: {
    title: "Signer",
    region: "Signer and gas",
    active: "Paying with",
    kinds: { burner: "Temporary wallet (sponsored)", injected: "Browser wallet", mera: "Mera passkey" } as Record<"burner" | "injected" | "mera", S>,
    balance: "Balance",
    sponsor: "Sponsor budget",
    sponsorCaption: (v: { reserve: S | null }) => (v.reserve ? `spendable, ${v.reserve} reserve excluded` : "spendable"),
    sponsorLow: "Running low: switch to your own wallet to keep proving.",
    sponsorUnavailable: "Sponsor not configured here",
    connect: "Switch signer",
    injected: "Browser wallet",
    meraLogin: "Mera: sign in",
    meraCreate: "Mera: new passkey",
    burner: "Back to the temporary wallet",
    faucet: "Get testnet MON",
    free: "Previews are free and need no wallet. Only “Prove on chain” sends a transaction.",
    addressLink: (v: { address: S }) => `${v.address} on MonadScan`,
    errors: {
      "no-wallet": "No browser wallet found.",
      rejected: "The request was rejected in the wallet.",
      failed: "Could not connect the wallet.",
    } as Record<ConnectErrorCode, S>,
    feesTitle: "Signing and fees",
    fees: "Every button that sends a transaction shows its cost first. Monad charges the gas limit, not the gas used. With a browser wallet you approve each transaction yourself. Mera and the temporary wallet sign directly and get the receipt with eth_sendRawTransactionSync; the Mera key is derived from your passkey and kept only in memory. All costs are testnet MON.",
  },
  inputs: {
    title: "Scenario",
    presets: "Presets",
    presetTitle: {
      ufak: () => "Small tremor",
      sali: () => "Tuesday depeg",
      worst: () => "Worst case: pool oracle",
      pt: () => "PT maturity rush",
      "maple-eth": () => "Same loop, on Ethereum",
      eth: (p: PresetText) => `ETH drops ${p.shock}`,
      derin: () => "Deep pool: USDC",
      stres: (p: PresetText) => `${p.positions} positions`,
    } as Record<PresetId, (p: PresetText) => S>,
    presetLine: {
      ufak: (p: PresetText) => `${p.symbol} · ${p.shock}`,
      sali: (p: PresetText) => `${p.symbol} · ${p.shock} depeg`,
      worst: (p: PresetText) => `${p.symbol} · ${p.shock} · pool oracle`,
      pt: (p: PresetText) => `${p.symbol} · ${p.shock}`,
      "maple-eth": (p: PresetText) => `${p.symbol} · Ethereum Aave`,
      eth: (p: PresetText) => `${p.symbol} · ${p.shock}`,
      derin: (p: PresetText) => `${p.symbol} · ${p.shock}`,
      stres: () => "Calibrated book",
    } as Record<PresetId, (p: PresetText) => S>,
    presetStory: {
      ufak: (p: PresetText) => `${p.symbol} slips ${p.shock} on the market. Does even this much start anything?`,
      sali: (p: PresetText) =>
        `${p.symbol} drops ${p.shock}. The pool liquidators sell into holds ${p.depth} against ${p.debt} of debt: too shallow to clear it.`,
      worst: (p: PresetText) =>
        `The same ${p.shock}, but the oracle follows the instant DEX price (a design open to manipulation): every sale pushes the price lower.`,
      pt: (p: PresetText) =>
        p.days !== null ? `${p.symbol}, ${p.days} days before maturity, slips to a ${p.shock} discount.` : `${p.symbol} slips to a ${p.shock} discount.`,
      "maple-eth": (p: PresetText) =>
        `Borrowers of ${p.symbol} on Ethereum Aave: the same Maple loop, ${p.debt} of debt. Still computed on Monad.`,
      eth: (p: PresetText) => `The classic position: deposit ETH, borrow stablecoins. ${p.debt} of debt on Ethereum Aave, and ETH drops ${p.shock}.`,
      derin: (p: PresetText) => `${p.symbol} collateral on Ethereum drops ${p.shock}. Its pool is ${p.depthToDebt} deeper than the debt at risk.`,
      stres: (p: PresetText) => `${p.positions} positions calibrated to the real distribution, run in one transaction.`,
    } as Record<PresetId, (p: PresetText) => S>,
    selected: "Selected",
    custom: "Custom scenario: no preset matches these settings.",
    asset: "Collateral",
    featuredNote: "Monad Aave",
    others: "Other books",
    othersPlaceholder: "Choose another book",
    chain: { monad: "Monad", ethereum: "Ethereum" } as Record<"monad" | "ethereum", S>,
    shock: "Price drop",
    chips: "Quick shocks",
    oracle: "Oracle",
    oracleExternal: "External price",
    oracleExternalNote: "Realistic: the oracle follows the external / Maple rate, like Aave",
    oraclePool: "Pool price",
    oraclePoolNote: "Worst case: the oracle follows the pool the liquidators sell into",
    advanced: "Advanced",
    steps: "Duration",
    stepsValue: (v: { n: S }) => `${v.n} blocks`,
    rounds: "Waves per block",
    book: "Book",
    bookReal: (v: { n: S }) => `Real · ${v.n}`,
    bookCalibrated: (v: { n: S }) => `Calibrated · ${v.n}`,
    resolution: "Resolution (positions)",
  },
  honesty: {
    title: "What this run assumes",
    tags: { real: "Aave data", synthetic: "Synthetic", model: "Model", simulated: "Simulated" },
    depth: "Pool depth",
    measured: "Measured",
    assumption: "Assumption",
    more: "Full source",
    recovery: "Arbitrage recovery",
    recoveryValue: (v: { pct: S }) => `${v.pct} of the gap per block`,
    recoveryNone: "No recovery assumed: nothing refills the pool between blocks.",
    ethereum: "Ethereum data · simulated on Monad",
    ethereumNote: "This book was read from Aave on Ethereum; the cascade itself runs on the Monad engine.",
    maturity: (v: { symbol: S; date: S; days: S }) => `${v.symbol} matures on ${v.date} (${v.days} days left)`,
    matured: (v: { symbol: S; date: S }) => `${v.symbol} matured on ${v.date}`,
    realMonad: (v: { borrowers: S }) => `Real book · Monad Aave, ${v.borrowers} borrowers`,
    realMonadNote: (v: { positions: S; symbol: S; block: S }) => `${v.positions} positions hold ${v.symbol} as collateral at block ${v.block}.`,
    realEthereum: (v: { positions: S }) => `Real book · Ethereum Aave, ${v.positions} positions`,
    synthetic: (v: { positions: S }) => `Synthetic sample · ${v.positions} positions`,
    syntheticNote: "Positions generated to match the real distribution; amounts are scaled to the full book's debt.",
    oracle: { external: "Oracle: external price (realistic)", pool: "Oracle: pool price (worst case)" } as Record<"external" | "pool", S>,
    oracleNote: {
      external: "Sales do not move the oracle, so there is no spiral; the pool's refill decides whether liquidators keep selling.",
      pool: "Every liquidation sale moves the oracle, which triggers the next wave. A design choice to avoid, shown as the upper bound.",
    } as Record<"external" | "pool", S>,
  },
  stage: {
    title: "Result",
    status: { loading: "Computing the preview", ready: "Preview ready", error: "Preview failed" },
    context: (v: { symbol: S; shock: S; oracle: S; book: S; steps: S }) => `${v.symbol} ${v.shock} · ${v.oracle} · ${v.book} · ${v.steps}`,
    contextOracle: { external: "external price", pool: "pool price, worst case" } as Record<"external" | "pool", S>,
    contextBook: (v: { kind: "real" | "calibrated"; n: S }) => (v.kind === "real" ? `real book, ${v.n} positions` : `synthetic, ${v.n} positions`),
    badDebt: "Bad debt",
    badDebtHelp: "Debt left uncovered even after all collateral is sold. Depositors eat it.",
    stuck: "Debt that can't be liquidated instantly",
    stuckHelp: "Positions under HF 1 at the end that no instant-sale liquidator can clear at a profit: the pool is too thin.",
    share: (v: { pct: S }) => `${v.pct} of total debt`,
    scaled: "scaled to the full book",
    loading: "Loading",
    positions: "Positions",
    positionsCalibrated:
      "Per-position tiles need the real book: this run uses the synthetic sample, so only the totals above are exact. Switch the book to real to see every position.",
    positionsTooLarge: "This book is too large to read position by position in the browser; the totals above are exact.",
    timeline: "Cascade, block by block",
    play: "Play",
    pause: "Pause",
    replay: "Replay",
    toStart: "Block 0",
    narrative: "What happened?",
    stats: "Run statistics",
    liquidated: "Liquidated",
    totalDebt: "Total debt",
    liquidations: "Liquidations",
    liquidationsValue: (v: { liquidations: S; waves: S }) => `waves: ${v.waves}`,
    finalPrice: "Final price",
    finalPriceCaption: (v: { drop: S }) => `${v.drop} from the start`,
    announce: (v: { bad: S; stuck: S }) => `Preview ready. Bad debt ${v.bad}. Debt that can't be liquidated instantly ${v.stuck}.`,
    errorTitle: "The preview failed",
    errorBody: "The RPC did not answer or the call reverted. Nothing was spent. Change a setting or try again in a moment.",
    outOfGasTitle: "Doesn't fit in one transaction",
    outOfGasBody: (v: { limit: S }) => `This run needs more than the ${v.limit} gas of one Monad transaction. Lower the resolution or the waves per block.`,
  },
  prove: {
    title: "Prove it on chain",
    body: "The same scenario as a real transaction: the engine runs the whole cascade inside it and emits SimulationDone. Anyone can check it on MonadScan.",
    cta: "Prove on chain",
    badgePreview: (v: { ms: S; positions: S }) => `${v.ms} · ${v.positions} positions`,
    badgePreviewNote: "free eth_call preview, nothing written",
    badgeTx: (v: { ms: S; positions: S }) => `1 tx · ${v.ms} · ${v.positions} positions`,
    badgeTxNote: "on-chain time of the transaction",
    waiting: "Waiting for the preview",
    open: "MonadScan",
  },
  tabs: {
    label: "Deeper analysis",
    mc: "Monte Carlo",
    stress: "Stress curve",
    networks: "Two networks",
  },
  mc: {
    title: "Many random paths, one call",
    body: (v: { mean: S; multiple: S }) =>
      `Each path draws its own final drop around the scenario's shock: mean ${v.mean}, at most ${v.multiple}× it, along a random price path. Always the real book.`,
    k: "Paths (K)",
    unavailable: "Monte Carlo is not deployed on this network.",
    tooLarge: (v: { limit: S }) => `This K does not fit in ${v.limit} gas. Lower K.`,
    findLimit: "Find the limit",
    limit: (v: { k: S; limit: S }) => `Largest K that fits in ${v.limit} gas: ${v.k}`,
    limitNote: "binary search over free eth_calls",
    useLimit: "Use it",
    gas: "Gas",
    gasValue: (v: { gas: S; limit: S }) => `${v.gas} of ${v.limit}`,
    memory: "Memory",
    scenarios: "Position-scenarios",
    scenariosValue: (v: { paths: S; positions: S; total: S }) => `${v.paths} × ${v.positions} = ${v.total}`,
    memoryNote: "Memory barely grows with K: each path adds a few words. Gas is the limit.",
    prove: "Prove the paths on chain",
    proved: (v: { paths: S }) => `${v.paths} paths computed on chain.`,
  },
  stress: {
    title: "Bad debt against the shock",
    body: (v: { symbol: S; count: S }) => `${v.symbol}, real book, both oracle modes at ${v.count} shock levels. The marker is your current shock.`,
    free: "Free · one eth_call per oracle mode",
  },
  networks: {
    title: "The same shock on books from both chains",
    body: "Every row runs on the Monad engine with the same shock, oracle and path; only the book changes.",
    book: "Book",
    debt: "Debt",
    depth: "Pool depth",
    ratio: "Depth / debt",
    ratioHelp: "How deep the pool liquidators sell into is, relative to the debt at risk.",
    bad: "Bad debt",
    stuck: "Stuck",
    failed: "Failed",
    thin: "thin",
    roles: {
      "same-maple-loop": "the same Maple loop",
      "same-asset-deep-pool": "same asset, deep pool",
      "deep-liquidity-reference": "deep-liquidity reference",
      "eth-collateral-stable-debt": "ETH in, stablecoins borrowed",
      "same-classic-position": "the same classic position",
    } as Record<string, S>,
    params: (v: { shock: S; oracle: S }) => `${v.shock} · ${v.oracle} · computed on Monad`,
    note: (v: { usdeDepth: S; usdeDebt: S; usdc: S }) =>
      `Depth only matters relative to the debt at risk. The USDe pool on Ethereum is ${v.usdeDepth} deeper than on Monad, but the debt on it is ${v.usdeDebt} larger too. The USDC pool on Ethereum is ${v.usdc} its debt: liquidation sales barely move it.`,
    gauge: "Could it run as one transaction?",
    gaugeBody: "The current scenario's gas: measured on Monad, estimated for Ethereum (cold storage reads and quadratic memory instead of Monad's page reads).",
  },
  footnote: {
    label: "Model",
    body: "A single Monad DEX pool per asset and an instant sale (a flash-loan liquidator that must break even). Maple redemptions, other markets and off-chain exits are excluded.",
  },
  charts: {
    timeline: {} as Partial<WaveTimelineCopy>,
    positions: {} as Partial<PositionsCopy>,
    stress: {} as Partial<StressCurveCopy>,
    mc: {} as Partial<MonteCarloCopy>,
    gauge: {} as Partial<GasGaugeCopy>,
  },
};

export type ConsoleMessages = typeof en;

/** "What happened?" in English. */
function narrativeEn(n: NarrativeText): S {
  if (n.kind === "no-liquidations")
    return `${n.symbol} drops ${n.shock} over ${n.steps} blocks, yet no position reaches its liquidation threshold. The protocol takes this shock without a loss.`;
  let t = `${n.symbol} drops ${n.shock} over ${n.steps} blocks and liquidations start (${n.liquidations} in total): liquidators repay debt and sell the seized collateral into a pool ${n.depth} deep. `;
  t +=
    n.oracle.kind === "spiral"
      ? `The oracle follows that pool, so every sale pushes the price lower and triggers new liquidations: ${n.oracle.start} → ${n.oracle.end} (${n.oracle.drop}). `
      : `The oracle follows the external price (Chainlink / exchange rate), so the sales don't move it and there is no spiral. ${
          n.oracle.arbitrage === "recovers"
            ? `Arbitrage pulls the pool back toward that price every block (${n.oracle.recovery} assumed), so liquidators can keep selling. `
            : "But almost nothing refills the pool from outside: past a point a liquidator would sell at a loss, so the selling stops. "
        }`;
  t += n.bad ? `Result: ${n.bad} of ${n.total} debt is left uncovered. The protocol, meaning its depositors, pays for it.` : "Result: no bad debt.";
  if (n.stuck) t += ` But ${n.stuck} of debt waits unliquidated; a slightly deeper drop turns it into bad debt too.`;
  return t;
}

const tr = {
  meta: {
    title: "Konsol",
    description:
      "Gerçek bir Aave defterine şok uygula, her likidasyon dalgasını ücretsiz önizlemede izle, sonra tüm kaskadı Monad'da tek işlemle kanıtla.",
  },
  hero: {
    kicker: "Konsol · Monad testnet",
    title: (<>Defteri sars. Dalgaları {accent("izle")}.</>) as ReactNode,
    lead: "Bir senaryo seç, şoku kaydır ve kaskadı anında oku: her önizleme gerçek pozisyonlar üzerinde ücretsiz bir eth_call. Sonuç hazır olduğunda tüm çalıştırmayı tek işlemle zincirde kanıtla.",
  },
  market: {
    label: <>Gerçek veri · {en_("Monad mainnet Aave")}</>,
    labelText: "Gerçek veri · Monad mainnet Aave",
    supplied: "Toplam teminat",
    debt: "Toplam borç",
    borrowers: "Borçlu pozisyon",
    focus: (v: { symbol: S }) => `${v.symbol} teminatı`,
    focusCaption: (v: { lt: S }) => `${v.lt} likidasyon eşiği`,
    source: (v: { block: S }): ReactNode => (
      <>
        Blok {v.block} · {en_("Envio HyperSync + multicall")}
      </>
    ),
  },
  signer: {
    title: "İmzalayan",
    region: "İmzalayan ve gas",
    active: "Ödeyen",
    kinds: { burner: "Geçici cüzdan (sponsorlu)", injected: "Tarayıcı cüzdanı", mera: "Mera passkey" } as Record<"burner" | "injected" | "mera", S>,
    balance: "Bakiye",
    sponsor: "Sponsor bütçesi",
    sponsorCaption: (v: { reserve: S | null }) => (v.reserve ? `harcanabilir, ${v.reserve} rezerv hariç` : "harcanabilir"),
    sponsorLow: "Bütçe azalıyor: kanıtlamaya kendi cüzdanınla devam et.",
    sponsorUnavailable: "Sponsor burada ayarlı değil",
    connect: "İmzalayanı değiştir",
    injected: "Tarayıcı cüzdanı",
    meraLogin: "Mera: giriş yap",
    meraCreate: "Mera: yeni passkey",
    burner: "Geçici cüzdana dön",
    faucet: "Testnet MON al",
    free: "Önizlemeler ücretsiz ve cüzdan gerektirmez. Yalnızca “Zincirde kanıtla” işlem gönderir.",
    addressLink: (v: { address: S }) => `${v.address} MonadScan'de`,
    errors: {
      "no-wallet": "Tarayıcı cüzdanı bulunamadı.",
      rejected: "İstek cüzdanda reddedildi.",
      failed: "Cüzdan bağlanamadı.",
    } as Record<ConnectErrorCode, S>,
    feesTitle: "İmzalama ve ücretler",
    fees: "İşlem gönderen her düğme önce maliyetini gösterir. Monad gas ücretini kullanılan gas'tan değil limitten keser. Tarayıcı cüzdanında her işlemi kendin onaylarsın. Mera ve geçici cüzdan doğrudan imzalar ve receipt'i eth_sendRawTransactionSync ile alır; Mera anahtarı passkey'inden türetilir ve yalnızca bellekte durur. Tüm maliyetler testnet MON cinsindendir.",
  },
  inputs: {
    title: "Senaryo",
    presets: "Hazır senaryolar",
    presetTitle: {
      ufak: () => "Ufak sarsıntı",
      sali: () => "Salı depegi",
      worst: () => "En kötü durum: havuz oracle",
      pt: () => "PT vade telaşı",
      "maple-eth": () => "Aynı döngü, Ethereum'da",
      eth: (p: PresetText) => `ETH ${p.shock} düşerse`,
      derin: () => "Derin havuz: USDC",
      stres: (p: PresetText) => `${p.positions} pozisyon`,
    } as Record<PresetId, (p: PresetText) => S>,
    presetLine: {
      ufak: (p: PresetText) => `${p.symbol} · ${p.shock}`,
      sali: (p: PresetText) => `${p.symbol} · ${p.shock} depeg`,
      worst: (p: PresetText) => `${p.symbol} · ${p.shock} · havuz oracle`,
      pt: (p: PresetText) => `${p.symbol} · ${p.shock}`,
      "maple-eth": (p: PresetText) => `${p.symbol} · Ethereum Aave`,
      eth: (p: PresetText) => `${p.symbol} · ${p.shock}`,
      derin: (p: PresetText) => `${p.symbol} · ${p.shock}`,
      stres: () => "Kalibre defter",
    } as Record<PresetId, (p: PresetText) => S>,
    presetStory: {
      ufak: (p: PresetText) => `${p.symbol} piyasada ${p.shock} kayıyor. Bu kadarı bile bir şey başlatır mı?`,
      sali: (p: PresetText) =>
        `${p.symbol} ${p.shock} düşüyor. Likidatörlerin sattığı havuzda ${p.debt} borca karşı ${p.depth} var: borcu temizlemeye yetmeyecek kadar sığ.`,
      worst: (p: PresetText) =>
        `Aynı ${p.shock}, ama oracle anlık DEX fiyatını izliyor (manipülasyona açık bir tasarım): her satış fiyatı daha da aşağı itiyor.`,
      pt: (p: PresetText) =>
        p.days !== null ? `Vadesine ${p.days} gün kalan ${p.symbol} ${p.shock} iskontoya düşüyor.` : `${p.symbol} ${p.shock} iskontoya düşüyor.`,
      "maple-eth": (p: PresetText) =>
        `Ethereum Aave'deki ${p.symbol} borçluları: aynı Maple döngüsü, ${p.debt} borç. Hesap yine Monad'da.`,
      eth: (p: PresetText) => `Klasik pozisyon: ETH yatır, stablecoin borç al. Ethereum Aave'de ${p.debt} borç ve ETH ${p.shock} düşüyor.`,
      derin: (p: PresetText) => `Ethereum'da ${p.symbol} teminatı ${p.shock} düşüyor. Havuzu riskteki borçtan ${p.depthToDebt} derin.`,
      stres: (p: PresetText) => `Gerçek dağılıma göre kalibre edilmiş ${p.positions} pozisyon, tek işlemde.`,
    } as Record<PresetId, (p: PresetText) => S>,
    selected: "Seçili",
    custom: "Özel senaryo: bu ayarlara uyan hazır senaryo yok.",
    asset: "Teminat",
    featuredNote: "Monad Aave",
    others: "Diğer defterler",
    othersPlaceholder: "Başka bir defter seç",
    chain: { monad: "Monad", ethereum: "Ethereum" } as Record<"monad" | "ethereum", S>,
    shock: "Fiyat düşüşü",
    chips: "Hızlı şoklar",
    oracle: "Oracle",
    oracleExternal: "Dış fiyat",
    oracleExternalNote: "Gerçekçi: oracle dış / Maple kurunu izler, Aave'deki gibi",
    oraclePool: "Havuz fiyatı",
    oraclePoolNote: "En kötü durum: oracle likidatörlerin sattığı havuzu izler",
    advanced: "Gelişmiş",
    steps: "Süre",
    stepsValue: (v: { n: S }) => `${v.n} blok`,
    rounds: "Blok başına dalga",
    book: "Defter",
    bookReal: (v: { n: S }) => `Gerçek · ${v.n}`,
    bookCalibrated: (v: { n: S }) => `Kalibre · ${v.n}`,
    resolution: "Çözünürlük (pozisyon)",
  },
  honesty: {
    title: "Bu çalıştırmanın varsayımları",
    tags: { real: "Aave verisi", synthetic: "Sentetik", model: "Model", simulated: "Simülasyon" },
    depth: "Havuz derinliği",
    measured: "Ölçüldü",
    assumption: "Varsayım",
    more: "Kaynağın tamamı",
    recovery: "Arbitraj toparlanması",
    recoveryValue: (v: { pct: S }) => `blok başına açığın ${v.pct} kadarı`,
    recoveryNone: "Toparlanma varsayılmıyor: bloklar arasında havuzu dolduran yok.",
    ethereum: "Ethereum verisi · Monad simülasyonu",
    ethereumNote: "Bu defter Ethereum'daki Aave'den okundu; kaskadın kendisi Monad motorunda çalışıyor.",
    maturity: (v: { symbol: S; date: S; days: S }) => `${v.symbol} vadesi ${v.date} (${v.days} gün kaldı)`,
    matured: (v: { symbol: S; date: S }) => `${v.symbol} vadesi ${v.date} tarihinde doldu`,
    realMonad: (v: { borrowers: S }) => `Gerçek defter · Monad Aave, ${v.borrowers} borçlu`,
    realMonadNote: (v: { positions: S; symbol: S; block: S }) => `${v.block} blokunda ${v.positions} pozisyon ${v.symbol} teminatı tutuyor.`,
    realEthereum: (v: { positions: S }) => `Gerçek defter · Ethereum Aave, ${v.positions} pozisyon`,
    synthetic: (v: { positions: S }) => `Sentetik örnek · ${v.positions} pozisyon`,
    syntheticNote: "Pozisyonlar gerçek dağılıma uyacak şekilde üretildi; tutarlar tüm defterin borcuna ölçeklenir.",
    oracle: { external: "Oracle: dış fiyat (gerçekçi)", pool: "Oracle: havuz fiyatı (en kötü durum)" } as Record<"external" | "pool", S>,
    oracleNote: {
      external: "Satışlar oracle'ı oynatmaz, sarmal oluşmaz; likidatörlerin satmaya devam edip etmeyeceğini havuzun dolması belirler.",
      pool: "Her likidasyon satışı oracle'ı oynatır ve bir sonraki dalgayı tetikler. Kaçınılması gereken bir tasarım, üst sınır olarak gösteriliyor.",
    } as Record<"external" | "pool", S>,
  },
  stage: {
    title: "Sonuç",
    status: { loading: "Önizleme hesaplanıyor", ready: "Önizleme hazır", error: "Önizleme başarısız" },
    context: (v: { symbol: S; shock: S; oracle: S; book: S; steps: S }) => `${v.symbol} ${v.shock} · ${v.oracle} · ${v.book} · ${v.steps}`,
    contextOracle: { external: "dış fiyat", pool: "havuz fiyatı, en kötü durum" } as Record<"external" | "pool", S>,
    contextBook: (v: { kind: "real" | "calibrated"; n: S }) => (v.kind === "real" ? `gerçek defter, ${v.n} pozisyon` : `sentetik, ${v.n} pozisyon`),
    badDebt: "Karşılıksız kalan borç",
    badDebtHelp: "Tüm teminat satılsa bile kapanmayan borç açığı. Bunu mevduat sahipleri öder.",
    stuck: "Anında likide edilemeyen borç",
    stuckHelp: "Sonunda HF 1'in altında kalan ve anlık satış yapan hiçbir likidatörün kârla kapatamadığı pozisyonlar: havuz çok sığ.",
    share: (v: { pct: S }) => `toplam borcun ${v.pct} kadarı`,
    scaled: "tüm deftere ölçeklendi",
    loading: "Yükleniyor",
    positions: "Pozisyonlar",
    positionsCalibrated:
      "Pozisyon karoları gerçek defter ister: bu çalıştırma sentetik örneği kullanıyor, yalnızca yukarıdaki toplamlar kesin. Her pozisyonu görmek için defteri gerçeğe çevir.",
    positionsTooLarge: "Bu defter tarayıcıda pozisyon pozisyon okunamayacak kadar büyük; yukarıdaki toplamlar kesin.",
    timeline: "Blok blok kaskad",
    play: "Oynat",
    pause: "Duraklat",
    replay: "Tekrar oynat",
    toStart: "Blok 0",
    narrative: "Ne oldu?",
    stats: "Çalıştırma istatistikleri",
    liquidated: "Likide edilen",
    totalDebt: "Toplam borç",
    liquidations: "Likidasyonlar",
    liquidationsValue: (v: { liquidations: S; waves: S }) => `dalga: ${v.waves}`,
    finalPrice: "Son fiyat",
    finalPriceCaption: (v: { drop: S }) => `başlangıca göre ${v.drop}`,
    announce: (v: { bad: S; stuck: S }) => `Önizleme hazır. Karşılıksız borç ${v.bad}. Anında likide edilemeyen borç ${v.stuck}.`,
    errorTitle: "Önizleme başarısız",
    errorBody: "RPC yanıt vermedi ya da çağrı revert oldu. Hiçbir şey harcanmadı. Bir ayarı değiştir ya da birazdan tekrar dene.",
    outOfGasTitle: "Tek işleme sığmıyor",
    outOfGasBody: (v: { limit: S }) => `Bu çalıştırma bir Monad işleminin ${v.limit} gas sınırını aşıyor. Çözünürlüğü ya da blok başına dalgayı azalt.`,
  },
  prove: {
    title: "Zincirde kanıtla",
    body: "Aynı senaryo gerçek bir işlem olarak: motor tüm kaskadı işlemin içinde çalıştırır ve SimulationDone yayar. Herkes MonadScan'de kontrol edebilir.",
    cta: "Zincirde kanıtla",
    badgePreview: (v: { ms: S; positions: S }) => `${v.ms} · ${v.positions} pozisyon`,
    badgePreviewNote: "ücretsiz eth_call önizlemesi, hiçbir şey yazılmadı",
    badgeTx: (v: { ms: S; positions: S }) => `1 işlem · ${v.ms} · ${v.positions} pozisyon`,
    badgeTxNote: "işlemin zincirdeki süresi",
    waiting: "Önizleme bekleniyor",
    open: "MonadScan",
  },
  tabs: {
    label: "Derin analiz",
    mc: "Monte Carlo",
    stress: "Stres eğrisi",
    networks: "İki ağ",
  },
  mc: {
    title: "Çok sayıda rastgele yol, tek çağrı",
    body: (v: { mean: S; multiple: S }) =>
      `Her yol, senaryonun şoku etrafında kendi son düşüşünü çeker: ortalama ${v.mean}, en fazla ${v.multiple} katı, rastgele bir fiyat yolu boyunca. Her zaman gerçek defter.`,
    k: "Yol sayısı (K)",
    unavailable: "Monte Carlo bu ağda kurulu değil.",
    tooLarge: (v: { limit: S }) => `Bu K ${v.limit} gas'a sığmıyor. K'yı azalt.`,
    findLimit: "Sınırı bul",
    limit: (v: { k: S; limit: S }) => `${v.limit} gas'a sığan en büyük K: ${v.k}`,
    limitNote: "ücretsiz eth_call'larla ikili arama",
    useLimit: "Kullan",
    gas: "Gas",
    gasValue: (v: { gas: S; limit: S }) => `${v.limit} içinde ${v.gas}`,
    memory: "Bellek",
    scenarios: "Pozisyon-senaryo",
    scenariosValue: (v: { paths: S; positions: S; total: S }) => `${v.paths} × ${v.positions} = ${v.total}`,
    memoryNote: "Bellek K ile neredeyse büyümez: her yol birkaç kelime ekler. Sınır gas.",
    prove: "Yolları zincirde kanıtla",
    proved: (v: { paths: S }) => `${v.paths} yol zincirde hesaplandı.`,
  },
  stress: {
    title: "Şoka karşı karşılıksız borç",
    body: (v: { symbol: S; count: S }) => `${v.symbol}, gerçek defter, ${v.count} şok seviyesinde iki oracle modu. İşaret şu anki şokun.`,
    free: "Ücretsiz · oracle modu başına tek eth_call",
  },
  networks: {
    title: "Aynı şok, iki ağın defterlerinde",
    body: "Her satır aynı şok, oracle ve yol ile Monad motorunda çalışır; yalnızca defter değişir.",
    book: "Defter",
    debt: "Borç",
    depth: "Havuz derinliği",
    ratio: "Derinlik / borç",
    ratioHelp: "Likidatörlerin sattığı havuzun, riskteki borca göre derinliği.",
    bad: "Karşılıksız",
    stuck: "Likide edilemeyen",
    failed: "Başarısız",
    thin: "sığ",
    roles: {
      "same-maple-loop": "aynı Maple döngüsü",
      "same-asset-deep-pool": "aynı varlık, derin havuz",
      "deep-liquidity-reference": "derin likidite referansı",
      "eth-collateral-stable-debt": "ETH yatır, stablecoin borç al",
      "same-classic-position": "aynı klasik pozisyon",
    } as Record<string, S>,
    params: (v: { shock: S; oracle: S }) => `${v.shock} · ${v.oracle} · hesap Monad'da`,
    note: (v: { usdeDepth: S; usdeDebt: S; usdc: S }) =>
      `Derinlik tek başına değil, riskteki borca oranla önemli. Ethereum'daki USDe havuzu Monad'dakinden ${v.usdeDepth} derin ama üstündeki borç da ${v.usdeDebt} büyük. Ethereum'daki USDC havuzu ise borcundan ${v.usdc} derin: likidasyon satışları onu neredeyse oynatmıyor.`,
    gauge: "Tek işlem olarak çalışabilir mi?",
    gaugeBody: "Şu anki senaryonun gas'ı: Monad'da ölçüldü, Ethereum için tahmin (Monad'ın sayfa okumaları yerine soğuk depolama okumaları ve karesel bellek).",
  },
  footnote: {
    label: "Model",
    body: "Varlık başına tek bir Monad DEX havuzu ve anlık satış (başa baş kârla çalışan flash-loan likidatör). Maple itfaları, diğer piyasalar ve zincir dışı çıkışlar dahil değil.",
  },
  charts: {
    timeline: {
      label: "Kaskad zaman çizelgesi",
      axisStart: "Blok {block}",
      blockKey: "Blok",
      priceKey: "Oracle fiyatı",
      liquidatedKey: "Likide edilen",
      liquidationsKey: "Likidasyon",
      inBlockKey: "Bu blokta",
      soFarKey: "Şimdiye kadar likide edilen",
      wavesKey: "Dalga",
      firstLiquidation: "Blok {block} · ilk likidasyon",
      stalled: "Likidasyonlar {block}. blokta durdu: havuzda kârlı satış kalmadı",
      stalledTag: "Durdu",
      noLiquidations: "Bu çalıştırmada likidasyon yok.",
      summary:
        "{blocks} blokluk kaskad. Oracle fiyatı {start} → {end} ({change}). Likidasyon: {liquidations}. Dalga: {waves}. Likidasyonlu blok: {active}. Likide edilen borç: {liquidated}.",
      summaryFirst: "İlk likidasyon {block}. blokta.",
      scrubber: "Blok",
      valueText: "Blok {block} / {steps}: oracle fiyatı {price}, likide edilen {liquidated}, dalga {waves}",
      tableSummary: "Veri tablosu",
      tableCaption: "Blok başına: oracle fiyatı, likide edilen borç, likidasyon ve dalga",
      loading: "Kaskad yükleniyor",
      emptyTitle: "Gösterilecek blok yok",
      emptyBody: "Çalıştırmanın fiyat yolu yok.",
      errorTitle: "Kaskad yüklenemedi",
    } satisfies WaveTimelineCopy,
    positions: {
      label: "Pozisyonlar",
      summaryEnd:
        "Çalıştırma sonunda {total} pozisyon: {badDebt} karşılıksız borçlu, {stuck} likidasyon eşiğinin altında takılı, {liquidated} likide edildi, {safe} güvende.",
      summaryStep:
        "Blok {block} / {steps} itibarıyla {total} pozisyon: {liquidated} likide edildi, {below} likidasyon eşiğinin altında, {pending} henüz vurulmadı.",
      orderNote: "Likidasyona en yakın olan önce.",
      weightNote: "Genişlik borçla orantılı.",
      mismatchTitle: "Pozisyon görünümü kullanılamıyor",
      mismatchBody: "Zincir dışı tekrar, zincirdeki önizlemeyle birebir eşleşmedi; pozisyonlara atama yapılmadı.",
      tableSummary: "Pozisyon tablosu",
      tableCaption: "Her pozisyon, likidasyona en yakın önce: sonuç, borç, sağlık faktörü ve likidasyon eşiği",
      colPosition: "Pozisyon",
      colOutcome: "Sonuç",
      colDebt: "Borç",
      colHf: "Sağlık faktörü",
      colDrop: "Likide edilebilir olduğu düşüş",
      colFirst: "İlk likidasyon",
      colFinalHf: "Son HF",
      already: "Zaten",
      never: "Asla",
      noDebt: "Borç yok",
      none: "–",
      loading: "Pozisyonlar yükleniyor",
      emptyTitle: "Pozisyon yok",
      emptyBody: "Defterde bu çalıştırma için pozisyon yok.",
      errorTitle: "Pozisyonlar yüklenemedi",
      stateBadDebt: "Karşılıksız borç",
      stateStuck: "Takılı",
      stateLiquidated: "Likide edildi",
      stateBelow: "Eşiğin altında",
      statePending: "Henüz vurulmadı",
      stateSafe: "Güvende",
    } satisfies PositionsCopy,
    stress: {
      label: "Stres eğrisi",
      external: "Dış fiyat",
      externalNote: "gerçekçi",
      pool: "Havuz fiyatı",
      poolNote: "en kötü durum",
      shockKey: "Şok",
      badDebtKey: "Karşılıksız borç",
      marker: "Senaryo {shock}",
      explore: "Şok seviyesi",
      valueText: "Şok {shock}: dış fiyatla karşılıksız borç {external}, havuz fiyatıyla {pool}",
      summary: "{count} şok seviyesinde karşılıksız borç, {min} ile {max} arası. {external}. {pool}.",
      seriesSummary: "{name} ({note}): {first}, {max} şokta {last}",
      firstLoss: "{shock} şoktan itibaren karşılıksız borç",
      noLoss: "karşılıksız borç yok",
      allZero: "İki oracle modunda da hiçbir şok seviyesinde karşılıksız borç yok.",
      tableSummary: "Veri tablosu",
      tableCaption: "Şok seviyesi başına karşılıksız borç, iki oracle modu",
      loading: "Stres eğrisi yükleniyor",
      emptyTitle: "Şok seviyesi yok",
      emptyBody: "Eğride çizilecek nokta yok.",
      errorTitle: "Stres eğrisi yüklenemedi",
    } satisfies StressCurveCopy,
    mc: {
      label: "Monte Carlo",
      lossPaths: "Karşılıksız borçlu yollar",
      lossShare: "{paths} yolun {loss} tanesi",
      meanTag: "Ortalama",
      p95Tag: "p95",
      worstTag: "En kötü",
      worstAt: "{shock} şokta",
      withLoss: "Karşılıksız borçlu yol",
      withoutLoss: "Borçsuz yol",
      shockKey: "Şok",
      badDebtKey: "Karşılıksız borç",
      pathKey: "Yol",
      summary:
        "Ortalama {meanShock} şoklu {paths} rastgele fiyat yolu: {loss} tanesi ({share}) karşılıksız borçla bitiyor. Ortalama karşılıksız borç {mean}, 95. yüzdelik {p95}, en kötü {worst} (şok {worstShock}).",
      summaryNoLoss: "Ortalama {meanShock}, en fazla {maxShock} şoklu {paths} rastgele fiyat yolu: hiçbiri karşılıksız borçla bitmiyor.",
      noLoss: "Hiçbir yol karşılıksız borçla bitmiyor.",
      tableSummary: "Veri tablosu",
      tableCaption: "Her yol: son şok ve karşılıksız borç",
      loading: "Monte Carlo yolları yükleniyor",
      emptyTitle: "Yol yok",
      emptyBody: "Çalıştırma fiyat yolu döndürmedi.",
      errorTitle: "Monte Carlo yolları çalıştırılamadı",
    } satisfies MonteCarloCopy,
    gauge: {
      label: "Tek işlemin gas'ı",
      scaleTag: "Gas · ortak ölçek",
      monad: "Monad",
      ethereum: "Ethereum",
      measured: "Ölçüldü",
      estimate: "Tahmin",
      limit: "Limit",
      cap: "Tavan",
      fits: "Tek işleme sığar",
      overLimit: "İşlem başı limitin üstünde",
      doesntFit: "Tek işleme sığmaz",
      multiple: "Monad gas'ının {value} katı",
      memory: "Bellek · Monad işlem başı limit",
      memoryUsed: "{limit} içinde {used}",
      memoryGas: "Bellek gas'ı",
      positions: "{count} pozisyon",
      summaryMonad: "Monad: işlem başı {limit} limitinin {gas} gas'ı, ölçüldü; tek işleme sığıyor.",
      summaryMonadOver: "Monad: {gas} gas, işlem başı {limit} limitinin üstünde.",
      summaryEth: "Ethereum, tahmini: {limit} tavanına karşı {gas} gas; tek işleme sığıyor.",
      summaryEthOver: "Ethereum, tahmini: {limit} tavanına karşı {gas} gas; tek işleme sığmıyor.",
      loading: "Gas yükleniyor",
      emptyTitle: "Gas verisi yok",
      emptyBody: "Çalıştırma gas bildirmedi.",
      errorTitle: "Gas verisi yüklenemedi",
    } satisfies GasGaugeCopy,
  },
} satisfies ConsoleMessages;

/** "Ne oldu?" in Turkish (the legacy narrate() wording, Protocol.tsx:117-143). */
function narrativeTr(n: NarrativeText): S {
  if (n.kind === "no-liquidations")
    return `${n.symbol} ${n.steps} blokta ${n.shock} düşse de hiçbir pozisyon likidasyon eşiğine inmiyor. Protokol bu şoku kayıpsız atlatıyor.`;
  let t = `${n.symbol} ${n.steps} blokta ${n.shock} düşünce ${n.liquidations} likidasyon başlıyor: likidatörler borcu ödeyip el koydukları teminatı ${n.depth} derinliğindeki havuzda satıyor. `;
  t +=
    n.oracle.kind === "spiral"
      ? `Oracle bu havuzu izlediği için her satış fiyatı daha da düşürüyor ve yeni likidasyonlar tetikliyor: ${n.oracle.start} → ${n.oracle.end} (${n.oracle.drop}). `
      : `Oracle dış fiyatı (Chainlink / kur) izlediği için satışlar oracle'ı düşürmüyor, sarmal oluşmuyor. ${
          n.oracle.arbitrage === "recovers"
            ? `Arbitrajcılar havuzu her blokta o fiyata geri çektiği için (${n.oracle.recovery} varsayım) likidatörler satmaya devam edebiliyor. `
            : "Ama havuzu dışarıdan dolduran arbitraj yok denecek kadar az: likidatör bir noktadan sonra zarar edeceği için satmayı bırakıyor. "
        }`;
  t += n.bad ? `Sonuç: ${n.total} borcun ${n.bad} kadarı karşılıksız kalıyor. Bu parayı protokol, yani mevduat sahipleri öder.` : "Sonuç: karşılıksız borç yok.";
  if (n.stuck) t += ` Ama ${n.stuck} borç likide edilemeden bekliyor; fiyat biraz daha düşerse o da karşılıksız kalır.`;
  return t;
}

export const consoleMessages: Record<Locale, ConsoleMessages> = { en, tr };
export const consoleNarrative: Record<Locale, (n: NarrativeText) => S> = { en: narrativeEn, tr: narrativeTr };
/** English term inside Turkish copy (design rule 10). */
export const englishTerm = en_;
