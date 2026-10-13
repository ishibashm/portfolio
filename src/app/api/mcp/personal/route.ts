import { personalMcpEntry } from "@/lib/mcpRuntimeEntry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Disabled by default; secrets and DB dependencies load only behind the gate.
export const POST = personalMcpEntry;
export const GET = personalMcpEntry;
export const DELETE = personalMcpEntry;
export const PUT = personalMcpEntry;
export const PATCH = personalMcpEntry;
export const HEAD = personalMcpEntry;
export const OPTIONS = personalMcpEntry;
