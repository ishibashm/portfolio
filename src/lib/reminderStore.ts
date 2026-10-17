import type { Prisma, PrismaClient } from "@prisma/client";
import {
  REMINDER_POLICY_VERSION,
  REMINDER_RETENTION_DAYS,
  addDays,
} from "@/lib/reminders";

/**
 * お知らせと同意の読み書き。必ず user_id で絞る。
 * 呼ぶ側は remindersConfig().enabled を先に確かめること（無効なら表が
 * 無い環境でも DB を読まない）。
 */
type Db = Pick<PrismaClient, "reminder" | "notificationConsent">;
type Tx = Prisma.TransactionClient;

export async function activeEmailConsent(db: Db | Tx, userId: string) {
  return db.notificationConsent.findFirst({
    where: {
      user_id: userId,
      channel: "email",
      purpose: "reminder",
      revoked_at: null,
    },
    orderBy: { granted_at: "desc" },
  });
}

export async function grantEmailConsent(
  db: Db | Tx,
  userId: string,
  now = new Date(),
) {
  const existing = await activeEmailConsent(db, userId);
  if (existing) return existing;
  return db.notificationConsent.create({
    data: {
      user_id: userId,
      channel: "email",
      purpose: "reminder",
      policy_version: REMINDER_POLICY_VERSION,
      granted_at: now,
    },
  });
}

/** 同意を撤回し、まだ送っていないお知らせを全部取り消す。 */
export async function revokeEmailConsent(
  db: Db | Tx,
  userId: string,
  now = new Date(),
) {
  await db.notificationConsent.updateMany({
    where: {
      user_id: userId,
      channel: "email",
      purpose: "reminder",
      revoked_at: null,
    },
    data: { revoked_at: now },
  });
  await db.reminder.updateMany({
    where: { user_id: userId, status: { in: ["scheduled", "sending"] } },
    data: { status: "cancelled" },
  });
}

/** 吉日から保持日数を過ぎた行を消す（送った・取り消した・失敗したもの）。 */
export async function purgeOldReminders(db: Db | Tx, today: string) {
  const { count } = await db.reminder.deleteMany({
    where: {
      target_date: { lt: addDays(today, -REMINDER_RETENTION_DAYS) },
    },
  });
  return count;
}
