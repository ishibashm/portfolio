/**
 * 暦の平年値（クライマトロジー）を計算して
 * src/data/calendarClimatology.json に書き出す。
 *
 * 時期スクリーニングは「吉日 12 日」と絶対数を出すが、それが多いのか
 * 少ないのかは基準が無いと読めない。九星の年盤は 9 年で一巡するので、
 * 立春から 9 年ぶんを走査して「あなたの本命星×天中殺グループでは
 * S 日は年平均何日あるか」という平年値を作る。
 *
 * 暦は決定的（同じ入力なら常に同じ答え）なので、毎晩の再計算は不要。
 * このスクリプトは判定エンジンを変えたときにだけ手で回し、結果を
 * コミットする。全 54 プロファイル（本命星 9 × 天中殺グループ 6）で
 * 実測およそ 10 分かかる。
 *
 * 前提と割り切り:
 * - 経度は 135°E（日本標準時の子午線）で固定。太陽時の日境界が
 *   経度で数分ずれるが、年平均の日数には端の 1 日が動く程度
 * - 天中殺は考慮しない（mode: off）。ここで出すのは盤の構造としての
 *   希少さで、天中殺で塞がれるかどうかは設定依存のため画面側で別掲する
 */
import * as fs from "fs";
import * as path from "path";

import {
  ALL_DIRECTIONS,
  judgeDayAllDirections,
  gradeVerdict,
  DayTier,
} from "../src/utils/auspiciousDays";

const LON_REF = 135;
const YEARS = 9;
/** 立春から回す。年盤の切り替わりに窓を揃える */
const START = new Date("2026-02-04T12:00:00+09:00");

const VOID_GROUPS: string[][] = [
  ["子", "丑"],
  ["寅", "卯"],
  ["辰", "巳"],
  ["午", "未"],
  ["申", "酉"],
  ["戌", "亥"],
];

const TIERS: DayTier[] = ["S", "A", "B", "C", "D", "X"];

interface DirectionClimatology {
  /** 段階ごとの年平均日数 */
  perYear: Record<DayTier, number>;
}

interface ProfileClimatology {
  /** 「どこかの方位で S」の日数を 365 日窓ごとに数えた系列（9 窓） */
  anySPerWindow: number[];
  avgAnySPerYear: number;
  directions: Record<string, DirectionClimatology>;
}

async function main() {
  const totalDays = YEARS * 365;
  const profiles: Record<string, ProfileClimatology> = {};
  const t0 = Date.now();

  for (let star = 1; star <= 9; star++) {
    for (const voidZodiacs of VOID_GROUPS) {
      const key = `${star}|${voidZodiacs.join("")}`;
      const p = {
        honmeiStar: star,
        voidZodiacs,
        lon: LON_REF,
        tenchusatsuMode: "off" as const,
        involuntaryMove: false,
      };

      const counts: Record<string, Record<DayTier, number>> = {};
      for (const d of ALL_DIRECTIONS) {
        counts[d] = { S: 0, A: 0, B: 0, C: 0, D: 0, X: 0 };
      }
      const anySPerWindow = Array(YEARS).fill(0);

      for (let i = 0; i < totalDays; i++) {
        const date = new Date(START.getTime() + i * 86_400_000);
        const all = judgeDayAllDirections(date, p);
        let anyS = false;
        for (const dir of ALL_DIRECTIONS) {
          const tier = gradeVerdict(all[dir]);
          counts[dir][tier]++;
          if (tier === "S") anyS = true;
        }
        if (anyS) anySPerWindow[Math.floor(i / 365)]++;
      }

      const directions: Record<string, DirectionClimatology> = {};
      for (const d of ALL_DIRECTIONS) {
        const perYear = {} as Record<DayTier, number>;
        for (const t of TIERS) {
          perYear[t] = Number((counts[d][t] / YEARS).toFixed(1));
        }
        directions[d] = { perYear };
      }
      profiles[key] = {
        anySPerWindow,
        avgAnySPerYear: Number(
          (anySPerWindow.reduce((a, b) => a + b, 0) / YEARS).toFixed(1),
        ),
        directions,
      };
      console.log(
        `${key}: 年平均 S=${profiles[key].avgAnySPerYear}日 (${Math.round((Date.now() - t0) / 1000)}s)`,
      );
    }
  }

  const out = {
    meta: {
      generatedAt: new Date().toISOString(),
      lonRef: LON_REF,
      from: START.toISOString().slice(0, 10),
      years: YEARS,
      note:
        "九星の年盤は9年周期。立春起点の9年窓で数えた段階別の年平均日数。" +
        "天中殺は考慮していない（設定依存のため）。経度135°E固定。",
    },
    profiles,
  };
  const outPath = path.join(
    process.cwd(),
    "src",
    "data",
    "calendarClimatology.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(out) + "\n");
  console.log(
    `書き出し: ${outPath}（${(fs.statSync(outPath).size / 1024).toFixed(0)} KB）`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
