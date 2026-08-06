import { describe, expect, it } from "vitest";
import {
  parseWealthStatus,
  resolveWealthMarker,
  WEALTH_LEGEND_SAMPLES,
} from "@/lib/wealthMapPresentation";
import { getProfileStorageMode } from "@/lib/profilePresentation";
import {
  directionLabelDetailed,
  directionLabelShort,
  isKnownDirectionStatus,
} from "@/lib/directionLabels";

/** 画面に出るステータスの全種類。ここに載るものは必ず日本語表記を持つ。 */
const ALL_STATUSES = [
  "NOISE_GOU",
  "NOISE_ANKEN",
  "NOISE_HA",
  "NOISE_VOID",
  "NOISE_HONMEI",
  "NOISE_TEKI",
  "NOISE_GETSUMEI",
  "NOISE_GETSUTEKI",
  "NOISE_NODE",
  "WARNING",
  "OPTIMAL",
  "OPTIMAL_REGULAR",
  "OPTIMAL_BOOST",
  "SAFE",
];

describe("方位ラベル (QA #18)", () => {
  it("画面に出る全ステータスに日本語表記がある", () => {
    for (const s of ALL_STATUSES) {
      expect(isKnownDirectionStatus(s), s).toBe(true);
    }
  });

  it("未知のステータスでも内部コードを画面に出さない", () => {
    // 以前は移動履歴と時期スコアラーが status をそのまま返しており、
    // 表に無い凶が来ると "NOISE_GETSUMEI" と表示されていた。
    for (const label of [
      directionLabelShort("NOISE_UNSEEN"),
      directionLabelDetailed("NOISE_UNSEEN"),
      directionLabelShort(""),
    ]) {
      expect(label).not.toMatch(/[A-Z_]{4,}/);
    }
  });

  it("WARNING を吉と書かない", () => {
    // 「注意」の説明が「吉方位／中立平穏」になっていたのが QA #18。
    const detailed = directionLabelDetailed("WARNING");
    expect(detailed).toContain("注意");
    expect(detailed).not.toContain("吉方位 (");
    expect(directionLabelDetailed("SAFE")).not.toContain("吉方位");
  });

  it("短い形と詳しい形が同じ判定を指す", () => {
    for (const s of ALL_STATUSES) {
      const name = directionLabelShort(s).split(" (")[0];
      expect(directionLabelDetailed(s), s).toContain(name);
    }
  });
});

describe("移住先マップの点と凡例 (QA #15)", () => {
  it("合成された astrologyStatus から基準値と付帯フラグを分ける", () => {
    expect(parseWealthStatus("OPTIMAL + DECLINATION_WARNING,JUPITER_ASC")).toEqual(
      { status: "OPTIMAL", flags: ["DECLINATION_WARNING", "JUPITER_ASC"] },
    );
    expect(parseWealthStatus("SAFE")).toEqual({ status: "SAFE", flags: [] });
  });

  it("凶方位は地図に出さない。偏角警告が付いていても出さない", () => {
    expect(resolveWealthMarker("NOISE_GOU")).toBeNull();
    // 以前は文字列全体に includes("WARNING") をかけていたため、
    // DECLINATION_WARNING が付いた凶方位が地図に出ていた。
    expect(resolveWealthMarker("NOISE_GOU + DECLINATION_WARNING")).toBeNull();
  });

  it("大きさは吉凶、色は所得。偏角警告のときだけ琥珀で上書きする", () => {
    const optimal = resolveWealthMarker("OPTIMAL")!;
    const safe = resolveWealthMarker("SAFE")!;
    const warned = resolveWealthMarker("OPTIMAL + DECLINATION_WARNING")!;

    expect(optimal.radius).toBeGreaterThan(safe.radius);
    expect(optimal.fill).toBe("income");
    expect(safe.fill).toBe("income");
    // 大吉かつ偏角警告は「大きい琥珀」。1 軸の凡例では表せない組み合わせ。
    expect(warned.radius).toBe(optimal.radius);
    expect(warned.fill).toBe("#fbbf24");
  });

  it("凡例の見本は、地図に実在しうる点だけを使う", () => {
    for (const item of WEALTH_LEGEND_SAMPLES) {
      expect(resolveWealthMarker(item.sample), item.sample).not.toBeNull();
    }
  });
});

describe("プロフィールの保存先表示 (QA #16)", () => {
  it("同期されていれば「この端末のみ」と言わない", () => {
    expect(getProfileStorageMode(true, false)).toEqual({
      label: "クラウド同期済み",
      tone: "synced",
    });
  });

  it("未ログインとログイン済みローカルを区別する", () => {
    expect(getProfileStorageMode(false, true).label).toContain("未ログイン");
    expect(getProfileStorageMode(false, false).label).toBe("この端末のみ");
    expect(getProfileStorageMode(false, false).tone).toBe("local");
  });

  it("確認前は断定しない", () => {
    expect(getProfileStorageMode(null, false).tone).toBe("unknown");
  });
});
