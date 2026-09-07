import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * schema.prisma に足した表には、prisma/sql に**足すだけの DDL**があること。
 *
 * ## なぜ要るか（#1102。2026-09-07）
 *
 * run-seed（`prisma db push`）を使わなくなってから足した表は、
 * `prisma/sql/*.sql` を置いて db-apply-sql で当てないと本番に存在しない。
 * `MarketDailySummary` がそれで、スキーマには 2026-08 からあるのに本番に
 * 無く、毎晩の集計は
 *
 *     relation "MarketDailySummary" does not exist
 *
 * と console.warn だけして**成功扱い**で通っていた。家賃指数は導入日から
 * 1 日も積まれず、画面は「蓄積中（0 日ぶん）」を出し続けた。
 *
 * ## 見張り方
 *
 * model 名（`@@map` があればその名）が、prisma/sql のどれかに
 * `CREATE TABLE IF NOT EXISTS "<名>"` として現れること。
 *
 * run-seed 時代に作られた表は SQL を持たないので、一覧で除く。
 * **この一覧は増やさない。**24 表は 2026-09-07 の db-apply-sql dry-run の
 * 「実行前のテーブル一覧」で本番に実在することを確かめたもの。新しい表は
 * 必ず SQL を置く（CLAUDE.md 3 節）。
 */

const ROOT = process.cwd();

/** run-seed で作られた表。本番に実在することを 2026-09-07 に確認済み。 */
const CREATED_BY_RUN_SEED = new Set([
  "User",
  "Account",
  "Session",
  "VerificationToken",
  "user_configs",
  "BlogPost",
  "PortfolioImage",
  "KnowledgeDocument",
  "KnowledgeChunk",
  "VisualizedComponent",
  "AgentTheme",
  "AgentActivityLog",
  "TimingAstrology",
  "TelemetryLog",
  "MetaphysicalStateLog",
  "RelocationHistory",
  "RelocationSimulation",
  "rental_properties",
  "geocode_towns",
  "RealEstateTarget",
  "ScrapeTask",
  "MunicipalityWealth",
  "XPost",
  "contact_messages",
]);

/** schema.prisma の model → 実際の表名。 */
function schemaTables(): string[] {
  const schema = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
  const out: string[] = [];
  for (const m of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const mapped = /@@map\("([^"]+)"\)/.exec(m[2]);
    out.push(mapped ? mapped[1] : m[1]);
  }
  return out;
}

/** prisma/sql が足すだけの DDL で作る表。 */
function tablesCreatedBySql(): Set<string> {
  const dir = join(ROOT, "prisma", "sql");
  const out = new Set<string>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".sql")) continue;
    const sql = readFileSync(join(dir, name), "utf8");
    for (const m of sql.matchAll(
      /CREATE TABLE IF NOT EXISTS\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/g,
    )) {
      out.add(m[1]);
    }
  }
  return out;
}

describe("schema.prisma の表は、足すだけの DDL を持つ", () => {
  const models = schemaTables();
  const bySql = tablesCreatedBySql();

  it("見張りが空回りしていない（schema と sql を読めている）", () => {
    expect(models.length).toBeGreaterThan(30);
    /* #1102 で足した表。ここが SQL に無ければ検査そのものが壊れている */
    expect(bySql.has("MarketDailySummary")).toBe(true);
  });

  it("run-seed 時代の表以外は、prisma/sql に CREATE TABLE IF NOT EXISTS がある", () => {
    const missing = models.filter(
      (t) => !CREATED_BY_RUN_SEED.has(t) && !bySql.has(t),
    );
    expect(missing).toEqual([]);
  });

  it("run-seed 時代の一覧に、いまのスキーマに無い表が残っていない", () => {
    /* 表を消したら一覧からも外す。残すと「消したのに本番に残っている」
       状態を見逃す */
    const stale = [...CREATED_BY_RUN_SEED].filter((t) => !models.includes(t));
    expect(stale).toEqual([]);
  });
});
