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

/**
 * 日本時間で n 日前の暦日。集計の窓（直近 30 日など）を day 列と同じ暦で
 * 切るための基準。
 *
 * `new Date("YYYY-MM-DDT00:00:00+09:00")` から n 日引いて toISOString で
 * 読むと **UTC の日付**になる（JST の 0 時は前日の 15 時 UTC）。
 * metrics/summary がこれをやっていて、「昨日」が一昨日、「直近 30 日」が
 * 31 日になっていた。日本は夏時間が無いので、瞬間から 24 時間刻みで引いて
 * JST の暦日を読めばずれない。
 */
export function daysAgoInJapan(days: number, now: Date = new Date()): string {
  return toJapanDateString(new Date(now.getTime() - days * 86_400_000));
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

/**
 * 生年月日時の文字列を、**日本時間として**読む。
 *
 * `new Date("1990-01-02T05:30")` は時差の指定が無いので**実行環境の
 * タイムゾーン**で読まれる。本番（Cloud Run）は UTC なので、日本時間の
 * 5:30 のつもりで入れた値が 5:30Z＝日本時間の 14:30 になる。**9 時間
 * 遅い別人**として判定される。
 *
 * 実測（TZ=UTC。生年月日時 → 本命星 / 時柱）:
 *
 *     1985-02-04T05:00   日本時間で読む  古典 7・丁卯
 *                        UTC で読む      古典 6・辛未   ← 本命星が変わる
 *     1990-01-02T05:30   日本時間で読む  癸卯
 *                        UTC で読む      丁未          ← 時柱が変わる
 *
 * 立春（節年の境目）の前後 9 時間に生まれた人は**本命星が 1 つずれ**、
 * 時刻を入れた人は**時柱が必ずずれる**。方位の吉凶はすべて本命星から
 * 出るので、ここがずれると画面の答えが丸ごと変わる。
 *
 * ## 日付だけの文字列は今までどおり
 *
 * `YYYY-MM-DD` は `new Date` が **UTC の 0 時**として読む（時差の
 * 指定が無い日付だけの形は UTC と決まっている）。日本時間では同じ日の
 * 9 時にあたるので、年・月・日は日本時間で読んでも同じ日になる。
 * ここを日本時間の 0 時に変えると、**時刻を入れていない人の時柱が
 * 巳から子へ動く**（今まで出ていた答えが変わる）。だから触らない。
 *
 * 同じ規則が `api/relocation/nba-evaluate` と `api/municipalities-wealth`
 * にそれぞれ `parseSafeDate` として写されていた。寄せ先はここ。
 */
export function parseJapanDateTime(dateStr: string): Date {
  const hasTime = dateStr.includes("T");
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(dateStr);
  if (hasTime && !hasOffset) return new Date(`${dateStr}+09:00`);
  return new Date(dateStr);
}
