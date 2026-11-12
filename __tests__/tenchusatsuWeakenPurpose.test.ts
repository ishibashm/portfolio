// @vitest-environment node
/**
 * 天中殺を「禁止せず弱める」既定と、用事の種類（purpose）で盤を選ぶ方針
 * （2026-11-02 本人決定）を固定する。
 *
 * - 既定は weaken。天中殺の日でも方位の段階は変えず、注記を付ける
 * - 天中殺の範囲は年・月・日だけ（刻は見ない）
 * - daytrip=日盤 / short_stay=月盤＋日盤 / relocation=年盤＋月盤
 * - purpose 省略時は従来どおり三盤（年・月・日）の判定
 * - 六曜・一粒万倍日は目安として返し、判定には使わない
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TENCHUSATSU_MODE,
  TENCHUSATSU_WEAK_NOTE,
  evaluateTenchusatsu,
  type TenchusatsuScope,
} from "@/utils/tenchusatsuPolicy";
import {
  DEFAULT_BOARDS,
  PURPOSE_BOARDS,
  boardsForPurpose,
  gradeForPurpose,
  statusForPurpose,
  voidScopesForPurpose,
} from "@/utils/tripPurpose";
import { calculateMcpDirections } from "@/lib/mcpDirections";
import { gradeVerdict } from "@/utils/auspiciousDays";

type Row = Parameters<typeof gradeVerdict>[0] &
  Parameters<typeof gradeForPurpose>[0] & {
    tier: string;
    threeBoardTier?: string;
  };
const rows = (ds: unknown) => ds as Row[];

const ALL_VOID = { year: true, month: true, day: true };

describe("天中殺の既定は weaken（禁止しない）", () => {
  it("既定は weaken で、年・月・日すべて空亡でも禁止しない", () => {
    expect(DEFAULT_TENCHUSATSU_MODE).toBe("weaken");
    const v = evaluateTenchusatsu(ALL_VOID, DEFAULT_TENCHUSATSU_MODE);
    expect(v.blocks).toBe(false);
    expect(v.attenuation).toBeLessThan(1);
    expect(v.inVoidPeriod).toBe(true);
  });

  it("strict は明示すれば従来どおり禁止する", () => {
    expect(evaluateTenchusatsu(ALL_VOID, "strict").blocks).toBe(true);
  });

  it("天中殺の範囲は年・月・日だけ（刻は無い）", () => {
    const scopes: TenchusatsuScope[] = ["year", "month", "day"];
    // 型が刻（hour）を許さないことを、範囲の列挙で確かめる
    expect(evaluateTenchusatsu(ALL_VOID, "weaken").activeScopes).toEqual(
      scopes,
    );
  });
});

describe("用事の種類と盤の対応", () => {
  it("daytrip=日盤 / short_stay=月盤＋日盤 / relocation=年盤＋月盤", () => {
    expect(PURPOSE_BOARDS.daytrip).toEqual(["day"]);
    expect(PURPOSE_BOARDS.short_stay).toEqual(["month", "day"]);
    expect(PURPOSE_BOARDS.relocation).toEqual(["year", "month"]);
  });

  it("省略時は三盤（従来どおり）", () => {
    expect(boardsForPurpose(undefined)).toEqual(DEFAULT_BOARDS);
    expect(DEFAULT_BOARDS).toEqual(["year", "month", "day"]);
  });

  it("天中殺も用事の盤の範囲だけで見る", () => {
    expect(voidScopesForPurpose(ALL_VOID, "daytrip")).toEqual({
      year: false,
      month: false,
      day: true,
    });
    expect(voidScopesForPurpose(ALL_VOID, "relocation")).toEqual({
      year: true,
      month: true,
      day: false,
    });
    expect(voidScopesForPurpose(ALL_VOID, undefined)).toEqual(ALL_VOID);
  });

  it("使わない盤の凶は段階に入らない", () => {
    const v = {
      yearLayer: "NOISE_GOU",
      monthLayer: "SAFE",
      dayLayer: "OPTIMAL",
      finalStatus: "NOISE_GOU",
    };
    expect(gradeForPurpose(v, "daytrip")).toBe("S");
    expect(statusForPurpose(v, "daytrip")).toBe("OPTIMAL");
    expect(gradeForPurpose(v, "relocation")).toBe("X");
    expect(gradeForPurpose(v, "short_stay")).toBe("B");
  });

  it("土用殺はどの用事でも凶", () => {
    const v = {
      yearLayer: "OPTIMAL",
      monthLayer: "OPTIMAL",
      dayLayer: "OPTIMAL",
      finalStatus: "NOISE_DOYOU",
    };
    expect(gradeForPurpose(v, "daytrip")).toBe("D");
    expect(statusForPurpose(v, "relocation")).toBe("NOISE_DOYOU");
  });
});

/** 生年月日 1990-06-15・名古屋の経度で、日の空亡に当たる日を探す。 */
function findVoidDay(): string {
  const start = new Date("2026-11-01T12:00:00+09:00").getTime();
  for (let i = 0; i < 30; i++) {
    const date = new Date(start + i * 86400000)
      .toISOString()
      .slice(0, 10);
    const r = calculateMcpDirections({
      birthDate: "1990-06-15",
      lon: 136.91,
      date,
      purpose: "daytrip",
    });
    if (r.ok && r.payload.tenchusatsu.inPeriod) return date;
  }
  throw new Error("30 日以内に日の空亡が無い");
}

describe("MCP の日判定（calculateMcpDirections）", () => {
  const base = { birthDate: "1990-06-15", lon: 136.91 };

  it("purpose 省略時の段階は従来の三盤判定と同じ", () => {
    const r = calculateMcpDirections({ ...base, date: "2026-11-08" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.purpose).toBeNull();
    expect(r.payload.boardsUsed).toEqual(["year", "month", "day"]);
    expect(r.payload.tenchusatsuMode).toBe("weaken");
    for (const d of rows(r.payload.directions)) {
      expect(d.tier).toBe(gradeVerdict(d));
      expect("threeBoardTier" in d).toBe(false);
    }
  });

  it("purpose を指定すると用事の盤だけで段階を出し、三盤の値も残す", () => {
    const r = calculateMcpDirections({
      ...base,
      date: "2026-11-08",
      purpose: "daytrip",
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.payload.boardsUsed).toEqual(["day"]);
    for (const d of rows(r.payload.directions)) {
      expect(d.tier).toBe(gradeForPurpose(d, "daytrip"));
      expect(d.threeBoardTier).toBe(gradeVerdict(d));
    }
  });

  it("天中殺の日でも全方位を凶にせず、吉方位と注記を返す（既定）", () => {
    const date = findVoidDay();
    const r = calculateMcpDirections({ ...base, date, purpose: "daytrip" });
    if (!r.ok) throw new Error(r.error);
    expect(r.payload.blockedByTenchusatsu).toBe(false);
    expect(r.payload.tenchusatsu.scopes).toContain("day");
    expect(r.payload.tenchusatsu.note).toBe(TENCHUSATSU_WEAK_NOTE);
    const good = r.payload.directions
      .filter((d) => ["S", "A", "B"].includes(d.tier))
      .map((d) => d.direction);
    expect(r.payload.auspiciousDirections).toEqual(good);
    // 天中殺は方位の段階を X に落とさない（strict でも同じ段階）
    const strict = calculateMcpDirections({
      ...base,
      date,
      purpose: "daytrip",
      tenchusatsuMode: "strict",
    });
    if (!strict.ok) throw new Error(strict.error);
    expect(strict.payload.blockedByTenchusatsu).toBe(true);
    expect(strict.payload.directions.map((d) => d.tier)).toEqual(
      r.payload.directions.map((d) => d.tier),
    );
  });

  it("引越し（年盤＋月盤）は日の空亡を見ない", () => {
    const date = findVoidDay();
    const r = calculateMcpDirections({
      ...base,
      date,
      purpose: "relocation",
      tenchusatsuMode: "strict",
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.payload.tenchusatsu.scopes).not.toContain("day");
  });

  it("六曜・一粒万倍日は目安として返し、判定に使わない", () => {
    const r = calculateMcpDirections({ ...base, date: "2026-11-08" });
    if (!r.ok) throw new Error(r.error);
    expect(r.payload.almanac.rokuyo).toBe(r.payload.rokuyo);
    expect(typeof r.payload.almanac.ichiryumanbai).toBe("boolean");
    expect(r.payload.almanac.note).toContain("判定には使っていません");
  });
});

describe("MCP ツールの purpose 入力", () => {
  it("find_auspicious_days と judge_directions が purpose を受け付ける", async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import(
      "@modelcontextprotocol/sdk/inMemory.js"
    );
    const { createMcpServer } = await import("@/lib/mcpServer");
    const server = createMcpServer();
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(b);
    try {
      const days = await client.callTool({
        name: "find_auspicious_days",
        arguments: {
          birthDate: "1990-06-15",
          lon: 136.91,
          from: "2026-11-01",
          to: "2026-12-31",
          purpose: "short_stay",
        },
      });
      expect(days.isError).not.toBe(true);
      const dirs = await client.callTool({
        name: "judge_directions",
        arguments: {
          birthDate: "1990-06-15",
          lon: 136.91,
          date: "2026-11-08",
          purpose: "relocation",
        },
      });
      expect(dirs.isError).not.toBe(true);
      const out = JSON.parse((dirs.content as { text: string }[])[0].text);
      expect(out.boardsUsed).toEqual(["year", "month"]);
      expect(dirs.structuredContent).toEqual(out);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
