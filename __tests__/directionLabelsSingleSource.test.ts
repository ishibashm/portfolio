/**
 * 状態の呼び名は @/lib/directionLabels 1 か所だけが持つこと。
 *
 * 同じ内容の表が画面ごとに散っていて、**同じ状態が画面をまたぐと別の
 * 名前になっていた。**日取りパネルだけを見ても、
 *
 *   NOISE_VOID   「空亡」    / 他の画面は「天中殺方位」
 *   NOISE_NODE   「月交点」  / 他の画面は「羅睺・計都軸」
 *   NOISE_HA     「歳破/月破」/ 他の画面は「歳破/月破/日破」
 *   SAFE         「平」      / 他の画面は「平穏」
 *
 * と 4 つずれていた。さらに未知の状態が来ると `?? s` で NOISE_XXX という
 * 内部コードをそのまま画面に出していた。
 *
 * 4 つの形（name / badge / short / detailed）は**言葉を変えるためではなく、
 * 置ける長さが違うために**分けてある。呼び名の系統が揃っていることも
 * ここで固定する。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  directionLabelBadge,
  directionLabelDetailed,
  directionLabelName,
  directionLabelShort,
  isKnownDirectionStatus,
} from "@/lib/directionLabels";
import { NOISE_PRIORITY } from "@/utils/noiseSeverity";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const ALL = [
  ...NOISE_PRIORITY,
  "NOISE_TENCHU",
  "WARNING",
  "OPTIMAL",
  "OPTIMAL_REGULAR",
  "OPTIMAL_BOOST",
  "SAFE",
];

describe("4 つの形が揃っている", () => {
  it("表に載っている状態は 4 つとも空でない（SAFE の札を除く）", () => {
    for (const s of ALL) {
      expect(isKnownDirectionStatus(s), s).toBe(true);
      expect(directionLabelName(s), s).not.toBe("");
      expect(directionLabelShort(s), s).not.toBe("");
      expect(directionLabelDetailed(s), s).not.toBe("");
    }
    // 扇形の札だけは SAFE で空にする。平穏な方位に文字を重ねない。
    expect(directionLabelBadge("SAFE")).toBe("");
  });

  it("short と detailed は name で始まる（呼び名の系統が揃っている）", () => {
    for (const s of ALL) {
      const name = directionLabelName(s);
      expect(directionLabelShort(s).startsWith(name), `${s} short`).toBe(true);
      expect(directionLabelDetailed(s).startsWith(name), `${s} detailed`).toBe(
        true,
      );
    }
  });

  it("未知の状態でも内部コードを画面に出さない", () => {
    const unknown = "NOISE_NOT_A_REAL_STATUS";
    for (const f of [
      directionLabelName,
      directionLabelShort,
      directionLabelDetailed,
    ]) {
      expect(f(unknown)).toContain("判定なし");
      expect(f(unknown)).not.toContain("NOISE");
    }
    expect(directionLabelBadge(unknown)).toBe("");
  });

  it("名指しの値（ずれていた 4 つ）", () => {
    expect(directionLabelName("NOISE_VOID")).toBe("天中殺方位");
    expect(directionLabelName("NOISE_NODE")).toBe("羅睺・計都軸");
    expect(directionLabelName("NOISE_HA")).toBe("歳破/月破/日破");
    expect(directionLabelName("SAFE")).toBe("平穏");
  });
});

describe("手元の表を持ち直していない", () => {
  it("日取りパネルは集約先を呼ぶ", () => {
    const src = read("src/components/relocation/AuspiciousDayFinder.tsx");
    expect(src).toContain("directionLabelName");
    // 手元の表を戻したら落ちる。
    expect(src).not.toContain("STATUS_LABELS");
    expect(src).not.toContain('NOISE_GOU: "');
  });

  it("地図の扇形の札は集約先を呼ぶ", () => {
    const src = read("src/components/MagneticMapInner.tsx");
    expect(src).toContain("directionLabelBadge");
    // 手元の表（NOISE_VOID を「ボイド」と呼んでいた）を戻したら落ちる。
    // 経緯を書いたコメントに言葉が出るので、返り値の形で見る。
    expect(src).not.toContain("getStatusLabel");
    expect(src).not.toContain('return "ボイド"');
  });

  it("天地人の凶の呼び名は集約先を呼ぶ", () => {
    const src = read("src/components/nba/TenChiJinEvaluation.tsx");
    expect(src).toContain("directionLabelName(status)");
    // 破を「歳破」固定にしていた三項を戻したら落ちる。
    expect(src).not.toContain('? "五黄殺"');
  });

  it("破の呼び名は盤で変わる。固定の「歳破」を持ち回らない", () => {
    // 破は年＝歳破・月＝月破・日＝日破。どの盤か分かるところは
    // haLabelForLayer、分からないところは併記（集約先の name）。
    expect(directionLabelName("NOISE_HA")).toContain("月破");
    expect(directionLabelName("NOISE_HA")).toContain("日破");
  });
});
