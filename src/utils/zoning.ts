/**
 * 用途地域（都市計画法の地域地区）の呼び名・配色・数値の読み方。
 *
 * **ここはネットワークに触らない。**外から来た値をどう読み、どう見せるかだけ。
 * 取得は API の中継側（`app/api/zoning`）が持つ。
 *
 * ## 値は実測で確かめてある（2026-08-23）
 *
 * 不動産情報ライブラリの `XKT002`（`_index: bs001_use_area_…`）を全国 18 か所
 * ・z=14 で走査した結果。`scripts/probe_zoning.ts` で再現できる。
 *
 *   use_area_ja                   "商業地域" など。**数字は全角**（第１種）
 *   youto_id                      1〜13（8 は 1 件も出なかった。下記）
 *   u_building_coverage_ratio_ja  "80.0%" "80%" ← **書式が揺れる**
 *   u_floor_area_ratio_ja         "600.0%" "600%" ← 同上
 *
 * ## 名前を正とする
 *
 * 番号ではなく `use_area_ja` を鍵にする。走査で `youto_id` の 8 が
 * **1 件も出なかった**ためで、13 区分のうち 1 つが埋まっていない。
 * 番号の対応表を勝手に埋めると、その番号が来たときに別の区分名を出す。
 *
 * 番号は照合の補助としてだけ持つ（`ZONING_ID_HINTS`）。
 */

/** 実測で確かめた区分名。**全角の数字**をそのまま写している。 */
export const ZONING_NAMES = [
  "第１種低層住居専用地域",
  "第２種低層住居専用地域",
  "第１種中高層住居専用地域",
  "第２種中高層住居専用地域",
  "第１種住居地域",
  "第２種住居地域",
  "準住居地域",
  "田園住居地域",
  "近隣商業地域",
  "商業地域",
  "準工業地域",
  "工業地域",
  "工業専用地域",
] as const;

export type ZoningName = (typeof ZONING_NAMES)[number];

/**
 * 走査で `youto_id` と一緒に出た区分。
 *
 * **田園住居地域だけ出ていない。**2018 年に足された区分で、指定している
 * 自治体がごく少ない。番号がいくつなのかは確かめられていないので、
 * ここには載せない。載せると「たぶん 8」を事実として扱うことになる。
 */
export const ZONING_ID_HINTS: Readonly<Record<number, ZoningName>> = {
  1: "第１種低層住居専用地域",
  2: "第２種低層住居専用地域",
  3: "第１種中高層住居専用地域",
  4: "第２種中高層住居専用地域",
  5: "第１種住居地域",
  6: "第２種住居地域",
  7: "準住居地域",
  9: "近隣商業地域",
  10: "商業地域",
  11: "準工業地域",
  12: "工業地域",
  13: "工業専用地域",
};

export function isZoningName(value: unknown): value is ZoningName {
  return (
    typeof value === "string" &&
    (ZONING_NAMES as readonly string[]).includes(value)
  );
}

/**
 * 表示に使う区分名を決める。
 *
 * API の名前を最優先する。名前が無い・知らない名前のときだけ番号で引く。
 * どちらも駄目なら**知らないものとして null** を返す。当てずっぽうで
 * 近い区分に寄せない——用途地域は建てられるものが変わる情報で、
 * 隣の区分に寄せると意味が反転する（住居専用 ↔ 工業専用）。
 */
export function zoningNameOf(
  apiName: unknown,
  youtoId: unknown,
): ZoningName | null {
  if (isZoningName(apiName)) return apiName;
  if (typeof youtoId === "number" && ZONING_ID_HINTS[youtoId])
    return ZONING_ID_HINTS[youtoId];
  return null;
}

/**
 * 「50%」「50.0%」のような文字列を数値にする。
 *
 * **書式が揃っていない。**同じ全国の走査で、建蔽率に `50%` と `50.0%` の
 * 両方が、容積率にも `100%` と `100.0%` の両方が出た。そのまま並べると
 * 表が不揃いになるので、数にしてから出す。
 *
 * 読めない値は null。0 に落とさない。0% は「建てられない」という
 * 別の意味になってしまう。
 */
export function parsePercent(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*%?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 数値を「50%」「12.5%」に。小数点以下が 0 なら落とす。 */
export function formatPercent(value: number | null): string | null {
  if (value === null) return null;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

/**
 * 用途地域の塗り色。**都市計画図の慣例の色相に合わせている。**
 *
 * 公式の標準色そのものではない（配色を定めた告示は無く、自治体ごとに
 * 少しずつ違う）。ただし**住居専用系＝緑、住居系＝黄、商業系＝桃〜赤、
 * 工業系＝紫〜青**という色相の分け方はどこでも共通なので、そこに合わせる。
 * 独自の配色にすると、自治体が配っている都市計画図と突き合わせられない。
 *
 * ## 色だけで 13 区分は見分けられない（実測）
 *
 * `dataviz` の検証にかけた結果（sRGB・明るい地・OKLab の ΔE×100）。
 *
 *   隣り合う組（凡例の並び順）  CVD 9.8   合格
 *   隣り合う組（通常の色覚）    13.7      下限 15 に届かない
 *   **総当たり（通常の色覚）    6.8**     地図では隣り合う組が並び順とは限らない
 *
 * 色相を入れ替えて何通りか試したが、**13 色を総当たりで見分けられる配色は
 * 作れない**（sRGB に収まる範囲を超えている）。慣例を捨てても同じ。
 *
 * だから**色に区分を背負わせない**作りにする。
 *
 *   1. 凡例に必ず名前を並べる
 *   2. 凡例の行を押すと**その区分だけを残して他を灰色に落とす**
 *   3. 区画を押すと名前・建蔽率・容積率が出る
 *
 * 既定の全表示は「この辺は商業／この辺は住宅」を大づかみに見るためのもので、
 * 系統ごとの色相（緑・黄・桃・青）は十分に離れている。1 区分を正確に読むのは
 * 2 の絞り込みでやる。**配色をいじって直せる話ではない**ので、ここを
 * 「色が近い」と言って差し替えないこと。
 */
export const ZONING_FILL: Readonly<Record<ZoningName, string>> = {
  第１種低層住居専用地域: "#1B5E20",
  第２種低層住居専用地域: "#81C784",
  第１種中高層住居専用地域: "#388E3C",
  第２種中高層住居専用地域: "#C8E6C9",
  第１種住居地域: "#FBC02D",
  第２種住居地域: "#FFF59D",
  準住居地域: "#E65100",
  田園住居地域: "#AED581",
  近隣商業地域: "#F48FB1",
  商業地域: "#C2185B",
  準工業地域: "#CE93D8",
  工業地域: "#1565C0",
  工業専用地域: "#64B5F6",
};

/** 知らない区分。灰色にして、名前はそのまま出す。 */
export const UNKNOWN_ZONING_FILL = "#BDBDBD";

/** 1 区分だけを見るときに、他の区分を落とす色。 */
export const MUTED_ZONING_FILL = "#E0E0E0";

export function zoningFill(name: ZoningName | null): string {
  return name ? ZONING_FILL[name] : UNKNOWN_ZONING_FILL;
}

/**
 * 絞り込み中の塗り。選んだ区分だけ元の色で、他は落とす。
 *
 * 隠さずに灰色で残す。消すと「そこには何も無い」に見えるが、実際には
 * 別の区分がある。
 */
export function zoningFillFiltered(
  name: ZoningName | null,
  selected: ZoningName | null,
): string {
  if (!selected) return zoningFill(name);
  return name === selected ? zoningFill(name) : MUTED_ZONING_FILL;
}

/** 凡例と一覧の並び。法律の並び（住居 → 商業 → 工業）と同じ。 */
export const ZONING_ORDER: readonly ZoningName[] = ZONING_NAMES;

/**
 * その区分の性格を 1 行で。
 *
 * **細かい制限は自治体の条例で変わる。**ここは「だいたい何の街か」を
 * つかむための一言に留める。建てられるものの可否を断定しない。
 */
export const ZONING_SUMMARY: Readonly<Record<ZoningName, string>> = {
  第１種低層住居専用地域: "低層の住宅が中心。静かだが店は少ない。",
  第２種低層住居専用地域: "低層の住宅が中心。小さな店舗が混じる。",
  第１種中高層住居専用地域: "マンションが建つ住宅地。",
  第２種中高層住居専用地域: "マンション主体で、中規模の店舗も入る。",
  第１種住居地域: "住宅が主だが、店舗や事務所も建つ。",
  第２種住居地域: "住宅のほか、大きめの店舗やカラオケ等も建つ。",
  準住居地域: "幹線道路沿い。住宅と自動車関連の施設が混在。",
  田園住居地域: "農地と低層住宅が共存する区分（指定例は少ない）。",
  近隣商業地域: "近所向けの店が集まる。住宅も多い。",
  商業地域: "繁華街・オフィス街。日当たりや騒音は期待しにくい。",
  準工業地域: "軽工業と住宅が混在。倉庫や工場が隣にあることがある。",
  工業地域: "工場が主。住宅は建てられるが環境は工場優先。",
  工業専用地域: "工場専用。**住宅は建てられない。**",
};

/** 説明に必ず添える断り。 */
export const ZONING_DISCLAIMER = [
  "出典は国土交通省「不動産情報ライブラリ」の都市計画決定情報です。",
  "実際の制限は自治体の条例・地区計画で変わります。契約前に必ず自治体の都市計画課で確認してください。",
  "用途地域は方位の吉凶の判定には使っていません。参考として重ねているだけです。",
] as const;
