/**
 * 公的な家賃の統計（e-Stat）を、家賃市場の頁（/relocation/market）が読む
 * 写しにまとめる。**純粋な関数だけ。**通信は scripts/fetch_estat_rent.ts。
 *
 * ## なぜ要るか（利用者の指摘、2026-09-30「このデータは最新？」）
 *
 * 頁の「家賃指数の推移」は掲載（賃貸の巡回）の㎡単価の中央値で、巡回を
 * 規約に従って止めた 2026-09-13 で止まっている。毎月出る公的な統計に
 * 置き換える。出どころは 2 つ（統計表 ID は探索 probe-estat-price-index の
 * run 36620270063・36620601653・36620604888 で実物を見て決めた）。
 *
 * - 消費者物価指数（2025年基準、表 0004052037）の「民営家賃」… 指数。
 *   同じ質の住宅の家賃が前年からどれだけ動いたか。全国・地域別
 * - 小売物価統計調査「主要品目の都市別小売価格」（表 0003421913）の
 *   「民営家賃」… 3.3㎡（1 坪）あたりの月額（円）。都道府県庁所在市と
 *   人口 15 万以上の市
 *
 * ## コードは名前で選ぶ
 *
 * 表章項目・地域・時間軸のコードは実物の書式を見ていないので、決め打ち
 * しない。応答の CLASS_INF にある名前（「指数」「全国」「2026年8月」）で
 * 選び、見つからなければ止める（黙って別の系列に落ちない）。名前の先頭に
 * コードが重なっていることがあるので、比べる前に外す（plainName）。
 *
 * 型は**この写しが実際に読む枝だけ**を写す（#149 の方針）。
 * scripts/estatWealth の EstatValue は所得の表のために `@area`・`@cat01`
 * だけを持つので、表章項目と時間軸を読むここでは使えない。
 */

export interface EstatRentValue {
  "@tab"?: string;
  "@cat01"?: string;
  "@cat02"?: string;
  "@area"?: string;
  "@time"?: string;
  "@unit"?: string;
  $: string;
}

export interface EstatRentClass {
  "@code": string;
  "@name": string;
  "@unit"?: string;
}

export interface EstatRentClassObj {
  "@id": string;
  "@name"?: string;
  CLASS: EstatRentClass | EstatRentClass[];
}

export interface EstatRentResponse {
  GET_STATS_DATA: {
    RESULT: { STATUS: number; ERROR_MSG?: string };
    STATISTICAL_DATA?: {
      TABLE_INF?: { TITLE?: string | { $?: string } };
      CLASS_INF?: { CLASS_OBJ: EstatRentClassObj | EstatRentClassObj[] };
      DATA_INF?: { VALUE: EstatRentValue | EstatRentValue[] };
    };
  };
}

export interface RentPoint {
  /** YYYY-MM */
  month: string;
  value: number;
}

export interface CpiRentArea {
  areaName: string;
  /** 最新月の指数（2025 年＝100） */
  index: number;
  /** 前年同月比（%）。前年同月が無ければ null */
  yoyPct: number | null;
}

export interface RetailRentCity {
  areaCode: string;
  areaName: string;
  /** 最新月の 3.3㎡あたり月額（円） */
  yen: number;
  /** 前年同月の同じ値（円）。無ければ null */
  yenYearAgo: number | null;
}

/**
 * 写しの全体。取得した日時は持たない（毎月同じ中身でも差分が出て、
 * 押し戻しのコミットが空振りで積み上がるため）。新しさは各統計の
 * latestMonth で言う。
 */
export interface EstatRentSnapshot {
  cpi: {
    tableId: string;
    /** 最新月（YYYY-MM） */
    latestMonth: string;
    /** 全国と東京都区部の月次の指数 */
    series: { areaName: string; points: RentPoint[] }[];
    /** 最新月の地域別（全国・地方・都市など、表に出ている全地域） */
    areas: CpiRentArea[];
  };
  retail: {
    tableId: string;
    latestMonth: string;
    /** 単位（例: 円）。表の値が「1 か月・3.3㎡」あたり */
    unit: string;
    cities: RetailRentCity[];
  };
}

export const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * e-Stat の項目名から先頭のコードを外す（「0047 民営家賃」→「民営家賃」）。
 * 消費者物価指数の表は項目名にコードを重ねて返す（2026-09-30 の dry-run、
 * run 36622875930 で「0001 総合」「0002 食料」…と出た）。付いていない名前は
 * そのまま（「2026年8月」は数字の後ろに空白が無いので外れない）。
 */
export function plainName(name: string): string {
  const m = /^[0-9A-Za-z]+[\s\u3000]+(.+)$/.exec(name.trim());
  return m ? m[1].trim() : name.trim();
}

/** 「2026年8月」→ "2026-08"。年・年度・四半期の名前は null */
export function monthOfTimeName(name: string): string | null {
  const m = /^(\d{4})年(\d{1,2})月$/.exec(name.trim());
  if (!m) return null;
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return null;
  return `${m[1]}-${String(mm).padStart(2, "0")}`;
}

/** 1 年前の同じ月（"2026-08" → "2025-08"） */
export function sameMonthLastYear(month: string): string {
  const [y, m] = month.split("-");
  return `${Number(y) - 1}-${m}`;
}

/** e-Stat の値を数値にする。欠測（"-"・"***"・"X"・"…"・空）は null */
export function parseRentValue(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.replace(/,/g, "").trim();
  if (s === "" || s === "-" || s === "***" || s === "X" || s === "…") {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function classesOf(objs: EstatRentClassObj[], id: string): EstatRentClass[] {
  return asArray(objs.find((o) => o["@id"] === id)?.CLASS);
}

/** 名前が完全に一致する項目のコード。無ければ止める */
export function codeByName(
  objs: EstatRentClassObj[],
  id: string,
  name: string,
): string {
  const hit = classesOf(objs, id).find((c) => plainName(c["@name"]) === name);
  if (!hit) {
    const names = classesOf(objs, id)
      .map((c) => plainName(c["@name"]))
      .slice(0, 40)
      .join(" / ");
    throw new Error(`分類 ${id} に「${name}」が無い（あるのは: ${names}）`);
  }
  return hit["@code"];
}

/** 時間軸のコード → YYYY-MM。月でない時点（年・年度）は入らない */
export function monthCodes(objs: EstatRentClassObj[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of classesOf(objs, "time")) {
    const month = monthOfTimeName(plainName(c["@name"]));
    if (month) out.set(c["@code"], month);
  }
  return out;
}

function unpack(data: EstatRentResponse) {
  const r = data.GET_STATS_DATA;
  if (r.RESULT.STATUS !== 0) {
    throw new Error(
      `e-Stat が拒否: ${r.RESULT.STATUS} ${r.RESULT.ERROR_MSG ?? ""}`,
    );
  }
  const sd = r.STATISTICAL_DATA;
  return {
    classes: asArray(sd?.CLASS_INF?.CLASS_OBJ),
    values: asArray(sd?.DATA_INF?.VALUE),
  };
}

/** 前年同月比（%）。小数 1 桁 */
function yoy(now: number, before: number | undefined): number | null {
  if (before === undefined || before === 0) return null;
  return Math.round((now / before - 1) * 1000) / 10;
}

/**
 * 消費者物価指数の民営家賃。
 *
 * 表章項目は「指数」だけを読む（前年同月比は指数から出す。どの月にも
 * 同じ計算を当てるので、地域どうしで比べられる）。品目は取得の側で
 * 民営家賃に絞ってある前提。
 *
 * @param seriesAreas 月次の推移を持つ地域の名前（例: 全国・東京都区部）
 */
export function buildCpiRent(
  data: EstatRentResponse,
  tableId: string,
  seriesAreas: readonly string[],
): EstatRentSnapshot["cpi"] {
  const { classes, values } = unpack(data);
  const indexTab = codeByName(classes, "tab", "指数");
  const months = monthCodes(classes);
  const areaNames = new Map(
    classesOf(classes, "area").map((c) => [c["@code"], plainName(c["@name"])]),
  );

  /** 地域 → 月 → 指数 */
  const byArea = new Map<string, Map<string, number>>();
  for (const v of values) {
    if (v["@tab"] !== undefined && v["@tab"] !== indexTab) continue;
    const month = months.get(v["@time"] ?? "");
    const value = parseRentValue(v.$);
    if (!month || value === null || !v["@area"]) continue;
    const m = byArea.get(v["@area"]) ?? new Map<string, number>();
    m.set(month, value);
    byArea.set(v["@area"], m);
  }
  if (byArea.size === 0) throw new Error("民営家賃の指数が 1 件も無い");

  const latestMonth = [...byArea.values()]
    .flatMap((m) => [...m.keys()])
    .sort()
    .at(-1)!;

  const series = seriesAreas.map((name) => {
    const code = codeByName(classes, "area", name);
    const m = byArea.get(code);
    if (!m) throw new Error(`「${name}」の民営家賃の指数が無い`);
    return {
      areaName: name,
      points: [...m.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, value]) => ({ month, value })),
    };
  });

  const areas: CpiRentArea[] = [];
  for (const [code, m] of byArea) {
    const index = m.get(latestMonth);
    if (index === undefined) continue;
    areas.push({
      areaName: areaNames.get(code) ?? code,
      index,
      yoyPct: yoy(index, m.get(sameMonthLastYear(latestMonth))),
    });
  }

  return { tableId, latestMonth, series, areas };
}

/**
 * 小売物価統計調査の民営家賃（3.3㎡あたり月額）。都市ごとに最新月と
 * 前年同月。銘柄は取得の側で民営家賃に絞ってある前提。
 */
export function buildRetailRent(
  data: EstatRentResponse,
  tableId: string,
): EstatRentSnapshot["retail"] {
  const { classes, values } = unpack(data);
  const months = monthCodes(classes);
  const areaNames = new Map(
    classesOf(classes, "area").map((c) => [c["@code"], plainName(c["@name"])]),
  );

  const byArea = new Map<string, Map<string, number>>();
  let unit = "";
  for (const v of values) {
    const month = months.get(v["@time"] ?? "");
    const value = parseRentValue(v.$);
    if (!month || value === null || !v["@area"]) continue;
    if (!unit && v["@unit"]) unit = v["@unit"];
    const m = byArea.get(v["@area"]) ?? new Map<string, number>();
    m.set(month, value);
    byArea.set(v["@area"], m);
  }
  if (byArea.size === 0) throw new Error("民営家賃の都市別価格が 1 件も無い");

  const latestMonth = [...byArea.values()]
    .flatMap((m) => [...m.keys()])
    .sort()
    .at(-1)!;

  const cities: RetailRentCity[] = [];
  for (const [code, m] of byArea) {
    const yen = m.get(latestMonth);
    if (yen === undefined) continue;
    cities.push({
      areaCode: code,
      areaName: areaNames.get(code) ?? code,
      yen,
      yenYearAgo: m.get(sameMonthLastYear(latestMonth)) ?? null,
    });
  }
  cities.sort((a, b) => a.areaCode.localeCompare(b.areaCode));

  return { tableId, latestMonth, unit, cities };
}
