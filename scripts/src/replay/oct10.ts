// Shared constants of the 10 October 2025 replay (B7). Aave V3 Ethereum Core addresses from
// bgd-labs/aave-address-book (AaveV3Ethereum); blocks from the Chainlink ETH/USD path (oct10-events.ts).
import type { Address } from "viem";

export const POOL: Address = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
export const AAVE_ORACLE: Address = "0x54586bE62E3c3580375aE3723C145253060Ca0C2";
export const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
export const USDE: Address = "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3";
export const SUSDE: Address = "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497";
/** Last block before ETH/USD started falling (the Chainlink update at 20:51:23 UTC is in the next one). */
export const BOOK_BLOCK = 23_549_825;
/** 2025-10-10 ~20:00 UTC to 2025-10-11 ~06:00 UTC. */
export const FROM = 23_549_570;
export const TO = 23_552_570;
/** Public endpoints that serve state at past blocks and wide eth_getLogs ranges. */
export const ARCHIVE_RPCS = ["https://gateway.tenderly.co/public/mainnet", "https://eth.drpc.org", "https://eth-mainnet.public.blastapi.io"];
