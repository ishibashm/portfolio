// @vitest-environment node
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { mcpAuditEvent, mcpAuditResult } from "@/lib/mcpAuditStore";

const sql = readFileSync("prisma/sql/20261011_mcp_grants.sql", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const names = [
  "McpGrant",
  "McpProviderState",
  "McpAccessAudit",
  "McpRateBucket",
  "McpCalculationLease",
];

describe("MCP storage contract (no database access or DDL execution)", () => {
  it.each(names)("%s matches SQL columns, nullability and indexes", (name) => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === name)!;
    expect(model).toBeDefined();
    const block = sql
      .split(`CREATE TABLE IF NOT EXISTS "${name}" (`)[1]
      ?.split("\n);")[0];
    expect(block).toBeDefined();
    const columns = [
      ...block.matchAll(
        /^  "(\w+)" ([A-Z]+(?:\(3\)|\[\]| PRECISION)?)( NOT NULL)?/gm,
      ),
    ];
    expect(columns.map((c) => c[1]).sort()).toEqual(
      model.fields.map((f) => f.name).sort(),
    );
    const modelSource = schema.split(`model ${name} {`)[1].split("\n}")[0];
    for (const field of model.fields) {
      const column = columns.find((c) => c[1] === field.name)!;
      const line = modelSource
        .split("\n")
        .find((l) => l.trimStart().startsWith(`${field.name} `))!;
      const type = line.includes("@db.Uuid")
        ? "UUID"
        : line.includes("[]")
          ? "TEXT[]"
          : (
              {
                String: "TEXT",
                DateTime: "TIMESTAMPTZ(3)",
                Bytes: "BYTEA",
                Float: "DOUBLE PRECISION",
                Int: "INTEGER",
              } as Record<string, string>
            )[field.type];
      expect(column[2]).toBe(type);
      expect(Boolean(column[3])).toBe(!/\w+\?/.test(line));
      expect(line).not.toContain("@default");
      if (line.includes("@unique"))
        expect(sql).toContain(
          `CREATE UNIQUE INDEX IF NOT EXISTS "${name}_${field.name}_key" ON "${name}" ("${field.name}")`,
        );
      if (line.includes("@id"))
        expect(block).toContain(`"${field.name}" ${type} NOT NULL PRIMARY KEY`);
    }
    for (const index of modelSource.matchAll(/@@(index|id)\(\[([^\]]+)\]/g)) {
      const fields = index[2].split(", ");
      const quoted = fields.map((f) => `"${f}"`).join(", ");
      expect(sql).toContain(
        index[1] === "id"
          ? `PRIMARY KEY (${quoted})`
          : `CREATE INDEX IF NOT EXISTS "${name}_${fields.join("_")}_idx" ON "${name}" (${quoted})`,
      );
    }
    expect(sql).toContain(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY;`);
  });

  it("contains only additive table/index creation and RLS enablement", () => {
    const statements = sql
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(15);
    for (const statement of statements)
      expect(statement).toMatch(
        /^(CREATE (?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS|ALTER TABLE "Mcp\w+" ENABLE ROW LEVEL SECURITY$)/,
      );
    expect(sql).not.toMatch(
      /\b(?:DEFAULT|REFERENCES|CREATE POLICY|GRANT|DROP|DELETE|INSERT|UPDATE)\b/,
    );
  });

  it("keeps the fixed audit vocabulary identical to the unapplied DDL", () => {
    for (const [column, values] of [
      ["event", mcpAuditEvent.options],
      ["result", mcpAuditResult.options],
    ] as const) {
      const list = sql.split(`CHECK ("${column}" IN (`)[1].split(")")[0];
      expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual(values);
    }
    expect(mcpAuditEvent.options).toEqual([
      "authorize",
      "refresh",
      "revoke",
      "initialize",
      "tools/list",
      "ping",
      "notification",
      "unknown_method",
      "unknown_tool",
      "invalid_request",
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
      "list_memories",
      "get_memory",
      "create_memory",
      "update_memory",
      "delete_memory",
    ]);
    for (const untrusted of [
      "private-profile",
      "get_profile\nforged",
      "__proto__",
    ])
      expect(mcpAuditEvent.safeParse(untrusted).success).toBe(false);
  });

  it("limits audit fields and retention, and bounds selections and leased slots", () => {
    const audit = Prisma.dmmf.datamodel.models.find(
      (m) => m.name === "McpAccessAudit",
    )!;
    expect(audit.fields.map((f) => f.name)).toEqual([
      "requestId",
      "userId",
      "grantId",
      "occurredAt",
      "expiresAt",
      "event",
      "result",
      "durationMs",
    ]);
    expect(sql).toContain(`"expiresAt" <= "occurredAt" + INTERVAL '30 days'`);
    expect(sql).toContain(`"expiresAt" <= "createdAt" + INTERVAL '30 days'`);
    expect(sql).toContain('cardinality("allowedProfileIds") BETWEEN 1 AND 100');
    expect(sql).toContain('array_position("allowedProfileIds", NULL) IS NULL');
    expect(sql).toContain('"slot" IN (0, 1)');
    expect(sql).toContain('"event" IN (');
    expect(sql).toContain('"result" IN (');
  });
});
