import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  「生年月日が未登録のまま判定を出している」ことの断りは、**1 つの部品**
  （`SampleProfileNotice`）に寄せる。

  ## なぜ

  2026-09-14 に実測したところ、同じ状況に **3 通りの言い方**があった。

    ホーム・ダッシュボード  「これは見本です。…2000 年 1 月 1 日生まれ
                            （一白水星）の例で出しています」
    /calendar の吉日        「いまの結果は仮の設定によるものです」
    QuickProfileBar         「仮の値（2000-01-01・東京）で計算した結果です」

  言い方が違うと「これは別のことを言っているのか」と読める。CLAUDE.md
  4 節「サイトの言葉と評価の一貫性」。**文の骨格を 1 つにして、差し替える
  のは中身（`what` / `unaffected`）だけ**にする。

  ## 取りこぼしの経緯

  この件は `見本` / `SampleProfileNotice` という**語**で grep して探した
  ため、`usingDefaults` という別の名前で実装されていた /calendar を一度
  取りこぼした（同じ session で 2 回目）。**字面で探すと取りこぼす**
  （CLAUDE.md 4 節）。ここでは「既定の生年月日を持つファイル」を母集団に
  取って、そこから当たる。
*/

const NOTICE = "src/components/profile/SampleProfileNotice.tsx";

/** 既定の生年月日（2000-01-01）を持っているファイル。 */
function filesWithDefaultBirthDate(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      const src = readFileSync(full, "utf8");
      if (src.includes("2000-01-01")) out.push(full);
    }
  };
  walk(join(process.cwd(), "src"));
  return out;
}

describe("未登録の断りは 1 つの部品に寄っている", () => {
  const files = filesWithDefaultBirthDate();

  it("見張りが空回りしていない（既定値を持つファイルを見つけている）", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith("AuspiciousDayFinder.tsx"))).toBe(true);
  });

  it("画面ごとの独自の見出しを持っていない", () => {
    /* 以前 /calendar が持っていた言い方。復活したら落ちる */
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toContain("いまの結果は仮の設定によるものです");
    }
  });

  it("/calendar の吉日は共通の部品を通している", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/relocation/AuspiciousDayFinder.tsx"),
      "utf8",
    );
    expect(src).toContain("<SampleProfileNotice");
    /* 結果が出る前から断る。以前は `summaries &&` で、既定値のまま
       押す瞬間には何も書いていなかった */
    expect(src).not.toContain("summaries && usingDefaults");
    expect(src).toContain("{usingDefaults && (");
  });
});

describe("部品の書き方の決め", () => {
  const SRC = readFileSync(join(process.cwd(), NOTICE), "utf8");

  it("何が見本かを呼ぶ側が決められる", () => {
    /* 画面ごとに見本なのが何かは違う。文の骨格だけ共通にする */
    expect(SRC).toContain("what = ");
    expect(SRC).toContain("unaffected = ");
  });

  it("登録への入口をその場に置いている", () => {
    /* 「あなたのではありません」で終えると、次に何をすればよいか分からない */
    expect(SRC).toContain('href="/profile"');
    expect(SRC).toContain("自分の生年月日で見る");
  });

  it("誰の例かを具体的に書いている", () => {
    /* 「例です」とだけ書くと、自分の判定だと思ったまま読み進められる */
    expect(SRC).toContain("これは見本です。");
    expect(SRC).toContain("birthLabel");
  });

  it("押せる大きさがある（24px 以上）", () => {
    expect(SRC).toContain("min-h-[24px]");
  });
});
