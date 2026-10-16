// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mcpAuditEvent } from "@/lib/mcpAuditStore";

describe.each([
  {
    path: "prisma/sql/20261015_mcp_get_kanshi_audit_upgrade.sql",
    added: ["get_kanshi"],
    current: mcpAuditEvent.options.filter((name) => !name.includes("memor")),
  },
  {
    path: "prisma/sql/20261017_memory_audit_upgrade.sql",
    added: [
      "list_memories",
      "get_memory",
      "create_memory",
      "update_memory",
      "delete_memory",
    ],
    current: mcpAuditEvent.options,
  },
])("$path", ({ path, added, current }) => {
  const sql = readFileSync(path, "utf8");
  const eventLists = [
    ...sql.matchAll(/CHECK \((?:"event"|event) IN \(([^)]+)\)\)/g),
  ].map((match) =>
    [...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1]),
  );

  describe("existing audit-table get_kanshi upgrade contract", () => {
    it("recognizes only the prior vocabulary and installs the current vocabulary", () => {
      expect(eventLists).toHaveLength(3);
      expect(eventLists[0]).toEqual(
        current.filter((name) => !added.includes(name)),
      );
      expect(eventLists[1]).toEqual(current);
      expect(eventLists[2]).toEqual(current);
    });

    it("is transactional, locked, metadata-guarded, and leaves other tables alone", () => {
      expect(sql).toMatch(/\bBEGIN;/);
      expect(sql).toMatch(/SET LOCAL lock_timeout/);
      expect(sql).toMatch(
        /LOCK TABLE public\."McpAccessAudit" IN ACCESS EXCLUSIVE MODE/,
      );
      expect(sql).toContain("MCP_AUDIT_TABLE_MISSING");
      expect(sql).toContain("MCP_AUDIT_EVENT_CONSTRAINT_MISMATCH");
      expect(sql).toContain(
        "position('event' IN pg_get_constraintdef(oid)) > 0",
      );
      expect(sql).toContain("IF new_constraints IS NULL THEN");
      expect(sql).toMatch(/\bCOMMIT;/);
      expect(sql).not.toMatch(/\b(?:DROP TABLE|DELETE FROM|TRUNCATE)\b/i);
    });
  });
});
