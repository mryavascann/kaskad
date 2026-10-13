import { handleMonitor } from "@/lib/server/monitor-handler";

export async function POST(request: Request) {
  return handleMonitor(request);
}
