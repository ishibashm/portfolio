import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { DIRECTION_LABELS } from "@/utils/directionGeo";
import {
  REMINDER_TEXT,
  formatJapaneseDate,
  type ReminderOfferCard,
} from "./reminderText";
import { paidApisDisabled } from "./paidApis";

export { REMINDER_TEXT, formatJapaneseDate, type ReminderOfferCard };

/**
 * しるべの「吉日のお知らせ」（Phase 2）。
 *
 * **鍵がそろうまで何も動かない。**RESEND_API_KEY・REMINDER_FROM_EMAIL・
 * REMINDER_SECRET のどれかが無ければ `enabled: false` で、画面は出さず、
 * API は 404、送信の定時処理は「止まっている」と返すだけ。表が無くても
 * 落ちない（無効なら DB を読まない）。
 *
 * 守ること
 * - 同意はチェックボックスで別に取る（初期状態は外れている）。同意の記録を残す
 * - どのメールにも配信停止の 1 クリックと送信者の情報を入れる
 * - メール本文に生年月日を書かない。日付と方位とサイトへの印だけ
 * - 日付と方位はモデルの文ではなく、今回の計算（find_auspicious_days）の
 *   結果からサーバーが取り出して署名したものだけを受け付ける
 */

export const REMINDER_POLICY_VERSION = "2026-10-17";
export const REMINDER_LEAD_DAYS = [1, 3, 7] as const;
export const REMINDER_DEFAULT_LEAD_DAYS = 3;
export const REMINDER_MAX_ACTIVE = 20;
/** 1 回の定時処理で送る上限。Resend の無料枠（1 日 100 通）に収める。 */
export const REMINDER_DAILY_SEND_LIMIT = 90;
/** 送ったあと・取り消したあと、行を残す日数（吉日の翌日から数える）。 */
export const REMINDER_RETENTION_DAYS = 30;
/** 何日先までの吉日を受け付けるか。 */
export const REMINDER_MAX_AHEAD_DAYS = 400;
const OFFER_TTL_MS = 24 * 60 * 60 * 1000;
const SITE_URL = "https://cloud-palette.com";

export const directionSchema = z.enum([
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
]);
export const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type RemindersConfig =
  | { enabled: false }
  | { enabled: true; apiKey: string; from: string; secret: string };

export function remindersConfig(
  env: Record<string, string | undefined> = process.env,
): RemindersConfig {
  if (paidApisDisabled(env)) return { enabled: false };
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.REMINDER_FROM_EMAIL?.trim();
  const secret = env.REMINDER_SECRET?.trim();
  if (!apiKey || !from || !secret || secret.length < 32)
    return { enabled: false };
  return { enabled: true, apiKey, from, secret };
}

/** 日本時間の今日（YYYY-MM-DD）。 */
export function jstToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function realDate(ymd: string): boolean {
  return (
    ymdSchema.safeParse(ymd).success &&
    new Date(`${ymd}T00:00:00Z`).toISOString().slice(0, 10) === ymd
  );
}

export function sendOnFor(targetDate: string, leadDays: number): string {
  return addDays(targetDate, -leadDays);
}

/** 選べる「何日前」。送る日が今日より前になるものは出さない。 */
export function availableLeadDays(
  targetDate: string,
  today = jstToday(),
): number[] {
  return REMINDER_LEAD_DAYS.filter(
    (lead) => sendOnFor(targetDate, lead) >= today,
  );
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** 計算結果から取り出した日付・方位に付ける署名（24 時間）。 */
export function signReminderOffer(
  secret: string,
  offer: { date: string; direction: string },
  now = Date.now(),
): string {
  const exp = now + OFFER_TTL_MS;
  const payload = `r1.${offer.date}.${offer.direction}.${exp}`;
  return `${exp}.${sign(secret, payload)}`;
}

export function verifyReminderOffer(
  secret: string,
  offer: { date: string; direction: string; token: string },
  now = Date.now(),
): boolean {
  const [expText, mac] = offer.token.split(".");
  const exp = Number(expText);
  if (!Number.isSafeInteger(exp) || !mac || exp < now) return false;
  return same(mac, sign(secret, `r1.${offer.date}.${offer.direction}.${exp}`));
}

/** 配信停止の印。期限なし（撤回は何度押しても同じ結果）。 */
export function signUnsubscribe(secret: string, userId: string): string {
  return `${Buffer.from(userId).toString("base64url")}.${sign(secret, `u1.${userId}`)}`;
}

export function verifyUnsubscribe(
  secret: string,
  token: string,
): string | null {
  const [encoded, mac] = token.split(".");
  if (!encoded || !mac) return null;
  let userId: string;
  try {
    userId = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!z.uuid().safeParse(userId).success) return null;
  return same(mac, sign(secret, `u1.${userId}`)) ? userId : null;
}

export const reminderOfferSchema = z
  .object({
    date: ymdSchema,
    direction: directionSchema,
    token: z.string().min(10).max(200),
  })
  .strict();

export const createReminderSchema = reminderOfferSchema
  .extend({
    leadDays: z.union([z.literal(1), z.literal(3), z.literal(7)]),
    /** 同意のチェックボックス。true でなければ作らない。 */
    consent: z.literal(true),
  })
  .strict();

export function reminderOfferCard(
  secret: string,
  offer: { date: string; direction: string },
  today = jstToday(),
  now = Date.now(),
): ReminderOfferCard | null {
  const leadDays = availableLeadDays(offer.date, today);
  if (!leadDays.length) return null;
  const label =
    DIRECTION_LABELS[offer.direction as keyof typeof DIRECTION_LABELS];
  if (!label) return null;
  return {
    date: offer.date,
    direction: offer.direction,
    directionLabel: label,
    token: signReminderOffer(secret, offer, now),
    leadDays,
    defaultLeadDays: leadDays.includes(REMINDER_DEFAULT_LEAD_DAYS)
      ? REMINDER_DEFAULT_LEAD_DAYS
      : leadDays[0],
    title: REMINDER_TEXT.title,
    body: `${formatJapaneseDate(offer.date)}・${label}への吉日を、選んだ日数前にメールでお知らせします。`,
    consentLabel: REMINDER_TEXT.consentLabel,
    acceptLabel: REMINDER_TEXT.acceptLabel,
    declineLabel: REMINDER_TEXT.declineLabel,
    note: REMINDER_TEXT.note,
  };
}

/** find_auspicious_days の結果に、その日・その方位が本当にあるか。 */
export function auspiciousDayInResult(
  output: unknown,
  offer: { date: string; direction: string },
): boolean {
  const parsed = z
    .object({
      directions: z.array(
        z.object({
          direction: z.string(),
          bestDays: z.array(z.object({ date: z.string() })).optional(),
        }),
      ),
    })
    .safeParse(output);
  return (
    parsed.success &&
    parsed.data.directions.some(
      (d) =>
        d.direction === offer.direction &&
        (d.bestDays ?? []).some((b) => b.date === offer.date),
    )
  );
}

export function buildReminderEmail(input: {
  targetDate: string;
  direction: string | null;
  leadDays: number;
  unsubscribeUrl: string;
}): { subject: string; text: string; html: string } {
  const date = formatJapaneseDate(input.targetDate);
  const label = input.direction
    ? DIRECTION_LABELS[input.direction as keyof typeof DIRECTION_LABELS]
    : "";
  const subject = `【方位と住まいの手帖】${date}は${label ? `${label}への` : ""}吉日です`;
  const lines = [
    "こんにちは、方位と住まいの手帖の案内役、しるべです。",
    "",
    `ご依頼いただいた吉日のお知らせです。${input.leadDays > 0 ? `${input.leadDays}日後の` : "今日、"}${date}は、${label ? `${label}への` : ""}吉日の候補です。`,
    "",
    "判定は日付や設定で変わることがあります。お出かけや手続きの前に、サイトで最新の結果を確かめてください。",
    `${SITE_URL}/calendar`,
    "",
    "九星気学は参考情報です。契約・費用・通勤など、現実の条件と合わせてご検討ください。",
    "",
    "――",
    "このメールは、Cloud Palette（cloud-palette.com）でお知らせを設定した方にお送りしています。",
    `お知らせを止める：${input.unsubscribeUrl}`,
    `設定の確認・取り消し：${SITE_URL}/account`,
    `お問い合わせ：${SITE_URL}/contact`,
    "送信者：Cloud Palette（方位と住まいの手帖）",
  ];
  const text = lines.join("\n");
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const html = `<div style="font-family:sans-serif;line-height:1.8;color:#1e293b">${lines
    .map((line) =>
      line
        ? escape(line).replace(
            /(https:\/\/cloud-palette\.com\/[^\s<]*)/g,
            (url) => `<a href="${url}">${url}</a>`,
          )
        : "",
    )
    .join("<br>")}</div>`;
  return { subject, text, html };
}

export function unsubscribeUrl(secret: string, userId: string): string {
  return `${SITE_URL}/api/reminders/unsubscribe?token=${encodeURIComponent(signUnsubscribe(secret, userId))}`;
}

/** Resend の HTTP API で 1 通送る。SDK は足さない（依存を増やさない）。 */
export async function sendReminderEmail(
  config: Extract<RemindersConfig, { enabled: true }>,
  message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    unsubscribeUrl: string;
  },
  fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean }> {
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: {
          "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}
