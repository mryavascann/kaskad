import { protection } from "@/lib/server/protection";
import { ApiError, clientKey, json } from "@/lib/server/request";
import { borrowerLabels, hasBorrowerBook, NansenError } from "./labels";

export async function GET(req: Request) {
  const asset = new URL(req.url).searchParams.get("asset") ?? "";
  if (!/^\d{1,3}$/.test(asset)) return json({ error: "invalid-request" }, 400);
  if (!hasBorrowerBook(asset)) return json({ error: "not-found" }, 404);
  const apiKey = process.env.NANSEN_API_KEY;
  if (!apiKey) return json({ error: "unconfigured" }, 503);
  try {
    const guard = protection();
    await guard.consume([{ key: `labels:requests:${clientKey(req)}`, max: 20, windowMs: 60_000 }]);
    return json(await borrowerLabels(asset, apiKey, { guard }));
  } catch (error) {
    if (error instanceof NansenError) return json({ error: error.code }, error.status, error.status === 429 ? 60 : undefined);
    if (error instanceof ApiError) return json({ error: error.status === 429 ? "rate-limited" : "unavailable" }, error.status, error.retryAfter);
    return json({ error: "failed" }, 502);
  }
}
