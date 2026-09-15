import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  地点に「物件ページへの印」を入れる画面（`SpotVerdict`）と、
  それを出す地図の吹き出し（`UserSpotLayer`）。

  ## 気にしていること

  1. **取りに行かない。**URL は控えで、中身は取得しない。実装の見張りは
     `userSpotUrlNeverFetched`（母集団ごと走査）。ここでは**画面が
     そう書いているか**を見る（利用者に伝わっていなければ、同じ機能でも
     「読みに行っている」と思われる）
  2. **描く側でも https を確かめる。**保存の入口で落としているが、古い
     端末の localStorage には検証前の値が残りうる
  3. **押し口を増やさない。**保存は「★ この地点を保存」の 1 つだけ
*/

const VERDICT = "src/components/relocation/SpotVerdict.tsx";
const LAYER = "src/components/map/UserSpotLayer.tsx";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("印を入れる画面", () => {
  const SRC = read(VERDICT);

  it("URL と覚え書きを保存に渡している", () => {
    expect(SRC).toContain("url: markUrl");
    expect(SRC).toContain("memo: markMemo");
  });

  it("畳んである（押してから開く）", () => {
    /* 大半の保存は名前だけで足りる。欄を常に出すと 1 押しが 3 つの
       空欄に変わる */
    expect(SRC).toContain("const [showMark, setShowMark] = useState(false)");
    expect(SRC).toContain("aria-expanded={showMark}");
  });

  it("保存の押し口は 1 つだけ", () => {
    /* 「保存」と「印を保存」が並ぶと、どちらを押せばよいか分からない */
    expect(SRC.match(/addUserSpot\(/g) ?? []).toHaveLength(1);
  });

  it("取りに行かないことを画面に書いている", () => {
    expect(SRC).toContain("こちらから中身を読みに行くことはありません");
  });

  it("押せる大きさがある（24px 以上）", () => {
    /*
      `<button ... >` を非貪欲で取ろうとすると、`onClick={() => …}` の
      アロー関数の `>` で切れる（実際に落ちた）。**開始位置から窓で取る。**
    */
    const starts: number[] = [];
    for (
      let i = SRC.indexOf("<button");
      i >= 0;
      i = SRC.indexOf("<button", i + 1)
    ) {
      starts.push(i);
    }
    /* 窓は**次のボタンの手前まで**。固定の長さで切ると、onClick の中身が
       長いボタンで className に届かない（実際に落ちた） */
    const windows = starts.map((i, n) =>
      SRC.slice(i, starts[n + 1] ?? Math.min(i + 900, SRC.length)),
    );
    const spotButtons = windows.filter(
      (b) => b.includes("showMark") || b.includes("addUserSpot"),
    );
    expect(spotButtons.length).toBeGreaterThanOrEqual(2);
    for (const b of spotButtons) {
      expect(b.includes("min-h-[24px]"), b.slice(0, 120)).toBe(true);
    }
  });
});

describe("印を出す吹き出し", () => {
  const SRC = read(LAYER);

  it("新しいタブで開き、rel を付けている", () => {
    expect(SRC).toContain('target="_blank"');
    expect(SRC).toContain('rel="nofollow noopener"');
  });

  it("描く側でも https を確かめている", () => {
    /* 保存の入口（`normalizeSpotUrl`）で落としているが、古い端末の
       localStorage には検証前の値が残りうる。javascript: を描くと
       その地点を開いた本人の画面で任意のコードが走る */
    expect(SRC).toContain('s.url.startsWith("https://")');
  });

  it("URL を取りに行っていない", () => {
    expect(SRC).not.toMatch(/fetch\s*\(\s*[^,)]*\burl\b/);
  });

  it("覚え書きの改行を残して出す", () => {
    /* 保存の側が改行だけ残しているので、描く側も潰さない */
    expect(SRC).toContain("whitespace-pre-line");
  });
});

describe("実装と食い違った文言を残さない", () => {
  it("「サーバーには送りません」が消えている", () => {
    /* #25 でログイン中はクラウドにも保存するようになった。
       古い文言のままだと、利用者は端末だけの記録だと思う */
    for (const rel of [VERDICT, LAYER]) {
      expect(read(rel), rel).not.toContain("サーバーには送りません");
      expect(read(rel), rel).not.toContain("サーバーには送らない");
    }
  });

  it("端末をまたいで残ることを書いている", () => {
    expect(read(LAYER)).toContain("端末をまたいで残ります");
  });
});

/*
  貼った URL から場所を決める導線（#1312 で route 側が出来た）。

  ## 気にしていること

  1. **貼れることを画面が言っている。**出来るのに書いていなければ、
     利用者にとっては無いのと同じ
  2. **開きに行かないことも同じ場所で言う。**「URL を貼ると調べます」だけ
     だと、こちらが物件ページを読みに行くと思われる
  3. **物件ごとのページでは決まらないことを先に言う。**404 を見てから
     気付くより、貼る前に分かるほうがよい
  4. **API の文言を捨てない。**どんな失敗も「その住所は見つかりません
     でした」に丸めていたので、URL を貼った人にも住所の話が返っていた
*/
describe("URL を貼って場所を決める導線", () => {
  /*
    **文言は空白を潰してから見る。**prettier は JSX の中の日本語を桁で
    折るので、字面のまま探すと「物件ごとのページの URL\n には…」で
    切れて落ちる（実際に落ちた）。JSX でも改行は空白 1 つに描かれるので、
    同じ形に揃えてから比べる。
  */
  const SRC = read(VERDICT).replace(/\s+/g, " ");

  it("貼れることを入力欄と説明の両方で言っている", () => {
    expect(SRC).toContain("物件サイトの一覧の URL");
    expect(SRC).toContain("その街として調べます");
  });

  it("開きに行かないことを同じ所に書いている", () => {
    expect(SRC).toContain("URL は開きに行きません");
  });

  it("物件ごとのページでは決まらないことを先に言っている", () => {
    expect(SRC).toContain("物件ごとのページの URL には市区町村が入っていない");
  });

  it("API が文言を返したら、それを出す（丸めない）", () => {
    /* 空回り防止。既定の文言も残っていること（文言を返さない口がある） */
    expect(SRC).toMatch(/typeof body\?\.error === "string"/);
    expect(SRC).toContain("その住所は見つかりませんでした");
  });
});
