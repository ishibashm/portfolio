import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 「今日の方位と時刻を確かめる」の入力欄と選択欄に、読み上げ用の名前が
 * 付いているか。
 *
 * 総点検（2026-09-13）で、目的地タブの select 2 つ・日付欄・座標の欄 4 つ、
 * スコアカードの select 3 つに名前が無かった。見た目は隣の文字が
 * ラベルの役をしているが、`<label>` が結び付いていないので支援技術には
 * 「コンボボックス」としか読まれない。◀ ▶ の 2 つのボタンは
 * `title="Previous Day"` の英語だけで、aria-label も無かった。
 *
 * ここでは字面で見る。`<input` / `<select` の開きタグに aria-label か
 * aria-labelledby か id（label の htmlFor と結ぶ）があるか、直前 4 行に
 * `<label` があれば通す。
 */
const FILES = [
  "src/components/SolarTimeClock.tsx",
  "src/components/home/DestinationMapPanel.tsx",
  "src/components/home/QuickProfileBar.tsx",
  "src/components/home/ScorecardPanel.tsx",
  "src/components/home/ConsultPanel.tsx",
  "src/components/PersonalProfileConfig.tsx",
  "src/components/SolarTimeTable.tsx",
  "src/components/BioMagneticDashboard.tsx",
  "src/components/TacticalMagneticMap.tsx",
  "src/components/MagneticMapInner.tsx",
  "src/components/MagneticSpatialHUD.tsx",
];

function unlabeledControls(path: string): string[] {
  const lines = readFileSync(path, "utf8").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/<(input|select)\b/.test(lines[i])) continue;
    let j = i;
    let tag = lines[i];
    while (!lines[j].includes(">") && j < i + 20) {
      j++;
      tag += lines[j];
    }
    if (/type="hidden"/.test(tag)) continue;
    const named = /aria-label=|aria-labelledby=|\bid=/.test(tag);
    const wrapped = lines
      .slice(Math.max(0, i - 4), i)
      .some((l) => l.includes("<label"));
    if (!named && !wrapped) out.push(`${path}:${i + 1}`);
  }
  return out;
}

describe("dashboard の入力欄・選択欄には読み上げ用の名前がある", () => {
  for (const f of FILES) {
    it(f, () => {
      expect(unlabeledControls(f)).toEqual([]);
    });
  }

  it("記号だけのボタン（✕ など）には aria-label がある", () => {
    /* `<button ...>` の開きタグは onClick の `=>` に `>` を含むので、
       波括弧の深さを数えて閉じを探す。単純な `[^>]*` だと ✕ の閉じる
       ボタンを見落とす（実際に 1 つ素通りしていた）。 */
    for (const f of FILES) {
      const s = readFileSync(f, "utf8");
      const re = /<button\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        let i = m.index + m[0].length;
        let depth = 0;
        for (; i < s.length; i++) {
          const c = s[i];
          if (c === "{") depth++;
          else if (c === "}") depth--;
          else if (c === ">" && depth === 0) break;
        }
        const attrs = s.slice(m.index, i);
        const close = s.indexOf("</button>", i);
        const child = s.slice(i + 1, close).trim();
        if (!child || child.includes("<") || child.includes("{")) continue;
        const hasWords =
          /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z0-9]/u.test(
            child,
          );
        if (!hasWords) {
          expect(
            attrs,
            `${f}:${s.slice(0, m.index).split("\n").length}`,
          ).toMatch(/aria-label=/);
        }
      }
    }
  });

  it("英語だけの文（行ごと英語の text node）を残さない", () => {
    /* 「YEAR: JUPITER RESONANCE」「EXAMINE」のように、開きタグの次の行に
       英語だけの行が置かれている形。1 行に `>English<` と書かれた形は
       別の検査（#1268 まで）で拾ったが、こちらは行が分かれていて
       素通りしていた（2026-09-13 に 7 件）。直前の空でない行が `>` で
       終わり、直後の空でない行が `<` で始まるものを text node とみなす。
       CSV の列名や JSX 式（波括弧）は対象にしない。 */
    const hits: string[] = [];
    for (const f of FILES) {
      const lines = readFileSync(f, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!/^\s*[A-Z][A-Za-z0-9 :&/().,'+-]{2,}\s*$/.test(lines[i])) continue;
        let p = i - 1;
        while (p >= 0 && !lines[p].trim()) p--;
        let n = i + 1;
        while (n < lines.length && !lines[n].trim()) n++;
        if (
          p >= 0 &&
          n < lines.length &&
          lines[p].trimEnd().endsWith(">") &&
          lines[n].trimStart().startsWith("<")
        ) {
          hits.push(`${f}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("判定の内部コードを、そのまま画面に出していない", () => {
    /*
      2026-09-13 に利用者の画面で見つけた。盤の升目が判定を内部のコード
      （`GOU` `ANKEN` `OPTIMAL_REGULAR` `GETSUTEKI` …）のまま出していた。

          {status.replace("NOISE_", "")}

      **この形は上の「英語だけの text node」の検査に当たらない。**text node
      ではなく式なので素通りする。呼び名は `lib/directionLabels` の対応表
      （#1273 で寄せた）を引く。
    */
    const bad: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        /* コードの前置きを剥がして出す形。文字列の比較（=== や
           startsWith）は判定の分岐なので対象にしない */
        if (/\{[^}]*\breplace\(\s*["'`]NOISE_["'`]/.test(line)) {
          bad.push(`${f}:${i + 1}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it("アイコンだけのボタンに英語の title を残さない", () => {
    for (const f of FILES) {
      const body = readFileSync(f, "utf8");
      expect(body, f).not.toMatch(/title="[A-Za-z][A-Za-z ]+"/);
    }
  });
});
