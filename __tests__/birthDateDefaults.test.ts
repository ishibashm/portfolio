import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchMetaphysicalData } from "@/utils/metaphysicalApis";

/**
 * 運営者の生年月日（1988-11-25T04:26）が既定値として残っていないこと。
 *
 * 物件スキャナーは #202・#208 で直し、__tests__/arbitrageDefaults.test.ts が
 * 見張っている。ここはそれ以外の場所。同じ不具合が 2 つの形で出ていた。
 *
 *   1. 入れていない人に、他人の命式で本命殺・天中殺の判定が出る
 *   2. 公開リポジトリに、実在する個人の生年月日と出生時刻が置かれている
 *
 * 1 は「今日生まれ」に落としても直らない（parseSafeDate の既定が new Date()）。
 * 未入力は未入力として扱い、個人の判定そのものを出さないところまでやる。
 *
 * ソースを読んで見ている。どちらも大きなクライアント component で、
 * 描画して初期 state を確かめるのが現実的でないため。
 */

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8")
    .split("\r\n")
    .join("\n");

/** 説明の文中に出てくるぶんは通す。コードに書かれた日付だけを弾く。 */
const asLiteral = (src: string) =>
  [...src.matchAll(/["'`]([^"'`\n]*1988-11-25[^"'`\n]*)["'`]/g)].map(
    (m) => m[0],
  );

describe("引越しシミュレータ", () => {
  const src = read("src", "app", "relocation", "simulator", "page.tsx");

  it("ページを読めている（空回りしていない）", () => {
    expect(src.length).toBeGreaterThan(10000);
    expect(src).toContain("hasOwnInput");
  });

  it("運営者の生年月日がコードに残っていない", () => {
    expect(asLiteral(src)).toEqual([]);
  });

  it("生年月日の初期値が空", () => {
    expect(src).toContain('const [birthDate, setBirthDate] = useState("");');
  });

  it("例を開いたときは、例だと分かる生年月日を入れる", () => {
    expect(src).toContain('const EXAMPLE_BIRTH_DATE = "1990-01-01T12:00";');
    expect(src).toContain("setBirthDate(EXAMPLE_BIRTH_DATE);");
  });

  it("下書きに生年月日を保存し、あるときだけ判定まで戻す", () => {
    // 既定値を外す前は保存していなかった。保存しないままだと、下書きを
    // 復元した人の生年月日だけが空になり「今日生まれ」に落ちる。
    expect(src).toContain("birthDate: bDate,");
    expect(src).toContain(
      'if (typeof draft.birthDate === "string" && draft.birthDate) {',
    );
  });

  it("何も入れていない人には入口だけを出す門が残っている", () => {
    expect(src).toContain("{!hasOwnInput ? (");
  });
});

describe("時期ヒートマップ", () => {
  const src = read("src", "app", "relocation", "timing", "page.tsx");

  it("ページを読めている（空回りしていない）", () => {
    expect(src.length).toBeGreaterThan(5000);
    expect(src).toContain("canScan");
  });

  it("運営者の生年月日がコードに残っていない", () => {
    expect(asLiteral(src)).toEqual([]);
  });

  it("生年月日が無ければ空のまま持つ", () => {
    expect(src).toContain('birthDate: ls("arb_birthDate") || "",');
  });

  it("揃っていないときは走査しない仕組みが残っている", () => {
    expect(src).toContain(
      "const canScan = Boolean(settings?.baseLon && settings?.birthDate);",
    );
  });
});

describe("天地人マトリクス", () => {
  const src = read("src", "components", "nba", "TenChiJinEvaluation.tsx");

  it("運営者の生年月日がコードに残っていない", () => {
    expect(asLiteral(src)).toEqual([]);
  });

  it("生年月日の既定値が空", () => {
    expect(src).toContain('birthDate = "",');
  });

  it("生年月日が無ければ指数を出さない", () => {
    // parseSafeDate の既定は new Date()。空文字のまま計算させると
    // 「今日生まれ」の本命星で総合シンクロ指数が出る。
    expect(src).toContain("if (!birthDate) {");
    expect(src).toContain("生年月日が未入力です。");
  });
});

describe("/api/nba", () => {
  const src = read("src", "app", "api", "nba", "route.ts");

  it("運営者の生年月日がコードに残っていない", () => {
    expect(asLiteral(src)).toEqual([]);
  });

  it("生年月日が無ければ null のまま渡す", () => {
    expect(src).toContain(
      "const targetBirthDate = birthDateStr ? new Date(birthDateStr) : null;",
    );
  });
});

describe("fetchMetaphysicalData", () => {
  const today = new Date("2026-08-13T00:00:00+09:00");

  it("生年月日が無ければ、生年月日から決まるものを出さない", () => {
    const d = fetchMetaphysicalData(null, today, null);

    expect(d.divineApi.numerology).toBeNull();
    expect(d.astrologyApi.horoscope).toBeNull();
    expect(d.astrologyApi.aspects).toEqual([]);
    expect(d.vedAstro.activeDasha).toBeNull();
    expect(d.chineseMetasoft.daYunPillar).toBeNull();
    expect(d.ziWeiDouShu).toBeUndefined();
    expect(d.nineStarKi).toBeUndefined();
    expect(d.mayaTzolkin).toBeUndefined();
    expect(d.kabbalahTree).toBeUndefined();
    expect(d.humanDesign).toBeUndefined();
  });

  it("当日から決まるものは、生年月日が無くても出す", () => {
    const d = fetchMetaphysicalData(null, today, null);

    expect(d.divineApi.tarot.name).toBeTruthy();
    expect(d.roxyApi.ichingCast.hexagramNumber).toBeGreaterThan(0);
    expect(d.chineseMetasoft.qiMenGate.name).toBeTruthy();
    expect(d.geomancy?.figureName).toBeTruthy();
  });

  it("生年月日があれば、これまでどおり全部出る", () => {
    const d = fetchMetaphysicalData(new Date("1990-01-01T12:00"), today, null);

    expect(d.divineApi.numerology?.lifePathNumber).toBeGreaterThan(0);
    expect(d.astrologyApi.horoscope).toContain("本日の星回り");
    expect(d.astrologyApi.aspects.length).toBeGreaterThan(0);
    expect(d.vedAstro.activeDasha).toBeTruthy();
    expect(d.nineStarKi?.yearStar).toBeTruthy();
    expect(d.humanDesign?.chartType).toBeTruthy();
  });
});
