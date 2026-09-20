import { describe, expect, it } from "vitest";
import {
  AstroEngine,
  EIGHT_DIRECTIONS,
  calculateVectorCollision,
  generateBoard,
  getCurrentEnvironmentalFrequencies,
} from "@/utils/ephemerisEngine";
import type { Direction } from "@/utils/ephemerisEngine";
import { directionBoardInstant } from "@/utils/boardInstant";
import { contentYears, getYearDirections } from "@/lib/kigakuContent";
import { DIRECTION_LABELS, directionFromBearing } from "@/utils/directionGeo";

/**
 * **月交点（ドラゴンヘッド／テール）は判定に入れない**（利用者の判断。
 * 年盤は 2026-09-19 の #1416、月盤・日盤・最終判定はその日の続き）。
 *
 * ## 何が壊れていたか
 *
 * `/houi` の年別頁（`getYearDirections`）は `calculateVectorCollision` に
 * 月交点を `null` で渡し、道具（`auspiciousDays`・`SolarTimeClock`）は
 * `env.raw.lunarNode` を渡していた。**同じエンジンに違う入力を渡していた。**
 *
 * さらにエンジンの「グローバルノイズと最適化の適用」は月交点を吉方位より
 * 先に当てるので、**月交点が吉方位を先取りして潰す。**2027 年の南西が
 * それで、頁が「吉方位」と書く 4 星（一白・二黒・五黄・八白）に対し、
 * 道具の年層は月交点を出していた。
 *
 * ## なぜ全部から外すのか
 *
 * 九星気学の八方位の吉凶は九星と十二支で決まる。**月交点はインド占星術の
 * 軸**で、混ぜると画面の「本命星 ＋ 環境方位」という説明（五黄殺・暗剣殺・
 * 破）に無い要因が黙って効く。月交点は 2025-11 から 2029 年ごろまで
 * 北東／南西に居座るので、**全員の北東・南西が 3 年間ほぼ毎日塞がって
 * いた。**
 *
 * ## 実測（2026-09-19。6 人 × 2 年 × 8 方位 = 17,520 枡・総合判定）
 *
 *     段階    前      後      差
 *     S      158     226     +68
 *     A      494     658    +164
 *     B      497     669    +172
 *     C      194     317    +123
 *     D    1,012     485    −527
 *     X   15,165  15,165      ±0
 *
 * **五大凶殺（X）は 1 件も動かない。**動いたのは「月交点だけで塞がって
 * いた日」（D）が半減し、そのぶんが C〜S に上がったぶん。
 *
 * ## 型から外したことが最大の見張り
 *
 * `calculateVectorCollision` から `lunarNodeLon` と `nodeMapping` の引数を
 * 外し（#1448）、状態コード `NOISE_NODE` も `VectorStatus` から外した
 * （2026-09-20）。**月交点を渡す経路も、置く先の状態も無い。**戻すには
 * 30 ファイルを同時に直すことになる。
 *
 * そのため下の「`NOISE_NODE` が出ない」は、いまは念押しでしかない
 * （型に無い値なので必ず通る）。**効いているのは次の 2 つ。**
 *
 *   旧実装が塞いでいた枡が、実際に開いている（層で見る）
 *   年別頁と道具が同じ年盤を出す
 */

const LON = 136.9008;

/** 過去に固定した年は残す。記事が出す年は必ず混ぜる（検査が置いていかれない）。 */
const YEARS = [
  ...new Set([2026, 2027, 2028, 2029, 2030, ...contentYears()]),
].sort((a, b) => a - b);

/** 気学年の中の代表日。立春を跨がない範囲で散らす。 */
const SAMPLE_DAYS = [10, 100, 200, 300];

/**
 * **旧実装の写し。**月の交点の黄経を八方位に落としていた規則そのもの
 * （`nodeMapping` の既定 "traditional"）。エンジンからは消したので、
 * 比較のためにここにだけ残す。**新しく使わないこと。**
 */
function oldNodeDirections(date: Date): Direction[] {
  const lon = AstroEngine.getLunarNodeLongitude(date);
  if (lon === null || Number.isNaN(lon)) return [];
  const bearing = (l: number) =>
    directionFromBearing((l + 90) % 360, "traditional");
  return [...new Set([bearing(lon), bearing((lon + 180) % 360)])];
}

function layersOn(year: number, dayOffset: number, star: number) {
  const d = new Date(Date.UTC(year, 1, 5) + dayOffset * 86_400_000);
  const instant = directionBoardInstant(d, 0, LON);
  const env = getCurrentEnvironmentalFrequencies(instant, LON, "independent");
  return calculateVectorCollision(
    star as never,
    generateBoard(env.classicalYearStar),
    generateBoard(env.classicalMonthStar),
    generateBoard(env.classicalDayStar),
    [],
    "MIGRATION",
    instant,
    LON,
    undefined,
  );
}

describe("月交点は判定に入らない", () => {
  it("記事が出している年をすべて含んでいる", () => {
    for (const y of contentYears()) expect(YEARS).toContain(y);
  });

  it.each(YEARS)(
    "%s 年: 年層・月層・日層・最終のどこにも月交点が出ない",
    (year) => {
      for (const day of SAMPLE_DAYS) {
        for (let star = 1; star <= 9; star++) {
          const c = layersOn(year, day, star);
          for (const dir of EIGHT_DIRECTIONS) {
            const where = {
              年盤: c.yearLayer[dir],
              月盤: c.monthLayer[dir],
              日盤: c.dayLayer[dir],
              最終: c.finalVectors[dir],
            };
            for (const [layer, status] of Object.entries(where)) {
              expect(
                status,
                `${year} 星${star} ${DIRECTION_LABELS[dir]}（+${day}日）の${layer}に月交点が出た`,
              ).not.toBe("NOISE_NODE");
            }
          }
        }
      }
    },
  );

  it("旧実装が月交点で塞いでいた枡が、実際に開いている", () => {
    /*
      **外し忘れの裏返しを見る。**「NOISE_NODE が出ない」だけだと、
      最終判定の分岐を消して層の代入だけ残す、のような**中途半端な
      戻し方**は捕まえられても、「開いたかどうか」は分からない。

      そこで**旧実装の月交点 → 方位の写しをここに置く。**旧実装は
      `res[dir] === "SAFE"` の枡にだけ月交点を置いたので、**月交点の
      方位は年層・月層・日層のどれもが必ず NOISE_* になっていた**
      （元から別の凶だった枡も NOISE_*）。だから「3 層のどれか 1 つでも
      凶でない」枡が 1 つでもあれば、外せている。旧実装に戻すと 0 になる。

      **最終判定（finalVectors）では見ない。**旧実装でも、日層だけが
      月交点のときは最終が吉に落ちることがあり、空回りする。

      写しが空回りしていないこと（covered > 0）も同時に見る。
    */
    let covered = 0;
    let opened = 0;
    for (const year of YEARS) {
      for (const offset of SAMPLE_DAYS) {
        const d = new Date(Date.UTC(year, 1, 5) + offset * 86_400_000);
        const instant = directionBoardInstant(d, 0, LON);
        const blocked = oldNodeDirections(instant);
        for (let star = 1; star <= 9; star++) {
          const c = layersOn(year, offset, star);
          for (const dir of blocked) {
            covered++;
            const layers = [
              c.yearLayer[dir],
              c.monthLayer[dir],
              c.dayLayer[dir],
            ];
            if (layers.some((l) => !String(l).startsWith("NOISE"))) opened++;
          }
        }
      }
    }
    expect(covered, "旧実装の写しが 1 枡も指していない").toBeGreaterThan(0);
    expect(opened, "旧実装が塞いでいた枡が 1 つも開いていない").toBeGreaterThan(
      0,
    );
  });
});

describe("年別頁と道具が同じ年盤を出す", () => {
  /*
    この検査がこの変更の芯。`getYearDirections`（記事）と
    `calculateVectorCollision`（道具）は入力が違っていたので、
    月交点の方位だけ別の札になっていた。**旧実装に戻すと必ず落ちる。**
  */
  it.each(YEARS)("%s 年: 9 星 × 8 方位 × 年内 4 日で一致する", (year) => {
    for (let star = 1; star <= 9; star++) {
      const page = getYearDirections(year, star).verdicts;
      for (const day of SAMPLE_DAYS) {
        const tool = layersOn(year, day, star).yearLayer;
        for (const v of page) {
          expect(
            tool[v.direction],
            `${year} 星${star} ${v.jp}（+${day}日）: 記事は ${v.status}、道具は ${tool[v.direction]}`,
          ).toBe(v.status);
        }
      }
    }
  });
});
