import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Address } from "viem";
import { parseCursor, seedBorrowers, type BorrowerCursor } from "./rpc-borrowers.js";

export function loadBorrowerCursor(file: string, snapshotFile: string, pool: Address): BorrowerCursor {
  return existsSync(file)
    ? parseCursor(JSON.parse(readFileSync(file, "utf8")), pool)
    : seedBorrowers(JSON.parse(readFileSync(snapshotFile, "utf8")), pool);
}
/** Atomic replacement; a failed write never advances the saved scan position. */
export function saveBorrowerCursor(file: string, cursor: BorrowerCursor) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(cursor), { mode: 0o600 });
    renameSync(tmp, file);
  } finally { rmSync(tmp, { force: true }); }
}
