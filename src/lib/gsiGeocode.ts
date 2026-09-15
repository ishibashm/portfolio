/**
 * 住所から座標を引く（国土地理院の住所検索）。**引くところだけ。**
 *
 * ## なぜ geolonia の point を使わないか
 *
 * `@geolonia/normalize-japanese-addresses` の `normalize()` は町名までは
 * 正しく分解するが、**返す `point` が町丁目ごとの座標とは限らない。**
 * 岡崎市では 706 種類の町名がすべて `level=3` と判定されながら
 * **同一の点（＝市の代表点）**を返していた。`level` を見ても防げない。
 * 巡回の実測では 157,116 件中 **72,527 件**が「50 件以上が完全に同一
 * 座標」の塊に入っていた。
 *
 * 方位は出発地からこの座標への方角で決まるので、市の中心に固まると
 * **同じ市の物件がすべて同じ方位・同じ距離**になり、判定が意味を成さない。
 * そこで座標は国土地理院を正とし、`normalize()` は住所の表記ゆれを整える
 * ためだけに使う。
 *
 * ## ここに置いてある理由
 *
 * 元は `scripts/geocodeGsi.ts` にあったが、**画面側（`/api/geocode`）は
 * この修正を受け取っておらず、geolonia の `point` を使ったままだった。**
 * 利用者が物件ページから住所を正確に写して入れても市の中心が返りうる、
 * という穴が残っていた。2 か所に書き写さず、ここ 1 つを両方から読む
 * （CLAUDE.md 3 節「同じことを 2 か所に書かない」）。
 *
 * **表に依存する処理はここに置かない。**`geocode_towns` の永続キャッシュと
 * 町丁目単位への丸めは巡回の都合なので、`scripts/geocodeGsi.ts` が持つ。
 * 画面側は**番地を落とさない**（落とすとまさに precision を捨てることになる）。
 */

export const GSI_ENDPOINT =
  "https://msearch.gsi.go.jp/address-search/AddressSearch";

export type GeoPoint = { lat: number; lon: number };
export type GeoResult =
  | { kind: "ok"; point: GeoPoint }
  | { kind: "not_found" }
  | { kind: "error" };

/**
 * 国土地理院に 1 回だけ問い合わせる。
 *
 * **見つからない（not_found）と落ちた（error）を分ける。**呼ぶ側で
 * 「次の手を試す」か「無いと答える」かが変わるため。一緒にすると、
 * 通信が落ちただけの回まで「その住所は存在しない」と答えてしまう。
 */
export async function lookupGsi(query: string): Promise<GeoResult> {
  try {
    const res = await fetch(`${GSI_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { kind: "error" };
    const json = (await res.json()) as Array<{
      geometry?: { coordinates?: [number, number] };
    }>;
    const top = json?.[0];
    const coords = top?.geometry?.coordinates;
    if (!coords || coords.length < 2) return { kind: "not_found" };
    /* GeoJSON なので [経度, 緯度] の順。取り違えると海の上に出る */
    const [lon, lat] = coords;
    if (typeof lat !== "number" || typeof lon !== "number") {
      return { kind: "not_found" };
    }
    return { kind: "ok", point: { lat, lon } };
  } catch {
    return { kind: "error" };
  }
}
