import { parseExpireDate } from "./niftyPolite";
import type { RentalUpsertRow } from "./rentalUpsert";

/**
 * 一覧ページの `window.Nifty.Data.Bukken` のうち、ここで読む枝だけ。
 * 値は全部文字列で来る（賃料は万円、管理費は円、面積は m²）ので、
 * 下の parse* を通してから保存する。欄ごと無い物件があるので任意。
 *
 * id だけは必須にしてある。Bukken は id をキーにした連想配列で、値にも
 * 同じ id が入っており、ページを跨いだ重複除去がこれに依存している。
 */
export interface NiftyBukken {
  id: string;
  url?: string;
  title?: string;
  address?: string;
  rent?: string;
  manageCost?: string;
  layout?: string;
  floorArea?: string;
  buildAge?: string;
  access?: string;
  floor?: string;
  expireDate?: string;
}

/** 一覧ページが window に置いていく物件データ。型定義は無いので自分で書く。 */
export type NiftyWindow = Window & {
  Nifty?: { Data?: { Bukken?: Record<string, NiftyBukken> } };
};

// Map Nifty rent string (e.g. "12.5") to integer JPY (e.g. 125000)
// 以下の parse* が undefined も取るのは、その欄が無い物件があるため。
// どれも先頭の falsy 判定で元からその場合を返しており、`string` を
// 名乗っていたのが型の嘘だった（呼び出し側が any だったので通っていた）。
function parseRent(rentStr: string | undefined): number {
  if (!rentStr || rentStr === "-") return 0;
  const num = parseFloat(rentStr);
  return isNaN(num) ? 0 : Math.round(num * 10000);
}

// Map Nifty floor area string (e.g. "33.4") to decimal
function parseSize(sizeStr: string | undefined): number {
  if (!sizeStr || sizeStr === "-") return 0;
  const num = parseFloat(sizeStr);
  return isNaN(num) ? 0 : num;
}

// Map Nifty age string (e.g. "新築", "築10年", "18年11ヶ月") to integer years.
// 取得できなかった場合に 0 を返すと「新築」と区別が付かず、築0年の物件が
// 水増しされてしまうため null を返す。
function parseAge(ageStr: string | undefined): number | null {
  if (!ageStr || ageStr === "-") return null;
  if (ageStr === "新築") return 0;
  // 「11ヶ月」のように 1 年未満は年の表記が無い
  if (/^\s*\d+\s*ヶ月/.test(ageStr)) return 0;
  // 「築」があってもなくても、数字の後に「年」が続くパターンにマッチさせます
  const match = ageStr.match(/(?:築)?(\d+)年/);
  return match ? parseInt(match[1], 10) : null;
}

// Nifty の管理費は "9,800円" のように円単位・カンマ区切りで来る（賃料だけが万円単位）。
// これまで保存していなかったため management_fee が全件 NULL になっており、
// 利回り偏差値の元になる総賃料が管理費のぶん過小に出ていた。
function parseManagementFee(costStr: string | undefined): number {
  if (!costStr) return 0;
  if (/無料|なし|不要/.test(costStr)) return 0;
  const digits = costStr.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return isNaN(n) ? 0 : n;
}

// "ＪＲ東海道本線/東刈谷駅 徒歩6分" や "バス15分 徒歩5分" から徒歩の分数を取る。
// minutes_to_station カラムは以前から存在するのに一度も埋めていなかったため、
// 画面の駅徒歩が常に「不明」になっていた。
function parseWalkMinutes(accessStr: string | undefined): number | null {
  if (!accessStr) return null;
  const match = accessStr.match(/徒歩\s*(\d+)\s*分/);
  return match ? parseInt(match[1], 10) : null;
}

export function rentalRows(properties: NiftyBukken[]): RentalUpsertRow[] {
  const rows: RentalUpsertRow[] = [];
  for (const prop of properties) {
    if (!prop.url) continue;
    // Nifty URLs might be relative, ensure absolute
    const absoluteUrl = prop.url.startsWith("http")
      ? prop.url
      : `https://myhome.nifty.com${prop.url}`;
    // update は last_seen_at と rent しか触っていなかったため、初回取得時の
    // 築年数・面積・間取りが未来永劫そのまま残っていた（年が変わっても築年数が増えない）。
    // 再取得したなら全項目を今の値に合わせる。
    rows.push({
      url: absoluteUrl,
      property_name: prop.title || "Unknown",
      address: prop.address || "",
      rent: parseRent(prop.rent),
      management_fee: parseManagementFee(prop.manageCost),
      layout: prop.layout || "",
      size_sqm: parseSize(prop.floorArea),
      building_age: parseAge(prop.buildAge),
      minutes_to_station: parseWalkMinutes(prop.access),
      floor: prop.floor || "",
      is_new_build: prop.buildAge === "新築",
      expire_date: parseExpireDate(prop.expireDate),
      source_scraper: "nifty_playwright",
    });
  }

  return rows;
}
