/** 生年月日として受け付ける年の範囲。`FengShuiLookup` と同じ。 */
export const MIN_BIRTH_YEAR = 1900;
export const MAX_BIRTH_YEAR = 2050;

/**
 * `<input type="date">` の値（YYYY-MM-DD）として妥当か。
 * 2月30日のような存在しない日付は Date が Invalid Date になるので弾ける。
 */
export function isValidBirthDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < MIN_BIRTH_YEAR || year > MAX_BIRTH_YEAR) return false;
  const d = new Date(`${value}T12:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return false;
  // "2026-02-30" は ISO としては弾かれないエンジンがあるため、
  // 読み戻して同じ日付になることまで確かめる。
  const jst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return jst === value;
}
