import { personalMcpUnavailableResponse } from "@/lib/mcpDiscovery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Hard gate until the entire consent → use → revoke → reject flow passes in
// the deployed AS and target clients. Do not import personal server/DB modules
// here while incomplete. An environment flag cannot enable this endpoint.
export const POST = personalMcpUnavailableResponse;
export const GET = personalMcpUnavailableResponse;
export const DELETE = personalMcpUnavailableResponse;
export const PUT = personalMcpUnavailableResponse;
export const PATCH = personalMcpUnavailableResponse;
export const HEAD = personalMcpUnavailableResponse;
export const OPTIONS = personalMcpUnavailableResponse;
