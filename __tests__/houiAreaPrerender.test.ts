import { describe, expect, it } from "vitest";
import { generateStaticParams } from "@/app/houi/area/[code]/page";
import { AREAS, findArea } from "@/lib/areaContent";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";

/**
 * 市区町村ページの**事前生成の範囲**を固定する。
 *
 * ## なぜ要るか
 *
 * 以前は AREAS 全件（実測 1,156 頁）をビルド時に焼いていた。イメージの
 * 実測 793 MB のうち **554 MB（7 割）がこれ**で、デプロイ 1 回につき
 * 圧縮後 111 MB の層が Artifact Registry に積まれる。デプロイは日
 * 30〜70 回あるので効きが大きい（backlog 24 節・24-b 節）。
 *
 * 索引に載せる頁（`areaEditorial` に文章を書いた頁）だけを焼き、残りは
 * `dynamicParams = true` に任せて要求時に作るようにした。
 *
 * ## この検査が守るもの
 *
 * **「索引に載せる」と「事前生成する」を同じ式にしておくこと。**
 * 別々に書くと、文章を書いたのに事前生成されない（またはその逆）と
 * いう食い違いが**静かに**起きる。どちらも画面は出来上がるので、
 * 見比べるまで気付けない類（CLAUDE.md 3 節「黙って別のものに落ちる」）。
 */
describe("市区町村ページの事前生成は、索引に載せる頁と一致する", () => {
  const params = generateStaticParams();
  const prerendered = new Set(params.map((p) => p.code));
  const editorial = new Set(Object.keys(AREA_EDITORIAL));

  it("事前生成した頁は、すべて文章のある頁", () => {
    const extra = [...prerendered].filter((c) => !editorial.has(c));
    expect(extra).toEqual([]);
  });

  it("文章のある頁は、すべて事前生成されている", () => {
    /* AREA_EDITORIAL に鍵はあるが AREAS に居ない code は対象外
       （巡回で掲載が消えた市区町村。頁自体が出ない）。 */
    const missing = [...editorial].filter(
      (c) => findArea(c) && !prerendered.has(c),
    );
    expect(missing).toEqual([]);
  });

  it("全件は焼いていない（この変更が効いている）", () => {
    /* 空回り防止。全件に戻したらここで落ちる。文章を全頁に書くことは
       #379 の状態（雛形の大量生成）に戻ることなので、起こらない前提。 */
    expect(prerendered.size).toBeLessThan(AREAS.length);
    expect(AREAS.length - prerendered.size).toBeGreaterThan(100);
  });

  it("焼いていない頁も、頁として成立する（404 にしない）", () => {
    /* `dynamicParams = true` が前提。ここが false に戻ると、焼かなかった
       頁が全部 404 になる。**その事故を検出するための検査。**
       findArea が引ける＝ notFound() に落ちない、を確かめる。 */
    const notBaked = AREAS.filter((a) => !prerendered.has(a.code));
    expect(notBaked.length).toBeGreaterThan(0);
    for (const a of notBaked.slice(0, 50)) {
      expect(findArea(a.code), `${a.code} が引けない`).toBeTruthy();
    }
  });
});
