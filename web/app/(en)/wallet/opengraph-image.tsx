import { staticImage, OG_CONTENT_TYPE, OG_SIZE, ogAlt } from "@/og/images";

export const alt = ogAlt("wallet", "en");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// Static: title and the snapshot block from deployment.json, no RPC.

export default function Image() {
  return staticImage("wallet", "en");
}
