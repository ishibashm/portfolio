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
      /* 頁と同じ順。150km 以内に掲載の無い街があれば「掲載漏れ」、
         無くて先にはあれば「遠いだけ」 */
      if (e.hasWithinRangeMunicipality) c.notListed++;
      else if (e.hasAnyMunicipality) c.far++;
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

/**
 * 見る順番と母集団を取り違えていた 2 つ（2026-09-06）。
 *
 *   1. 鹿児島市の南西には南九州市（27km）があるのに、掲載のある市が
 *      150km より先にもあるため「150km 以内に候補が入らない」と出ていた
 *   2. 釧路市の南はいちばん近い街が小笠原村（1,958km）なのに、
 *      hasBeyondRange を掲載のある市だけで数えていたため「街はあるが
 *      掲載が無い」に入り、名前が 1 つも出なかった
 */
describe("150km 以内の街と、150km より先の街を取り違えない", () => {
  /* **市の名前で留めない**（2026-09-09 に落ちた）。もとは「鹿児島市の
     南西に南九州市（27km）がある」で固定していたが、夜間の巡回で
     南さつま市（25km）が南西に入り、**その方位が空でなくなって**
     `find` が undefined を返した。実装は正しいのに検査だけが落ちる。

     代表点は掲載の平均なので毎晩動く。**1 市 1 方位に留めると、
     直したはずの規則ではなく、その晩の掲載を見ていることになる。**
     規則そのものを全件に当てる形へ移した。 */
  it("150km 以内に掲載の無い街があれば、必ず「掲載漏れ」に入る", () => {
    const wrong: string[] = [];
    for (const a of AREAS) {
      for (const e of emptyDirections(a)) {
        /* 旧実装は掲載のある市だけで遠近を数えていたので、150km 以内に
           掲載の無い街があっても「遠いだけ」に落ちた。名前が付いていて
           近いのに hasWithinRangeMunicipality が false なら、それが再発。 */
        const nearest = e.nearestUnlisted[0];
        if (!nearest) continue;
        if (nearest.distanceKm <= 150 && !e.hasWithinRangeMunicipality) {
          wrong.push(
            `${a.full} ${e.direction}: ${nearest.city} ${nearest.distanceKm}km`,
          );
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("この検査が空回りしていない（当てはまる方位が実在する）", () => {
    /* 上は「見つからなければ緑」なので、母数が 0 でも通る。実際に
       150km 以内の掲載漏れが何百とあることを併せて固定する。 */
    let hits = 0;
    for (const a of AREAS) {
      for (const e of emptyDirections(a)) {
        if (e.hasWithinRangeMunicipality && e.nearestUnlisted.length > 0) {
          hits++;
        }
      }
    }
    expect(hits).toBeGreaterThan(100);
  });

  it("釧路市の南は 150km 以内に街が無く、先にはある（遠いだけ）", () => {
    const e = emptyDirections(findArea("01206")!).find(
      (x) => x.direction === "S",
    );
    expect(e?.hasWithinRangeMunicipality).toBe(false);
    expect(e?.hasAnyMunicipality).toBe(true);
    expect(e?.nearestUnlisted).toEqual([]);
  });

  it("「掲載漏れ」の箱に入る方位には必ず名前が付く", () => {
    const bad: string[] = [];
    for (const a of AREAS) {
      for (const e of emptyDirections(a)) {
        if (e.hasWithinRangeMunicipality && e.nearestUnlisted.length === 0) {
          bad.push(`${a.full} ${e.direction}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
