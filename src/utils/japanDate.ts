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
