import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { GSI_ENDPOINT, lookupGsi } from "@/lib/gsiGeocode";

/*
  住所から座標を引く経路を 1 つにする。

  ## 何が起きていたか

  `@geolonia/normalize-japanese-addresses` の `normalize()` が返す `point` は
  **町丁目ごとの座標とは限らない。**岡崎市では 706 種類の町名がすべて
  `level=3` と判定されながら同一の点（市の代表点）を返しており、巡回の実測で
  157,116 件中 72,527 件が「50 件以上が完全に同一座標」の塊に入っていた。

  巡回はこれを理由に**国土地理院**へ切り替えたが、**画面側
  （`/api/geocode`）はその修正を受け取っていなかった。**利用者が物件ページ
  から住所を正確に写して入れても、市の中心が返りうる状態だった。

  「同じことを 2 か所に書かない」の実害そのもの（CLAUDE.md 3 節）。

  ## 正確には「画面が受け取っていない」ではない

  最初そう書いたが**言い過ぎだった。**画面には既に国土地理院で引く口が
  ある ― `/api/geocode/suggest`（`PlaceInput` の「地名で探す」）。
  取り残されていたのは**選んだ文字列を点に落とす側**（`/api/geocode`。
  物件検索の「この地点を調べる」・シミュレータが使う）だけ。

  ## 見張ること

  1. エンドポイントの綴りを持つファイルを**増やさない**。いまの持ち主は
     下の `HOLDERS` で、**減らすぶんには何も起きず、増やすと落ちる**
  2. 巡回側は写しを持たず、`src/lib/gsiGeocode.ts` から読んでいる
  3. 引き口の約束（not_found と error を分ける・[経度, 緯度] の順）
*/

const LIB = "src/lib/gsiGeocode.ts";
const SCRIPT = "scripts/geocodeGsi.ts";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(name)) out.push(full);
    }
  };
  walk(join(process.cwd(), dir));
  return out;
}

describe("国土地理院を叩くのは 1 か所", () => {
  const files = [...sourceFiles("src"), ...sourceFiles("scripts")];

  it("見張りが空回りしていない（走査できている）", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  /**
   * いまエンドポイントの綴りを自分で持っているファイル（2026-09-15 実測）。
   *
   * **寄せたら消すこと。**残りは 3 つで、どれも lib から読めば済む。
   * 一度に直すと 1 PR が大きくなりすぎるので、順に寄せる
   * （CLAUDE.md 2 節「1 PR = 1〜3 ファイル」）。
   */
  const HOLDERS = [
    LIB,
    /* 画面の候補出し。既に国土地理院を引いているので精度の問題は無い */
    "src/app/api/geocode/suggest/route.ts",
    /* 取り込みスクリプト。巡回とは別経路で写しを持っている */
    "scripts/import_postal_codes.ts",
    "scripts/import_property_transactions.ts",
  ];

  it("エンドポイントの綴りを持つファイルが増えていない", () => {
    const holders = files
      .filter((f) => /msearch\.gsi\.go\.jp/.test(readFileSync(f, "utf8")))
      .map((f) => relative(process.cwd(), f))
      .sort();
    /* 減るのは歓迎（寄せた証拠）。増えたら落とす */
    const unexpected = holders.filter((h) => !HOLDERS.includes(h));
    expect(
      unexpected,
      `国土地理院の綴りを新しく持ったファイル:\n${unexpected.join("\n")}\n` +
        "src/lib/gsiGeocode.ts から読むこと",
    ).toEqual([]);
  });

  it("lib は必ず持っている（寄せ先が消えていない）", () => {
    expect(read(LIB)).toContain("msearch.gsi.go.jp");
  });

  it("巡回側は写しを持たず、lib から読んでいる", () => {
    const src = read(SCRIPT);
    expect(src).toContain('from "../src/lib/gsiGeocode"');
    /* 写しが戻っていないこと。fetch を自分で組み立て直したら落とす */
    expect(src).not.toMatch(/fetch\s*\(\s*`\$\{GSI_ENDPOINT\}/);
  });

  it("別名（@/）ではなく相対で読む", () => {
    /* この経路は `npx tsx scripts/...` で走る。path alias の解決に
       頼らないほうが確実（実際に tsx で読めることを確かめてある） */
    expect(read(SCRIPT)).not.toContain('from "@/lib/gsiGeocode"');
  });
});

describe("引き口の約束", () => {
  it("見つからないと落ちたを分けている", () => {
    /*
      一緒にすると、通信が落ちただけの回まで「その住所は存在しない」と
      答えてしまう。呼ぶ側は次の手を試すかどうかをここで決める。
    */
    const src = read(LIB);
    expect(src).toContain('kind: "not_found"');
    expect(src).toContain('kind: "error"');
  });

  it("GeoJSON の [経度, 緯度] を取り違えていない", () => {
    /* 逆にすると海の上に出る。並びが変わったら落とす */
    expect(read(LIB)).toContain("const [lon, lat] = coords");
  });

  it("エンドポイントは https の国土地理院", () => {
    expect(GSI_ENDPOINT).toBe(
      "https://msearch.gsi.go.jp/address-search/AddressSearch",
    );
    expect(typeof lookupGsi).toBe("function");
  });
});
