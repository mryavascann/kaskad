// Writes app/api/labels/borrowers.json: the borrower addresses behind each real book, as loaded on
// testnet by scripts/src/load-testnet.ts (same source files, same dust filter). Server-only data: the
// /api/labels route matches a book slot to its address by packing these exactly as the loader did.
// Run from web/: node scripts/export-borrowers.mjs

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = join(web, "..", "scripts", "data");
const read = (f) => JSON.parse(readFileSync(join(data, f), "utf8"));

const keep = (p) => ({
  user: p.user,
  eMode: p.eMode,
  collateralId: p.collateralId,
  collateralRaw: p.collateralRaw,
  collateralDecimals: p.collateralDecimals,
  collateralUsd: p.collateralUsd,
  otherCollateralUsd: p.otherCollateralUsd,
  debtUsd: p.debtUsd,
  ltBps: p.ltBps,
  bonusBps: p.bonusBps,
  hfModel: p.hfModel ?? null,
});

const monad = read("positions.json");
const books = {};
const add = (chain, p) => {
  const id = String(p.collateralId);
  books[id] ??= { chain, positions: [] };
  books[id].positions.push(keep(p));
};
for (const p of monad.positions) add("monad", p);

// load-testnet.ts:61-66: Ethereum comparison books, dust (< $100 debt) skipped except syrupUSDT (15).
for (const f of readdirSync(data).filter((f) => /^eth-.*\.json$/.test(f) && !f.endsWith(".raw.json"))) {
  const eth = read(f);
  for (const p of eth.positions.filter((p) => p.debtUsd >= 100 || eth.reserves[0].id === 15)) add("ethereum", p);
}

const out = { source: { monadBlock: monad.block, note: "scripts/data snapshot loaded on testnet" }, books };
writeFileSync(join(web, "app", "api", "labels", "borrowers.json"), JSON.stringify(out) + "\n");
console.log(Object.entries(books).map(([id, b]) => `${id}:${b.chain}:${b.positions.length}`).join(" "));
