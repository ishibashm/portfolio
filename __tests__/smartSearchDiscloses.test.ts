import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  スマート検索（物件検索の「条件をまとめて入力」）。

  ## 見つかった不具合 — どこへ行くか書いていなかった

  この欄は、正規表現で構造が 1 つも取れない自然文だけを
  `/api/rentals/parse-query` 経由で**外部の言語モデルに送る。**
  実装のコメントにはそう書いてあるが、**画面は一言も書いていなかった。**
  利用者から見れば「この端末で解釈している」のと区別が付かない。

  #1312 の地図の検索欄と同じ形。**入力がどこへ行くかは、入れる前に
  分からないと意味が無い。**

  ## 見張り方

  1. 送る実装があるうちは、画面にも断りがあること。**片方だけ消えない
     ようにする**（実装を消したら断りも消す、が正しい順序）
  2. 断りは「いつ送るか」まで言う。常に送ると誤解されると、使える人が
     使わなくなる
*/

const PAGE = "src/app/relocation/arbitrage/page.tsx";
const ROUTE = "src/app/api/rentals/parse-query/route.ts";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("スマート検索の断り", () => {
  /* prettier が JSX の中の日本語を桁で折るので、空白を潰してから見る */
  const SRC = read(PAGE).replace(/\s+/g, " ");

  it("見張りが空回りしていない（送る実装がまだある）", () => {
    /*
      この検査は「送っているのに書いていない」を防ぐもの。送る実装が
      無くなれば断りも要らないので、**まず実装の側を確かめる。**
    */
    expect(read(ROUTE)).toContain("https://api.anthropic.com/v1/messages");
    expect(SRC).toContain("/api/rentals/parse-query");
  });

  it("外部へ送ることを画面に書いている", () => {
    expect(SRC).toContain("入力した文を外部の言語モデルに送って");
  });

  it("いつ送るかまで書いている（常に送ると誤解させない）", () => {
    /* 実装は「構造が 1 つも取れない自然文」のときだけ送る。
       常に送ると読めると、使える人まで使わなくなる */
    expect(SRC).toContain("ふつうはこの端末の中だけで解釈します");
    expect(SRC).toContain("当てはまらない言い回し");
  });

  it("送らずに済ませる道を書いている", () => {
    expect(SRC).toContain("送りたくないときは");
  });
});
