// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mcpAuditEvent } from "@/lib/mcpAuditStore";
import { classifyMcpPersonalRequest } from "@/lib/mcpPersonalRequest";

describe("merged public and personal get_kanshi contract", () => {
  it("accepts the shared tool at the personal boundary with a fixed audit event", () => {
    const message = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_kanshi",
        arguments: { birthDate: "1990-05-15" },
      },
    };
    const result = classifyMcpPersonalRequest(JSON.stringify(message));
    expect(result).toEqual({
      accepted: true,
      event: "get_kanshi",
      message,
    });
    expect(mcpAuditEvent.safeParse(result.event).success).toBe(true);
  });

  it("permits the same fixed event in the additive audit-table DDL", () => {
    const sql = readFileSync("prisma/sql/20261011_mcp_grants.sql", "utf8");
    const eventCheck = sql.split('CHECK ("event" IN (')[1]?.split(")")[0];
    const events = [...(eventCheck ?? "").matchAll(/'([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(events).toEqual(mcpAuditEvent.options);
    expect(events).toContain("get_kanshi");
  });
});
