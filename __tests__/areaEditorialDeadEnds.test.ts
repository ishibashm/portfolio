import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { emptyDirections, findArea } from "@/lib/areaContent";
import { DIRECTION_LABELS } from "@/lib/kigakuContent";

/**
 * 手書きの文章が「この一覧の候補がありません」と言う方位は、**本当に
 * どの距離にも 1 つも入らない**か。
 *
 * ## なぜ要るか（2026-08-31 に実際に起きた）
 *
 * 長崎市の文章は「西・南西・南には市区町村がありません」と書いていた。
 * ところが**南西には 17 ある**（いちばん近い沖縄県名護市で 710km）。
 * 一覧は 5〜150km で切っているので、頁の表からは消えるが「無い」の
 * ではない。
 *
 * 同じ頁で自動表示（#790）は「150km 以内に市区町村が無い方位: 南西」と
 * 出すので、**同じ画面の中で 2 つの記述が食い違っていた。**
 *
 * ## 言い方も検査する（2026-08-31 に足した）
 *
 * 上の直しでも足りていなかった。この一覧の母集団は
 * areaDirections.json に載っている市区町村で、**全国 1,917 のうち
 * 1,119**。掲載を集計できた分しか無いので、「この一覧に無い」は
 * 「そこに街が無い」を意味しない。
 *
 * それなのに文章は「海や山で行き止まり」と断定していた。**山でも海でも
 * 成り立たなかった。**
 *
 *     札幌市豊平区の西「支笏洞爺の山地で行き止まり」… 喜茂別町・京極町・
 *                                                     真狩村・ニセコ町がある
 *     長崎市の西「東シナ海で行き止まり」            … 五島市・新上五島町・
 *                                                     小値賀町がある
 *     福岡市中央区の北西「玄界灘で行き止まり」      … 壱岐市・対馬市がある
 *     浦添市の西「東シナ海で行き止まり」            … 渡嘉敷村・座間味村・
 *                                                     久米島町がある
 *
 * どれも JIS の一覧（scripts/jis_city_codes.json）にあり、
 * areaDirections.json に無いだけ。**「行き止まり」と言い切れるように
 * なるのは、全 1,917 市区町村の座標を持ってからで、いまは持っていない**
 * （docs/improvement-backlog.md 16 節）。だから断定そのものを禁じる。
 *
 * ## この検査の範囲
 *
 * 1. 「〜にはこの一覧の候補がありません」と断定している方位が、実際に
 *    どの距離にも入らないか
 * 2. 断定の言い方（「行き止まりです」「街に当たりません」）が文章に
 *    混ざっていないか。**否定形（「行き止まりではなく」）は通す**
 */

/** 「◯・◯には市区町村がありません」の形から方位を取り出す。 */
function assertedEmptyDirections(text: string): string[] {
  const found = new Set<string>();
  /* 「西と南」「西・南西・南」「西、南」のどれでも拾う。区切りを
     1 つしか見ていなかったせいで、下の自己検査が空振りを検出した。 */
  const pattern =
    /([北南東西・、と]+)にはこの一覧の候補が(?:\s*1\s*つも)?ありません/g;
  for (const m of text.matchAll(pattern)) {
    for (const jp of m[1].split(/[・、と]/)) {
      const dir = (
        Object.keys(DIRECTION_LABELS) as (keyof typeof DIRECTION_LABELS)[]
      ).find((d) => DIRECTION_LABELS[d] === jp);
      if (dir) found.add(dir);
    }
  }
  return [...found];
}

describe("手書きの「市区町村がありません」は実測と合っているか", () => {
  it("断定している方位は、どの距離にも 1 つも無い", () => {
    const wrong: string[] = [];

    for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
      const area = findArea(code);
      if (!area) continue;
      /* hasBeyondRange が true ＝ 遠くにはある＝「ありません」は言い過ぎ */
      const farOnly = new Set(
        emptyDirections(area)
          .filter((e) => e.hasBeyondRange)
          .map((e) => e.direction),
      );

      for (const paragraph of editorial.intro) {
        for (const dir of assertedEmptyDirections(paragraph)) {
          if (farOnly.has(dir as never)) {
            wrong.push(`${code} ${area.full}: ${dir}`);
          }
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it("取り出しの規則が働いている（空振りしていない）", () => {
    expect(
      assertedEmptyDirections("西と南にはこの一覧の候補が 1 つもありません。"),
    ).toEqual(expect.arrayContaining(["W", "S"]));
    expect(
      assertedEmptyDirections("西・南西・南にはこの一覧の候補がありません。"),
    ).toEqual(expect.arrayContaining(["W", "SW", "S"]));
  });

  it("拾う相手が実在する（言い方を変えたときに空回りしない）", () => {
    /* 上の 1 件目は「断定が実測と合っているか」を見る検査で、文章の
       言い方を変えると 0 件マッチのまま緑になる。**何件拾ったか**を
       ここで固定しておく。#832 で言い方を変えたときに実際に危なかった */
    let hits = 0;
    for (const editorial of Object.values(AREA_EDITORIAL)) {
      for (const paragraph of editorial.intro) {
        hits += assertedEmptyDirections(paragraph).length;
      }
    }
    expect(hits).toBeGreaterThan(40);
  });

  it("「行き止まり」と書いてよいのは、本当に行き止まりの頁だけ", () => {
    /* #835・#836 で全国 1,894 市区町村の代表点を持ったので、**禁じる
       のをやめて確かめる**ようにした。断定してよいのは、その頁に
       「どの距離にも市区町村が無い方位」が実在するときだけ。

       方位まで文から取り出すのは当てにならない（理由を書いた文に方位が
       出てこない。「駿河湾がそのまま太平洋に続くためです」）ので、
       **頁の単位**で見る。行き止まりが 1 つも無い頁が断定していたら
       落とす。#832〜#834 で外した誤りは全部これで拾える（長崎市・
       札幌市豊平区・橿原市・福岡市中央区・浦添市はどれも行き止まりが
       0 件だった）。 */
    const bad: string[] = [];
    for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
      const area = findArea(code);
      if (!area) continue;
      const hasDeadEnd = emptyDirections(area).some(
        (e) => !e.hasBeyondRange && !e.hasAnyMunicipality,
      );
      for (const paragraph of editorial.intro) {
        const m = paragraph.match(
          /行き止まり(?!ではなく)|街に当たらない|街に当たりません/,
        );
        if (m && !hasDeadEnd) bad.push(`${code} ${area.full}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("この検査が働いている（行き止まりの無い頁で断定したら落ちる）", () => {
    /* 断定を許す方向へ緩めたので、**緩めすぎていないこと**を示す。
       平塚市は空の南が掲載漏れ（茅ヶ崎の南に街がある）で、行き止まりは
       0 件。ここで断定したら拾えなければならない */
    const hiratsuka = findArea("14203")!;
    expect(
      emptyDirections(hiratsuka).some(
        (e) => !e.hasBeyondRange && !e.hasAnyMunicipality,
      ),
    ).toBe(false);
    expect(/行き止まり(?!ではなく)/.test("南は相模湾で行き止まりです")).toBe(
      true,
    );
  });

  it("頁と llms.txt の側にも同じ言い切りが残っていない", () => {
    /* AREA_EDITORIAL だけ直しても、**同じ主張が別のところに写って
       いる**。llms-full.txt は「海や山で行き止まりになる方位は、暦の
       上で吉方位が出ても引越し先がありません」と、AI クローラ向けに
       そのまま断定していた（#832 で頁を直したときに見落とした）。

       文言そのものではなく、断定に使っていた言い回しを禁じる。
       「本当に行き止まりの場合もあれば」のような留保つきは通る。 */
    const files = [
      "src/app/llms-full.txt/route.ts",
      "src/app/llms.txt/route.ts",
      "src/app/houi/area/[code]/page.tsx",
      "src/app/houi/pref/[code]/page.tsx",
    ];
    const banned = [
      "行き止まりになる方位",
      "街に当たらない",
      "街に当たりません",
    ];
    const bad: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const phrase of banned) {
        if (text.includes(phrase)) bad.push(`${file}: ${phrase}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("禁じた言い方の検出そのものが働いている", () => {
    expect(/行き止まり(?!ではなく)/.test("南は海で行き止まりです")).toBe(true);
    expect(/行き止まり(?!ではなく)/.test("行き止まりではなく遠いだけ")).toBe(
      false,
    );
  });
});
