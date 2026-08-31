import { describe, expect, it } from "vitest";
import { ALL_MUNICIPALITIES } from "@/lib/municipalityCoords";
import { AREAS } from "@/lib/areaContent";
import jis from "../scripts/jis_city_codes.json";

/**
 * 全国の市区町村の代表点が、**掲載の有無と無関係な母集団**になっているか。
 *
 * この表は「その方位に街があるか」を、賃貸の掲載と切り離して答えるために
 * 入れた（#832〜#834 で直した不具合の根治）。母集団が痩せていると
 * 同じ間違いが戻るので、件数と代表例を固定する。
 */

const jisAll = Object.values(
  jis as Record<string, { code: string; name: string }[]>,
).flat();

describe("全国の市区町村の代表点", () => {
  it("JIS の一覧をほぼ覆っている", () => {
    /* 覆えないのは政令市の親コード 20（01100 札幌市など。区の側が
       入っているので二重に数えないためむしろ正しい）・北方領土 6・
       出典に地点が無い 2（利島村・湯前町）の計 28。それ以外が落ちたら
       出典か生成が壊れている */
    const codes = new Set(ALL_MUNICIPALITIES.map((a) => a.code));
    const missing = jisAll.filter((x) => !codes.has(x.code));
    expect(missing.length).toBeLessThanOrEqual(28);
    expect(ALL_MUNICIPALITIES.length).toBeGreaterThan(1880);
  });

  it("掲載のある市区町村は 1 つ残らず引ける", () => {
    /* 引けないものがあると、その市区町村を出発地にした頁で
       「街があるか」の判定だけ穴が開く */
    const codes = new Set(ALL_MUNICIPALITIES.map((a) => a.code));
    expect(AREAS.filter((a) => !codes.has(a.code)).map((a) => a.code)).toEqual(
      [],
    );
  });

  it("座標が日本の範囲に入っている", () => {
    /* 出典には緯度経度が空の行がある。Number("") は 0 で
       Number.isFinite(0) は true なので、素通しすると赤道・グリニッジの
       点が平均に混ざる。実際に篠栗町の代表点がインド洋（19.2, 74.6）に
       なっていた */
    const out = ALL_MUNICIPALITIES.filter(
      (a) => a.lat < 20 || a.lat > 46 || a.lon < 122 || a.lon > 154,
    );
    expect(out.map((a) => `${a.code} ${a.city} ${a.lat},${a.lon}`)).toEqual([]);
  });

  it("掲載のある市区町村とは近い（作り方が違っても方位を分けられる）", () => {
    /* areaDirections は掲載物件の平均、こちらは町丁目の平均。ずれるのは
       当然だが、方位を分けられないほど離れていたら使えない */
    const byCode = new Map(ALL_MUNICIPALITIES.map((a) => [a.code, a]));
    let worst = 0;
    for (const a of AREAS) {
      const g = byCode.get(a.code);
      if (!g || g.lat === a.lat) continue; // 合流で埋めた分は同じ点
      const dy = (g.lat - a.lat) * 111;
      const dx = (g.lon - a.lon) * 111 * Math.cos((a.lat * Math.PI) / 180);
      worst = Math.max(worst, Math.hypot(dx, dy));
    }
    expect(worst).toBeLessThan(20);
  });

  it("#832〜#834 の反例が引ける", () => {
    /* 頁が「行き止まり」と書いていた方位に実在した市区町村。ここが
       引けなくなったら、この表を入れた意味が無い */
    const byCity = new Map(ALL_MUNICIPALITIES.map((a) => [a.city, a]));
    for (const city of [
      "五島市",
      "南松浦郡新上五島町",
      "壱岐市",
      "対馬市",
      "厚岸郡厚岸町",
      "根室市",
      "中川郡美深町",
      "吉野郡上北山村",
      "虻田郡喜茂別町",
      "島尻郡久米島町",
    ]) {
      expect(byCity.get(city), city).toBeDefined();
    }
  });
});
