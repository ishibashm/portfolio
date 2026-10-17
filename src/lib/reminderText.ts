/**
 * お知らせの文面と型。画面（クライアント）からも読むので、node:crypto を
 * 使う lib/reminders.ts から切り離してある。
 */
export type ReminderOfferCard = {
  date: string;
  direction: string;
  directionLabel: string;
  token: string;
  leadDays: number[];
  defaultLeadDays: number;
  title: string;
  body: string;
  consentLabel: string;
  acceptLabel: string;
  declineLabel: string;
  note: string;
};

export const REMINDER_TEXT = {
  title: "この吉日をお知らせしましょうか？",
  consentLabel:
    "吉日のお知らせをメールで受け取ることに同意します（いつでも止められます）",
  acceptLabel: "お知らせを設定する",
  declineLabel: "今はしない",
  note: "送り先はログインに使っているメールアドレスです。生年月日はメールに書きません。設定はアカウントのページで確認・取り消しできます。",
  declinedReply: "わかりました。必要になったら、またいつでもお声がけください。",
  createdReply: "お知らせを設定しました。前日までにメールでお届けします。",
} as const;

export function formatJapaneseDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const week = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}年${m}月${d}日（${week}）`;
}
