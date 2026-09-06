/**
 * 日本時間の暦日を YYYY-MM-DD で得る。
 *
 * `new Date().toISOString().split("T")[0]` は UTC の日付を返す。日本は UTC+9 なので、
 * 日本時間の 0 時〜9 時に画面を開くと「今日」が前日になる。方位と日取りを決める
 * サービスで日盤が 1 日ずれた状態から始まってしまう。
 *
 * 実測（本番 / ブラウザの TZ は Asia/Tokyo）:
 *   ブラウザの今日 2026/8/7 に対し、移住先ページの目標日の初期値が 2026-08-06。
 *
 * 盤の評価「時刻」は @/utils/boardInstant が持つ（正午に固定して太陽時に直す）。
 * こちらが扱うのは「どの暦日か」だけ。役割を混ぜないこと。
 */

const JST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 任意の時刻を、日本時間で見たときの暦日にする。 */
export function toJapanDateString(date: Date): string {
  // en-CA は YYYY-MM-DD を返すが、実装差を避けて部品から組み立てる。
  const parts = JST_FORMATTER.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 日本時間の今日。日付入力の初期値はこれを使う。 */
export function todayInJapan(now: Date = new Date()): string {
  return toJapanDateString(now);
}

const JST_DATETIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * 保存されている生年月日を `datetime-local` の値（YYYY-MM-DDTHH:mm）にする。
 *
 * 以前の実装は `new Date(dateStr)` に通してから端末の現地時間で年月日を
 * 読み直していた。`YYYY-MM-DD` だけの文字列は UTC の 0 時として解釈される
 * ので、
 *
 *   日本の端末 … 1990-05-15 → 1990-05-15T09:00（正午のつもりが 9 時）
 *   日本より西 … 1990-05-15 → 1990-05-14T19:00（**前日**）
 *
 * になり、節月の境目に生まれた人の本命星・月命星が端末の場所で変わった。
 *
 * 規則は 3 つ。
 *   - 日付だけ（YYYY-MM-DD）… Date に通さず、そのまま正午を付ける
 *   - 時刻つきで時差の指定が無い（YYYY-MM-DDTHH:mm…）… 現地の壁時計の
 *     値なので、先頭 16 文字をそのまま使う
 *   - 時差の指定がある（Z や +09:00）… 日本時間に直してから組む
 * 読めない文字列は空にする（壊れた値に正午を足して見せない）。
 */
export function normalizeBirthDateTimeLocal(dateStr: string): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return `${dateStr}T12:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateStr)) {
    const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(dateStr);
    if (!hasOffset) return dateStr.slice(0, 16);
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const parts = JST_DATETIME_FORMATTER.formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
