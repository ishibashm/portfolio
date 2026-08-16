import { describe, expect, it } from "vitest";
import {
  aggregateWealth,
  buildAreaMap,
  type EstatStatsResponse,
} from "../scripts/estatWealth";

/**
 * e-Stat の市区町村所得データの集計。
 *
 * 同じ読み方・同じ計算が 2 つのスクリプトに丸ごと重複していた
 * （JSON に書き出す側と DB に入れる側）。片方だけ直すと、書き出した
 * JSON と DB の数字が食い違う。寄せたので、寄せ先の答えを固定する。
 *
 * scripts は tsc の対象外（CLAUDE.md 4 節）で、実行には e-Stat の
 * API キーと外への通信が要る。**集計の部分だけはここで検証できる。**
 */

/** 応答の骨組みを作る。 */
function response(
  values: { area: string; cat: string; value: string }[],
  areas: { code: string; name: string }[],
): EstatStatsResponse {
  return {
    GET_STATS_DATA: {
      RESULT: { STATUS: 0 },
      STATISTICAL_DATA: {
        DATA_INF: {
          VALUE: values.map((v) => ({
            "@area": v.area,
            "@cat01": v.cat,
            $: v.value,
          })),
        },
        CLASS_INF: {
          CLASS_OBJ: [
            { "@id": "cat01", CLASS: [] },
            {
              "@id": "area",
              CLASS: areas.map((a) => ({ "@code": a.code, "@name": a.name })),
            },
          ],
        },
      },
    },
  };
}

describe("地域名の対応表", () => {
  it("area の分類から引く", () => {
    const map = buildAreaMap([
      { "@id": "cat01", CLASS: [{ "@code": "C120110", "@name": "所得" }] },
      { "@id": "area", CLASS: [{ "@code": "01100", "@name": "札幌市" }] },
    ]);
    expect(map).toEqual({ "01100": "札幌市" });
  });

  it("CLASS が 1 件で配列になっていなくても読める", () => {
    // e-Stat は 1 件しか無いとき配列にしない。配列前提だと 0 件になる。
    const map = buildAreaMap([
      { "@id": "area", CLASS: { "@code": "13101", "@name": "千代田区" } },
    ]);
    expect(map).toEqual({ "13101": "千代田区" });
  });

  it("area が無ければ空", () => {
    expect(buildAreaMap([{ "@id": "cat01", CLASS: [] }])).toEqual({});
  });
});

describe("1 人あたりの所得", () => {
  it("千円単位を円に直して割る", () => {
    const rows = aggregateWealth(
      response(
        [
          { area: "13101", cat: "C120110", value: "1000000" }, // 千円
          { area: "13101", cat: "C120120", value: "200" }, // 人
        ],
        [{ code: "13101", name: "千代田区" }],
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].areaName).toBe("千代田区");
    expect(rows[0].incomeYen).toBe(1_000_000_000);
    expect(rows[0].incomePerCapita).toBe(5_000_000);
  });

  it("四捨五入して整数にする", () => {
    const rows = aggregateWealth(
      response(
        [
          { area: "01100", cat: "C120110", value: "1000" },
          { area: "01100", cat: "C120120", value: "3" },
        ],
        [{ code: "01100", name: "札幌市" }],
      ),
    );
    // 1,000,000 / 3 = 333333.33...
    expect(rows[0].incomePerCapita).toBe(333_333);
  });

  it("納税者数 0 の行は落とす（0 除算を作らない）", () => {
    const rows = aggregateWealth(
      response(
        [
          { area: "99999", cat: "C120110", value: "5000" },
          { area: "99999", cat: "C120120", value: "0" },
        ],
        [{ code: "99999", name: "欠測" }],
      ),
    );
    expect(rows).toEqual([]);
  });

  it("値が数でない行（欠測）は落ちる", () => {
    // e-Stat は欠測に "-" や "***" を返す。parseFloat が NaN になり、
    // 納税者数の判定（> 0）で落ちる。0 として集計しない。
    const rows = aggregateWealth(
      response(
        [
          { area: "99998", cat: "C120110", value: "5000" },
          { area: "99998", cat: "C120120", value: "-" },
        ],
        [{ code: "99998", name: "欠測" }],
      ),
    );
    expect(rows).toEqual([]);
  });

  it("地域名が分類に無ければ「不明」", () => {
    const rows = aggregateWealth(
      response(
        [
          { area: "00000", cat: "C120110", value: "1000" },
          { area: "00000", cat: "C120120", value: "1" },
        ],
        [],
      ),
    );
    expect(rows[0].areaName).toBe("不明");
  });

  it("複数の市区町村をそれぞれまとめる", () => {
    const rows = aggregateWealth(
      response(
        [
          { area: "13101", cat: "C120110", value: "1000" },
          { area: "13101", cat: "C120120", value: "1" },
          { area: "01100", cat: "C120110", value: "2000" },
          { area: "01100", cat: "C120120", value: "1" },
        ],
        [
          { code: "13101", name: "千代田区" },
          { code: "01100", name: "札幌市" },
        ],
      ),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.areaCode).sort()).toEqual(["01100", "13101"]);
  });
});
