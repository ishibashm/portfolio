/**
 * /houi/[year]/[star] と /houi/[year]/[star]/[month] の正規パス。
 *
 * parseInt は "01" を 1、"1abc" を 1、"02026" を 2026 と読む。
 * そのままだと正規の頁と同じ中身が別 URL で 200 になる。
 * 正規の断片は先頭ゼロも末尾のゴミも無い十進（"2026" "1" "12"）。
 *
 * 年の幅は kigakuContent の contentYears / monthContentYears と同じ式。
 * こちらは暦エンジンを引かない（middleware から使うため）。
 * ずれは __tests__/houiCanonicalPath.test.ts が見る。
 */

const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function houiYearInJapan(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
    }).format(now),
  );
}

/** contentYears と同じ。今年・来年・再来年。 */
export function houiContentYears(now = new Date()): number[] {
  const current = houiYearInJapan(now);
  return [current, current + 1, current + 2];
}

/** monthContentYears と同じ。今年と来年。 */
export function houiMonthContentYears(now = new Date()): number[] {
  const current = houiYearInJapan(now);
  return [current, current + 1];
}

/** 正規のパス断片。0 始まりと、数字以外が混ざるものは正規ではない。 */
export function isCanonicalHouiSegment(raw: string): boolean {
  return /^[1-9]\d*$/.test(raw);
}

/**
 * 緩い parseInt では実在する頁になるが、パスが正規ではないとき、
 * 送り先のパスを返す。正規、または送り先が実在しないときは null
 * （404 のまま。実在しない URL へは送らない）。
 */
export function canonicalHouiRedirect(
  pathname: string,
  now = new Date(),
): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "houi") return null;
  if (parts.length !== 3 && parts.length !== 4) return null;

  const yearRaw = parts[1];
  const starRaw = parts[2];
  const monthRaw = parts[3];
  const year = parseInt(yearRaw, 10);
  const star = parseInt(starRaw, 10);
  if (!Number.isInteger(year) || !Number.isInteger(star)) return null;
  if (!houiContentYears(now).includes(year) || !STARS.includes(star)) {
    return null;
  }

  if (monthRaw === undefined) {
    if (isCanonicalHouiSegment(yearRaw) && isCanonicalHouiSegment(starRaw)) {
      return null;
    }
    return `/houi/${year}/${star}`;
  }

  const month = parseInt(monthRaw, 10);
  if (!Number.isInteger(month) || !MONTHS.includes(month)) return null;
  if (!houiMonthContentYears(now).includes(year)) return null;
  if (
    isCanonicalHouiSegment(yearRaw) &&
    isCanonicalHouiSegment(starRaw) &&
    isCanonicalHouiSegment(monthRaw)
  ) {
    return null;
  }
  return `/houi/${year}/${star}/${month}`;
}
