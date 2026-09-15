import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  geocodePrecisionNote,
  parseGeocodeSource,
  type GeocodeSource,
} from "@/lib/geocodeSource";

/*
  点の粗さを画面に出す。

  ## なぜ要るか

  **同じ緯度経度でも「番地まで当たった点」と「市の中心に潰れた点」では
  意味が違う。**方位は出発地からその座標への方角で決まるので、市の中心に
  固まると**同じ市のどこを指しても同じ方位・同じ距離**になる。
  判定の答えが変わるのに、画面上は何も変わらない。

  #1322 で `/api/geocode` が `source` を名乗るようになったので、画面が
  それを読んで断る。

  ## 気にしていること

  1. **十分に細かいときは黙る。**毎回断ると誰も読まなくなる
  2. **「おおよそです」で丸めない。**街の代表点（物件の場所ですらない）と
     市の中心に潰れた住所（住所は当たっているが点が粗い）では、利用者が
     次に取る手が違う
  3. 座標を直接入れた・地図をクリックしたときは断らない（利用者が指した
     点そのもの）
*/

const VERDICT = "src/components/relocation/SpotVerdict.tsx";

const ALL: GeocodeSource[] = ["gsi", "normalize", "nominatim", "municipality"];

describe("出どころの読み取り", () => {
  it("知っている値だけ通す", () => {
    for (const s of ALL) expect(parseGeocodeSource(s)).toBe(s);
  });

  it("知らない値・壊れた値は null", () => {
    for (const bad of ["GSI", "", "google", null, undefined, 1, {}, []]) {
      expect(parseGeocodeSource(bad), String(bad)).toBeNull();
    }
  });
});

describe("粗さの断り", () => {
  it("番地まで当たっていれば黙る", () => {
    expect(geocodePrecisionNote("gsi")).toBeNull();
  });

  it("出どころが無いとき（座標・地図クリック）も黙る", () => {
    /* 利用者が指した点そのもの。断る理由が無い */
    expect(geocodePrecisionNote(null)).toBeNull();
  });

  it("粗い 3 つはそれぞれ違う文言を出す", () => {
    const notes = (["normalize", "nominatim", "municipality"] as const).map(
      (s) => geocodePrecisionNote(s),
    );
    for (const n of notes) {
      expect(n).toBeTruthy();
      expect(typeof n).toBe("string");
    }
    /* 空回り防止。「おおよそです」で丸めていないこと */
    expect(new Set(notes).size).toBe(3);
  });

  it("市の中心に潰れた住所は、そう言う", () => {
    const n = geocodePrecisionNote("normalize") ?? "";
    expect(n).toContain("番地まで特定できませんでした");
    expect(n).toContain("市の中心");
  });

  it("市区町村の代表点は、物件の場所でないと言う", () => {
    const n = geocodePrecisionNote("municipality") ?? "";
    expect(n).toContain("物件そのものの場所ではありません");
  });

  it("直せる手を添えている（地図をクリック）", () => {
    /* 断るだけで終わらせない。次に取れる手を書く */
    for (const s of ["normalize", "nominatim"] as const) {
      expect(geocodePrecisionNote(s), s).toContain("地図をクリック");
    }
  });
});

describe("画面が読んでいる", () => {
  const SRC = readFileSync(join(process.cwd(), VERDICT), "utf8");

  it("応答の source を型に通してから持っている", () => {
    /* `string` のまま持ち回さない（CLAUDE.md 4 節「型で探す」） */
    expect(SRC).toContain("parseGeocodeSource(body.source)");
    expect(SRC).toContain("source?: GeocodeSource | null");
  });

  it("断りを描いている", () => {
    expect(SRC).toContain("geocodePrecisionNote(target?.source ?? null)");
    expect(SRC).toContain("{precisionNote}");
  });

  it("距離の注意と畳んでいない（どちらも出うる）", () => {
    /* 「近すぎて方位が定まらない」と「指した点が住所の点ではない」は
       別の話。片方に畳むともう片方が消える */
    expect(SRC).toContain("{unstableNote}");
    const p = SRC.indexOf("{precisionNote}");
    const u = SRC.indexOf("{unstableNote}");
    expect(p).toBeGreaterThan(-1);
    expect(u).toBeGreaterThan(-1);
    expect(p).not.toBe(u);
  });
});
