import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/*
  ## 何を見る検査か

  **Leaflet の `Marker` は、既定でキーボードの押し所になる。**
  `keyboard`（既定 true）が `tabindex="0"` と `role="button"` を付けるので、
  `interactive={false}` を渡してある**飾りの札まで押し所として並ぶ。**

  2026-09-13 に実測して見つけた。ダッシュボードの地図と物件検索の地図で、
  それぞれ 9 個のうち 9 個が tab で止まり、**中身は方位の札（暗剣・大吉）や
  件数の数字で、押しても何も起きない。**読み上げは「ボタン」と言う。

  規則は 2 つ。

  1. 押せない `Marker`（子の吹き出しも `eventHandlers` も持たない）は
     飾りか目印なので `keyboard={false}` を付けて巡回から外す
  2. 押せる `Marker`（吹き出しを持つ、または `eventHandlers` を持つ）は
     `alt` で名前を付ける
     （Leaflet は `alt` を画像の代替文にする。無いと名前の無いボタンになる）

  字面で見る。JSX を評価すると Leaflet を読み込むことになり、DOM の無い
  ところで動かない。
*/

const FILES = [
  "src/components/ArbitrageMapInner.tsx",
  "src/components/LocationPickerInner.tsx",
  "src/components/MagneticMapInner.tsx",
  "src/components/WealthMap.tsx",
  "src/components/nba/PastMoveMap.tsx",
  "src/components/nba/SimulatorMap.tsx",
  "src/components/relocation/YieldMapInner.tsx",
];

interface MarkerTag {
  file: string;
  line: number;
  interactive: boolean;
  hasKeyboardFalse: boolean;
  hasAlt: boolean;
}

/** `<Marker` の開きタグを拾う。`{}` の入れ子を数えて、属性の中の `>` で切らない。 */
function markerTags(file: string): MarkerTag[] {
  const src = readFileSync(file, "utf8");
  const out: MarkerTag[] = [];
  let i = 0;
  for (;;) {
    i = src.indexOf("<Marker", i);
    if (i < 0) break;
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const tag = src.slice(i, j + 1);
    out.push({
      file,
      line: src.slice(0, i).split("\n").length,
      /* 子（吹き出し）を持つか、押したときの手当てがあるなら押せる。
         自己終了タグでも eventHandlers を持つものがある（一帯をまとめた
         目印は押すと寄る） */
      interactive:
        !tag.trimEnd().endsWith("/>") || tag.includes("eventHandlers"),
      hasKeyboardFalse: tag.includes("keyboard={false}"),
      hasAlt: /\balt=/.test(tag),
    });
    i = j + 1;
  }
  return out;
}

const ALL = FILES.flatMap(markerTags);

/** まだ直していないもの。**減らす方向にだけ動かす。** */
const KNOWN_UNFIXED = [
  "src/components/LocationPickerInner.tsx:91",
  "src/components/WealthMap.tsx:103",
  "src/components/WealthMap.tsx:135",
  "src/components/nba/PastMoveMap.tsx:227",
  "src/components/nba/PastMoveMap.tsx:241",
  "src/components/nba/SimulatorMap.tsx:340",
  "src/components/nba/SimulatorMap.tsx:367",
  "src/components/relocation/YieldMapInner.tsx:86",
];

describe("地図の目印がキーボードの押し所として空回りしていない", () => {
  it("拾えている（空回りしていない）", () => {
    /* 字面で拾う検査なので、0 件のまま緑になる事故を防ぐ */
    expect(ALL.length).toBeGreaterThan(10);
  });

  it("押せない目印は、キーボードの巡回から外してある", () => {
    const bad = ALL.filter((m) => !m.interactive && !m.hasKeyboardFalse)
      .map((m) => `${m.file}:${m.line}`)
      .filter((k) => !KNOWN_UNFIXED.includes(k));
    expect(bad).toEqual([]);
  });

  it("押せる目印には名前（alt）がある", () => {
    const bad = ALL.filter((m) => m.interactive && !m.hasAlt)
      .map((m) => `${m.file}:${m.line}`)
      .filter((k) => !KNOWN_UNFIXED.includes(k));
    expect(bad).toEqual([]);
  });

  it("直したものを、直していない一覧に残していない", () => {
    /* 直したら KNOWN_UNFIXED から消す。消し忘れると次の人が
       「まだ残っている」と読む（panelPalette の KNOWN と同じ作法） */
    const fixed = ALL.filter(
      (m) =>
        KNOWN_UNFIXED.includes(`${m.file}:${m.line}`) &&
        (m.interactive ? m.hasAlt : m.hasKeyboardFalse),
    ).map((m) => `${m.file}:${m.line}`);
    expect(fixed).toEqual([]);
  });
});
