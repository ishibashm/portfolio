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

  it("アイコンだけのボタンに英語の title を残さない", () => {
    for (const f of FILES) {
      const body = readFileSync(f, "utf8");
      expect(body, f).not.toMatch(/title="[A-Za-z][A-Za-z ]+"/);
    }
  });
});
