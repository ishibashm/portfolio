/**
 * 点がどこから来たかと、その粗さ。
 *
 * `/api/geocode` は座標のほかに `source` を返す。**同じ緯度経度でも
 * 「番地まで当たった点」と「市の中心に潰れた点」では意味が違う**ので、
 * 画面はそれを見分けられなければならない（CLAUDE.md 3 節「黙って別のものに
 * 落ちる」）。
 *
 * 方位は出発地からこの座標への方角で決まる。市の中心に固まると、同じ市の
 * どこを指しても同じ方位・同じ距離になる。**判定の答えが変わるのに、
 * 画面上は何も変わらない。**だから断りを出す。
 */

/** `/api/geocode` が名乗る出どころ。 */
export type GeocodeSource =
  /** 国土地理院。番地まで当たった点。 */
  | "gsi"
  /** geolonia の normalize。**市の中心に潰れていることがある。** */
  | "normalize"
  /** OpenStreetMap。日本の住所に強くない。最後の手段。 */
  | "nominatim"
  /** 貼られた URL から読んだ市区町村の代表点（物件の場所ではない）。 */
  | "municipality";

/**
 * 素の文字列を `GeocodeSource` に落とす。知らない値は null。
 *
 * **`string` のまま持ち回さない。**名前を付けておけば、増えたときに
 * tsc が「まだ通していない所」を出してくれる（CLAUDE.md 4 節
 * 「字面で探すと取りこぼす。型で探す」）。
 */
export function parseGeocodeSource(raw: unknown): GeocodeSource | null {
  switch (raw) {
    case "gsi":
    case "normalize":
    case "nominatim":
    case "municipality":
      return raw;
    default:
      return null;
  }
}

/**
 * 粗い点のときに出す断り。**十分に細かいときは null**（黙っている）。
 *
 * 文言は出どころごとに変える。「おおよそです」で丸めると、**街の代表点**
 * （物件の場所ですらない）と**市の中心に潰れた住所**（住所としては当たって
 * いるが点が粗い）の区別が消える。利用者が次に取る手が違う。
 */
export function geocodePrecisionNote(
  source: GeocodeSource | null,
): string | null {
  switch (source) {
    case "gsi":
      /* 番地まで当たっている。言うことは無い */
      return null;
    case "normalize":
      return "この住所は番地まで特定できませんでした。市の中心あたりを指している可能性があります。地図をクリックすると正確な地点で調べ直せます。";
    case "nominatim":
      return "おおよその位置です。地図をクリックすると正確な地点で調べ直せます。";
    case "municipality":
      return "貼っていただいた URL から読めるのは市区町村までです。この点は街の代表点で、物件そのものの場所ではありません。";
    default:
      /* 座標を直接入れた・地図をクリックした場合はここに来る（source が
         付かない）。利用者が指した点そのものなので断りは要らない */
      return null;
  }
}
