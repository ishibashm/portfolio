// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mcpAuditEvent } from "@/lib/mcpAuditStore";

const sql = readFileSync(
  "prisma/sql/20261015_mcp_get_kanshi_audit_upgrade.sql",
  "utf8",
);
const eventLists = [
  ...sql.matchAll(/CHECK \((?:"event"|event) IN \(([^)]+)\)\)/g),
].map((match) => [...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1]));

describe("existing audit-table get_kanshi upgrade contract", () => {
  it("recognizes only the prior vocabulary and installs the current vocabulary", () => {
    expect(eventLists).toHaveLength(3);
    expect(eventLists[0]).toEqual(
      mcpAuditEvent.options.filter((name) => name !== "get_kanshi"),
    );
    expect(eventLists[1]).toEqual(mcpAuditEvent.options);
    expect(eventLists[2]).toEqual(mcpAuditEvent.options);
  });

  it("is transactional, locked, metadata-guarded, and leaves other tables alone", () => {
    expect(sql).toMatch(/\bBEGIN;/);
    expect(sql).toMatch(/SET LOCAL lock_timeout/);
    expect(sql).toMatch(
      /LOCK TABLE public\."McpAccessAudit" IN ACCESS EXCLUSIVE MODE/,
    );
    expect(sql).toContain("MCP_AUDIT_TABLE_MISSING");
    expect(sql).toContain("MCP_AUDIT_EVENT_CONSTRAINT_MISMATCH");
    expect(sql).toContain("position('event' IN pg_get_constraintdef(oid)) > 0");
    expect(sql).toContain("IF new_constraints IS NULL THEN");
    expect(sql).toMatch(/\bCOMMIT;/);
    expect(sql).not.toMatch(/\b(?:DROP TABLE|DELETE FROM|TRUNCATE)\b/i);
  });
});
