/**
 * 方位・日取りについての投稿の、キーと検証。
 *
 * ページ種別ごとに表を分けず、topic_key 一本で紐づける。分けると
 * 一覧・投稿・削除を種別の数だけ書くことになり、必ずどれかが古くなる。
 *
 * キーは URL から機械的に作れる形にしてある。ページ側が文字列を
 * 組み立てて渡すのではなく、ここの関数を通す。表記ゆれで別のページの
 * 投稿になってしまうのを防ぐため。
 */

/** 本文の長さ。DB とフォームと API で同じ値を使う。 */
export const COMMENT_MAX_LENGTH = 800;
export const COMMENT_MIN_LENGTH = 10;

/** 表示名の長さ。 */
export const DISPLAY_NAME_MAX_LENGTH = 40;

/** 1 ページに読み込む件数。 */
export const COMMENTS_PAGE_SIZE = 50;

/**
 * 1 人が 1 日に投稿できる数。
 *
 * この DB は一度 Supabase Free の 500MB を超えて移設している。
 * 行数が読めない書き込み口を増やさないため、上限を先に決めておく。
 */
export const COMMENTS_PER_USER_PER_DAY = 10;

export function houiYearTopic(year: number, star: number): string {
  return `houi:${year}:${star}`;
}

export function houiMonthTopic(
  year: number,
  star: number,
  month: number,
): string {
  return `houi:${year}:${star}:${month}`;
}

export function calendarTopic(year: number, month: number): string {
  return `calendar:${year}-${String(month).padStart(2, "0")}`;
}

export function areaTopic(code: string): string {
  return `area:${code}`;
}

/**
 * 受け取った topic_key が、こちらが発行しうる形かどうか。
 *
 * 検証しないと、任意の文字列で好きなだけ「話題」を作れてしまい、
 * 索引が効かないうえ行数の見積もりも立たない。
 */
const TOPIC_PATTERNS: RegExp[] = [
  /^houi:\d{4}:[1-9]$/,
  /^houi:\d{4}:[1-9]:(1[0-2]|[1-9])$/,
  /^calendar:\d{4}-(0[1-9]|1[0-2])$/,
  /^area:\d{5}$/,
];

export function isValidTopicKey(key: unknown): key is string {
  return typeof key === "string" && TOPIC_PATTERNS.some((re) => re.test(key));
}

export interface CommentInputError {
  field: "topicKey" | "body";
  message: string;
}

/**
 * 投稿の検証。表示名はログイン情報から取るので受け取らない
 * （利用者に打たせると、他人の名前を騙れる）。
 */
export function validateCommentInput(input: {
  topicKey: unknown;
  body: unknown;
}): CommentInputError | null {
  if (!isValidTopicKey(input.topicKey)) {
    return { field: "topicKey", message: "投稿先のページが不正です。" };
  }

  if (typeof input.body !== "string") {
    return { field: "body", message: "本文を入力してください。" };
  }

  const body = input.body.trim();
  if (body.length < COMMENT_MIN_LENGTH) {
    return {
      field: "body",
      message: `本文は${COMMENT_MIN_LENGTH}文字以上で入力してください。`,
    };
  }
  if (body.length > COMMENT_MAX_LENGTH) {
    return {
      field: "body",
      message: `本文は${COMMENT_MAX_LENGTH}文字までです。`,
    };
  }

  return null;
}

/**
 * 表示名。Google のプロフィール名が無いこともあるので、その場合は
 * メールアドレスの手前だけを使う。メールアドレスをそのまま出さない。
 */
export function displayNameFor(
  name: string | null | undefined,
  email: string,
): string {
  const fromName = (name ?? "").trim();
  if (fromName) return fromName.slice(0, DISPLAY_NAME_MAX_LENGTH);
  const local = email.split("@")[0] ?? "利用者";
  return local.slice(0, DISPLAY_NAME_MAX_LENGTH);
}
