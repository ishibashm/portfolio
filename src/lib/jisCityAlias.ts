/**
 * 市区町村名の「ケ / ヶ」の表記ゆれを吸収する。
 *
 * 住所から市区町村を切り出すのに正規表現は使えない（「四日市市」が
 * 「四日市」に、「神戸市西区」が「神戸市」になる）ので、集計は
 * `scripts/jis_city_codes.json` の**正式名**で前方一致している。
 * そのぶん、住所の表記が正式名と 1 文字でも違うと**その行はどの
 * 市区町村にも数えられずに消える。**
 *
 * 実際に消えていた（2026-08-28 の probe）:
 *
 *     神奈川県横浜市保土ケ谷区 | 1342   ← JIS の正式名。数えられる
 *     神奈川県横浜市保土ヶ谷区 |  474   ← 収集元の表記。消える
 *
 * **一律にどちらかへ寄せることはできない。**どちらが正式かは自治体
 * ごとに違う（保土ケ谷区・鎌ケ谷市・龍ケ崎市・関ケ原町・袖ケ浦市・
 * 金ケ崎町は大文字の「ケ」、茅ヶ崎市・鶴ヶ島市・七ヶ浜町・駒ヶ根市
 * などは小文字の「ヶ」）。正式名の側から別表記を作って、**両方を
 * 数える**しかない。
 */

/**
 * 住所の前方一致に使う綴りを返す。先頭は必ず正式名。
 *
 * 「ケ / ヶ」を含まない名前では長さ 1 の配列を返すので、呼び出し側は
 * 結果の数だけ OR を並べればよい（1 件なら今までと同じ 1 条件になる）。
 */
export function addressPrefixes(fullName: string): string[] {
  const alt = fullName.includes("ケ")
    ? fullName.replace(/ケ/g, "ヶ")
    : fullName.includes("ヶ")
      ? fullName.replace(/ヶ/g, "ケ")
      : null;
  return alt === null || alt === fullName ? [fullName] : [fullName, alt];
}

/**
 * `addressPrefixes` の綴りぶんだけ並べた前方一致の条件と、その引数を返す。
 *
 * `$1` から始まる番号で組む。呼び出し側で他の引数を足す場合は
 * `startIndex` をずらすこと。
 */
export function addressPrefixClause(
  fullName: string,
  startIndex = 1,
): { sql: string; params: string[] } {
  const prefixes = addressPrefixes(fullName);
  const sql = prefixes
    .map((_, i) => `address LIKE $${startIndex + i} || '%'`)
    .join(" OR ");
  // 1 件でも括弧を付ける。呼び出し側は必ず AND で繋ぐので、
  // 2 件のときに括弧が無いと後ろの条件が OR に食われる。
  return { sql: `(${sql})`, params: prefixes };
}
