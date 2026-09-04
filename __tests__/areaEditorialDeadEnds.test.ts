import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import {
  AREAS,
  emptyDirections,
  findArea,
  neighboursByDirection,
} from "@/lib/areaContent";
import { mergeWithListed } from "@/lib/municipalityCoords";
import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
} from "@/utils/directionGeo";
import { DIRECTION_LABELS } from "@/lib/kigakuContent";

/** 掲載の有無と無関係な全市区町村。距離で切らない母集団として使う。 */
const ALL_MUNICIPALITIES = mergeWithListed(AREAS);

/** 行き止まりを断定している言い回し。否定形（「〜ではなく」「〜ではありません」）は通す。 */
const DEAD_END_WORDING =
  /行き止まり(?!では(なく|ありません))|候補がまったくありません|市区町村が 1 つもありません|市区町村が存在しない/;

/**
 * その方位に、**5km 未満の**市区町村があるか。
 *
 * MIN_KM は「近すぎる相手は方位が定まらない」という一覧の規則で、
 * 街の有無とは関係が無い。emptyDirections はこれを通した母集団で
 * 「街があるか」を数えているので、隣に街のある方位が行き止まりに化ける。
 */
function tooCloseIn(area: (typeof AREAS)[number], direction: string) {
  return ALL_MUNICIPALITIES.find((m) => {
    if (m.code === area.code) return false;
    const km = distanceKmBetween(area.lat, area.lon, m.lat, m.lon);
    if (km >= 5) return false;
    return (
      directionFromBearing(
        bearingBetween(area.lat, area.lon, m.lat, m.lon),
        "traditional",
      ) === direction
    );
  });
}

/** いまの規則での行き止まり。近すぎて外れているだけの方位は含めない。 */
function nowIsDeadEnd(e: {
  hasBeyondRange: boolean;
  hasAnyMunicipality: boolean;
  hasNearMunicipality: boolean;
}) {
  return !e.hasBeyondRange && !e.hasAnyMunicipality && !e.hasNearMunicipality;
}

/**
 * 文がその方位に触れているか。
 *
 * 「東」は「南東」「北東」の一部でもあるので、**二字の方位を先に
 * 取り除いてから**一字を探す。これをしないと、南東の説明を東の説明と
 * 取り違える。
 */
function mentionsDirection(sentence: string, label: string): boolean {
  if (label.length > 1) return sentence.includes(label);
  return sentence.replace(/北東|北西|南東|南西/g, "").includes(label);
}

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

  /*
    上の検査は `hasBeyondRange`（遠くにはある）だけを見ていて、
    **「空だと書いた方位に、頁の一覧がその場で出している」**を見ていな
    かった。実際に見落としていた（2026-09-03）。南相馬市の文章は
    「東と南東にはこの一覧の候補が 1 つもありません」だったが、毎晩の
    巡回で代表点が動き、浪江町（16km）が南東に入った。頁は南東に
    浪江町を出しながら、本文は「1 つもありません」と言っていた。

    `emptyDirections` はその方位を「空」として挙げないので、上の検査は
    素通りする。**空でない方位の断定**は、こちらで拾う。
  */
  it("断定している方位を、頁の一覧がその場で出していない", () => {
    const wrong: string[] = [];

    for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
      const area = findArea(code);
      if (!area) continue;
      const groups = neighboursByDirection(area) as Record<string, unknown[]>;

      for (const paragraph of editorial.intro) {
        for (const dir of assertedEmptyDirections(paragraph)) {
          const n = groups[dir]?.length ?? 0;
          if (n > 0) wrong.push(`${code} ${area.full}: ${dir} に ${n} 件`);
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

  it("「近すぎて外れているだけ」の方位を、行き止まりと書いていない", () => {
    /* 2026-09-04 に見つけた。**分類そのものが間違っていた。**

       emptyDirections は「その方位に街があるか」を 5km 未満を除いた
       母集団で数える。MIN_KM は「近すぎる相手は方位が定まらない」と
       いう一覧の規則で、**街の有無とは関係が無い**。それなのに同じ
       ふるいを通していたので、**すぐ隣に街がある方位が「掲載と関係
       なく市区町村が存在しない行き止まり」に化けていた。**

       全国 226 の「真の行き止まり」のうち 6 方位（6 頁）がこれで、
       うち 5 頁は断定する文章を書いていた。

           長生村   南東 … 一宮町   4.88km
           日高町   南   … 美浜町   2.94km
           宜野湾市 南東 … 中城村   2.71km
           豊見城市 南   … 糸満市   4.13km
           南風原町 南東 … 南城市   4.65km

       上の 2 つの検査は素通りする。1 つ目は hasBeyondRange しか見ず、
       2 つ目は頁の一覧（同じく 5km で切る）しか見ないため。**同じ
       ふるいを通した者どうしで突き合わせても、ふるいの誤りは出ない。**

       ここでは母集団を**距離で切らずに**取り直す。方位を文から取り出す
       のは当てにならないので、その方位の名前が段落に出ていて、かつ
       同じ段落が断定の言い回しを使っていたら落とす。#832〜#834 の
       ときと同じで、**断定を禁じるのではなく確かめる。** */
    const bad: string[] = [];

    for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
      const area = findArea(code);
      if (!area) continue;

      for (const e of emptyDirections(area)) {
        if (e.hasBeyondRange || e.hasAnyMunicipality) continue;
        const near = tooCloseIn(area, e.direction);
        if (!near) continue;

        const label = DIRECTION_LABELS[e.direction];
        for (const paragraph of editorial.intro) {
          /* **文の単位で見る。**段落で見ると、同じ段落の別の方位を
             説明した断定を拾ってしまう。長生村の段落は「東は……市区
             町村が存在しない行き止まり」と「南東には一宮町があります
             が近すぎて外れる」を並べて書いており、正しいのに落ちた。 */
          for (const sentence of paragraph.split("。")) {
            if (!mentionsDirection(sentence, label)) continue;
            const m = sentence.match(DEAD_END_WORDING);
            if (m) {
              bad.push(
                `${code} ${area.full}: ${label} は ${near.city}（` +
                  `${distanceKmBetween(area.lat, area.lon, near.lat, near.lon).toFixed(2)}km）` +
                  `が近すぎて外れているだけ — 「${m[0]}」`,
              );
            }
          }
        }
      }
    }

    expect(bad).toEqual([]);
  });

  it("近すぎるだけの方位を、行き止まりと分類していない", () => {
    /* **分類そのものの検査。**文章の側だけ直しても、頁が自分で出す
       「市区町村が 1 つも無い方位。海や山で陸が尽きています」が残る。

       旧実装（hasNearMunicipality を見ない 3 分類）をここに写して、
       **旧の規則ならこの 6 方位を行き止まりと呼ぶ**ことを固定する。
       戻したらこの検査が落ちる。 */
    const oldIsDeadEnd = (e: {
      hasBeyondRange: boolean;
      hasAnyMunicipality: boolean;
    }) => !e.hasBeyondRange && !e.hasAnyMunicipality;

    const artefacts: string[] = [];
    for (const area of AREAS) {
      for (const e of emptyDirections(area)) {
        if (!e.hasNearMunicipality) continue;
        if (e.hasBeyondRange || e.hasAnyMunicipality) continue;
        /* 旧の規則では行き止まりだった（＝これが直した対象） */
        expect(oldIsDeadEnd(e)).toBe(true);
        /* 新の規則では行き止まりではない */
        expect(nowIsDeadEnd(e)).toBe(false);
        expect(e.nearestTooClose.length).toBeGreaterThan(0);
        artefacts.push(
          `${area.code} ${area.full} ${DIRECTION_LABELS[e.direction]} ← ` +
            e.nearestTooClose
              .map((n) => `${n.city}(${n.distanceKm}km)`)
              .join(" "),
        );
      }
    }

    /* 空回りさせない。実測 6 方位で、うち 5 頁には手書きの文章がある。
       数そのものは巡回で代表点が動くと変わりうるので、**1 件以上ある
       こと**と、既知の 2 件が含まれることを見る。 */
    expect(artefacts.length).toBeGreaterThan(0);
    expect(
      artefacts.some((a) => a.startsWith("12423 ") && a.includes("南東")),
    ).toBe(true);
    expect(
      artefacts.some((a) => a.startsWith("47348 ") && a.includes("南")),
    ).toBe(true);
  });

  it("行き止まりの判定に、近すぎる相手が混ざっていない", () => {
    /* 上の裏返し。**行き止まりと呼ぶ方位には、5km 未満の市区町村が
       1 つも無い**こと。これが崩れたら、また嘘を出している。 */
    const bad: string[] = [];
    for (const area of AREAS) {
      for (const e of emptyDirections(area)) {
        if (!nowIsDeadEnd(e)) continue;
        const near = tooCloseIn(area, e.direction);
        if (near) {
          bad.push(
            `${area.code} ${area.full} ${DIRECTION_LABELS[e.direction]}: ${near.city}`,
          );
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("文の単位で方位を取り違えない", () => {
    /* 上の検査は文で切って読む。段落で切ると、同じ段落の別の方位を
       説明した断定を拾う（長生村の段落は「東は……市区町村が存在しない
       行き止まり」と「南東には一宮町があり近すぎて外れる」を並べる）。 */
    const paragraph =
      "東と南東にこの一覧の候補が 1 つもありません。東は掲載と関係なく市区町村が存在しない行き止まりで、その先は太平洋です。南東には一宮町がありますが、4.9km と近く、方位の定まらない範囲として一覧から外れています。";
    const sentences = paragraph.split("。");
    expect(
      sentences.some(
        (x) => mentionsDirection(x, "南東") && DEAD_END_WORDING.test(x),
      ),
    ).toBe(false);
    expect(
      sentences.some(
        (x) => mentionsDirection(x, "東") && DEAD_END_WORDING.test(x),
      ),
    ).toBe(true);

    /* 一字の方位が二字の方位に飲み込まれないこと */
    expect(mentionsDirection("南東には街があります", "東")).toBe(false);
    expect(mentionsDirection("東には街があります", "東")).toBe(true);
    expect(mentionsDirection("北西と南西は海です", "西")).toBe(false);

    /* 否定形は断定として拾わない */
    expect(DEAD_END_WORDING.test("こちらは行き止まりではありません")).toBe(
      false,
    );
    expect(DEAD_END_WORDING.test("行き止まりではなく遠いだけです")).toBe(false);
    expect(DEAD_END_WORDING.test("南は海で行き止まりです")).toBe(true);
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
