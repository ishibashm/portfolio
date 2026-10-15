import {
  JSONRPCRequestSchema,
  JSONRPCNotificationSchema,
  InitializeRequestSchema,
  InitializedNotificationSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  PingRequestSchema,
  type JSONRPCRequest,
  type JSONRPCNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { mcpAuditEvent } from "@/lib/mcpAuditStore";

const toolName = z.enum([
  "get_honmei_star",
  "get_kanshi",
  "judge_directions",
  "find_auspicious_days",
  "search_municipality",
  "area_directions",
  "prefecture_summary",
  "list_profiles",
  "get_profile",
  "judge_profile_directions",
  "judge_time_slots",
]);
type AuditEvent = z.infer<typeof mcpAuditEvent>;
export type McpPersonalRequest =
  | {
      accepted: true;
      event: AuditEvent;
      message: JSONRPCRequest | JSONRPCNotification;
    }
  | {
      accepted: false;
      event: "invalid_request" | "unknown_method" | "unknown_tool";
    };

/** Dormant HTTP preflight, after the bounded body reader. This is classification,
 * not authorization: even initialize/list/ping/notifications need Bearer auth
 * and one shared request-budget consumption. Never send message/params to audit.
 * No batches, responses, tasks or cross-request cancellation in this stateless
 * endpoint. Rejections contain no input fragments, IDs or validator errors.
 */
export function classifyMcpPersonalRequest(text: string): McpPersonalRequest {
  const invalid = { accepted: false, event: "invalid_request" } as const;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return invalid;
  }
  const request = JSONRPCRequestSchema.safeParse(body);
  if (!request.success) {
    const notification = JSONRPCNotificationSchema.safeParse(body);
    if (!notification.success) return invalid;
    if (notification.data.method !== "notifications/initialized")
      return { accepted: false, event: "unknown_method" };
    if (!InitializedNotificationSchema.safeParse(notification.data).success)
      return invalid;
    return {
      accepted: true,
      event: "notification",
      message: notification.data,
    };
  }
  const message = request.data;
  switch (message.method) {
    case "initialize":
      if (!InitializeRequestSchema.safeParse(message).success) return invalid;
      return { accepted: true, event: "initialize", message };
    case "tools/list":
      if (!ListToolsRequestSchema.safeParse(message).success) return invalid;
      return { accepted: true, event: "tools/list", message };
    case "ping":
      if (!PingRequestSchema.safeParse(message).success) return invalid;
      return { accepted: true, event: "ping", message };
    case "tools/call": {
      const call = CallToolRequestSchema.safeParse(message);
      if (!call.success || call.data.params.task !== undefined) return invalid;
      const name = toolName.safeParse(call.data.params.name);
      if (!name.success) return { accepted: false, event: "unknown_tool" };
      return { accepted: true, event: name.data, message };
    }
    default:
      return { accepted: false, event: "unknown_method" };
  }
}
