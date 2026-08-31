import { describe, expect, it } from "vitest";
import { AREAS, emptyDirections, findArea } from "@/lib/areaContent";

/**
 * 候補の入らない方位を、**3 通りに分けられているか。**
 *
 * ## なぜ要るか
 *
 * 頁は長らく「海や山で行き止まりになるため、暦の上でこの方位が吉に
 * 出ても引越し先の候補がありません」と断定していた。**成り立って
 * いなかった。**一覧の母集団は賃貸の掲載を集計できた市区町村
 * （全国 1,917 のうち 1,119）で、掲載の無い町村は最初から見えない。
 *
 *     長崎市の西「東シナ海で行き止まり」  … 五島市・新上五島町がある
 *     釧路町の東「太平洋で行き止まり」    … 厚岸町・浜中町・根室市がある
 *     札幌市豊平区の西「山地で行き止まり」… 喜茂別町・京極町・ニセコ町がある
 *
 * 掲載と切り離した母集団（municipalityCoords、1,894 件）を当てて
 * 分けたのが `hasAnyMunicipality`。**2026-08-31 の実測で、空の 709 方位が**
 *
 *     遠いだけ      114
 *     掲載漏れ      368
 *     行き止まり    227
 *
 * だった。「行き止まり」と書いていた 595 のうち**正しかったのは 227 だけ。**
 */

interface Counts {
  far: number;
  notListed: number;
  dead: number;
}

function tally(): Counts {
  const c: Counts = { far: 0, notListed: 0, dead: 0 };
  for (const origin of AREAS) {
    for (const e of emptyDirections(origin)) {
      if (e.hasBeyondRange) c.far++;
      else if (e.hasAnyMunicipality) c.notListed++;
      else c.dead++;
    }
  }
  return c;
}

describe("候補の入らない方位の理由", () => {
  const counts = tally();

  it("3 通りのどれもが実在する（分岐が空回りしていない）", () => {
    expect(counts.far).toBeGreaterThan(50);
    expect(counts.notListed).toBeGreaterThan(200);
    expect(counts.dead).toBeGreaterThan(100);
  });

  it("掲載漏れが行き止まりより多い（掲載だけで判断してはいけない）", () => {
    /* ここが逆転したら、掲載の網羅が大きく進んだか、母集団が壊れたか。
       どちらにせよ文言を見直す合図になる */
    expect(counts.notListed).toBeGreaterThan(counts.dead);
  });

  it("掲載で判断していたら間違えた方位を、行き止まりと呼ばない", () => {
    /* 頁が実際に「行き止まり」と書いていた反例。掲載の側だけを見ると
       空だが、街はある */
    const cases: [string, string][] = [
      ["42201", "W"], // 長崎市の西 … 五島市・新上五島町
      ["01105", "W"], // 札幌市豊平区の西 … 喜茂別町・京極町・ニセコ町
      ["29205", "SE"], // 橿原市の南東 … 東吉野村・川上村・上北山村
      ["40133", "NW"], // 福岡市中央区の北西 … 壱岐市・対馬市
      ["47208", "W"], // 浦添市の西 … 渡嘉敷村・座間味村・久米島町
    ];
    for (const [code, dir] of cases) {
      const area = findArea(code);
      expect(area, code).toBeDefined();
      const e = emptyDirections(area!).find((x) => x.direction === dir);
      expect(e, `${code} ${dir} は空のはず`).toBeDefined();
      expect(e!.hasAnyMunicipality, `${code} ${dir}`).toBe(true);
    }
  });

  it("本当に陸が尽きている方位は行き止まりと分かる", () => {
    /* 海に開けていて、どの距離にも市区町村が無い方位。ここが false に
       ならないと、分けた意味が「全部を掲載漏れ扱いする」に落ちる */
    const cases: [string, string][] = [
      ["22102", "S"], // 静岡市駿河区の南 … 駿河湾から太平洋
      ["04103", "E"], // 仙台市若林区の東 … 太平洋
      ["05201", "W"], // 秋田市の西 … 日本海
      ["04104", "SE"], // 仙台市太白区の南東 … 太平洋
    ];
    /* 札幌市北区の北を最初ここに置いていたが、**間違いだった。**
       石狩湾で塞がっている気がするだけで、海岸線が北へ回り込むぶん
       増毛町（84km）・苫前町・羽幌町が真北に入る。掲載が無いだけで
       街はある。**思い込みで書くと外す**という、この節そのものの例 */
    for (const [code, dir] of cases) {
      const area = findArea(code);
      expect(area, code).toBeDefined();
      const e = emptyDirections(area!).find((x) => x.direction === dir);
      expect(e, `${code} ${dir} は空のはず`).toBeDefined();
      expect(e!.hasAnyMunicipality, `${code} ${dir}`).toBe(false);
      expect(e!.hasBeyondRange, `${code} ${dir}`).toBe(false);
    }
  });
});
