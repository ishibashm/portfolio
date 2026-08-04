import { describe, it, expect } from "vitest";
import { ALL_DIRECTIONS, DIRECTION_LABELS } from "@/utils/auspiciousDays";
import { TENCHUSATSU_MODES } from "@/utils/tenchusatsuPolicy";

/**
 * 吉日カレンダーから物件スキャナーへの受け渡し。
 *
 * リンクの組み立てと受け取りは別のファイルにあり、片方だけ直すと
 * 「押しても条件が反映されない」という形で静かに壊れる。両側が同じ
 * パラメータ名と値の集合を使っていることを、ここで固定する。
 */

/** AuspiciousDayFinder の scannerHref と同じ組み立て。 */
function scannerHref(
  date: string,
  direction: string,
  tenchusatsuMode: string,
  lat?: string,
  lon?: string,
) {
  const q = new URLSearchParams({ targetDate: date, direction, tenchusatsuMode });
  if (lat) q.set("baseLat", lat);
  if (lon) q.set("baseLon", lon);
  return `/relocation/arbitrage?${q.toString()}`;
}

/** arbitrage 側の受け取り条件と同じ検証。 */
function acceptedByScanner(url: string) {
  const qs = new URLSearchParams(url.split("?")[1] ?? "");
  const date = qs.get("targetDate");
  const dir = qs.get("direction");
  const mode = qs.get("tenchusatsuMode");
  return {
    targetDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    direction: dir && ALL_DIRECTIONS.includes(dir as any) ? dir : null,
    tenchusatsuMode:
      mode && TENCHUSATSU_MODES.some((m) => m.id === mode) ? mode : null,
    baseLat: qs.get("baseLat"),
    baseLon: qs.get("baseLon"),
  };
}

describe("吉日カレンダー → 物件スキャナーの受け渡し", () => {
  it("日付・方位・天中殺の扱いがそのまま渡る", () => {
    const url = scannerHref("2026-09-14", "SE", "off", "35.1430", "136.9008");
    const got = acceptedByScanner(url);
    expect(got.targetDate).toBe("2026-09-14");
    expect(got.direction).toBe("SE");
    expect(got.tenchusatsuMode).toBe("off");
    expect(got.baseLat).toBe("35.1430");
    expect(got.baseLon).toBe("136.9008");
  });

  it("8 方位すべてが受け取り側で通る", () => {
    for (const d of ALL_DIRECTIONS) {
      const got = acceptedByScanner(scannerHref("2026-09-14", d, "strict"));
      expect(got.direction, DIRECTION_LABELS[d]).toBe(d);
    }
  });

  it("天中殺の全モードが受け取り側で通る", () => {
    for (const m of TENCHUSATSU_MODES) {
      const got = acceptedByScanner(scannerHref("2026-09-14", "SE", m.id));
      expect(got.tenchusatsuMode, m.label).toBe(m.id);
    }
  });

  it("座標が無ければ渡さない（保存済みの出発地を上書きしない）", () => {
    const url = scannerHref("2026-09-14", "SE", "off");
    expect(url).not.toContain("baseLat");
    expect(url).not.toContain("baseLon");
    expect(acceptedByScanner(url).baseLat).toBeNull();
  });

  it("壊れた値は受け取り側で捨てる", () => {
    expect(
      acceptedByScanner("/relocation/arbitrage?targetDate=2026/09/14")
        .targetDate,
    ).toBeNull();
    expect(
      acceptedByScanner("/relocation/arbitrage?direction=UPWARD").direction,
    ).toBeNull();
    expect(
      acceptedByScanner("/relocation/arbitrage?tenchusatsuMode=whatever")
        .tenchusatsuMode,
    ).toBeNull();
  });

  it("日付に含まれる記号が URL エンコードされる", () => {
    const url = scannerHref("2026-09-14", "SE", "month_day");
    expect(url).toContain("tenchusatsuMode=month_day");
    expect(url.startsWith("/relocation/arbitrage?")).toBe(true);
  });
});
