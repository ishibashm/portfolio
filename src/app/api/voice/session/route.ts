import { handleVoice } from "@/lib/mcpVoice";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return handleVoice("session", request);
}
