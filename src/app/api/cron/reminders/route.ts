import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  REMINDER_DAILY_SEND_LIMIT,
  buildReminderEmail,
  jstToday,
  remindersConfig,
  sendReminderEmail,
  unsubscribeUrl,
} from "@/lib/reminders";
import { activeEmailConsent, purgeOldReminders } from "@/lib/reminderStore";

/**
 * 吉日のお知らせを送る定時処理（.github/workflows/reminders.yml が毎朝呼ぶ）。
 *
 * 鍵がそろっていなければ何もしない（200 で skipped を返す。表にも触らない）。
 * 1 件ずつ scheduled → sending を条件つきで取ってから送るので、二重に
 * 呼ばれても同じお知らせを 2 通送らない。同意が撤回されていれば送らない。
 * ログに送り先・本文は出さない（件数だけ）。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = remindersConfig();
  if (!config.enabled)
    return NextResponse.json({ skipped: "disabled", sent: 0 });

  const today = jstToday();
  const counts = { sent: 0, failed: 0, skipped: 0, expired: 0, purged: 0 };
  try {
    // 吉日を過ぎても送れなかったものは送らない。
    counts.expired = (
      await prisma.reminder.updateMany({
        where: { status: "scheduled", target_date: { lt: today } },
        data: { status: "cancelled" },
      })
    ).count;
    const due = await prisma.reminder.findMany({
      where: {
        status: "scheduled",
        send_on: { lte: today },
        target_date: { gte: today },
      },
      orderBy: { send_on: "asc" },
      take: REMINDER_DAILY_SEND_LIMIT,
    });
    for (const reminder of due) {
      const claimed = await prisma.reminder.updateMany({
        where: { id: reminder.id, status: "scheduled" },
        data: { status: "sending" },
      });
      if (claimed.count !== 1) continue;
      const [consent, config_] = await Promise.all([
        activeEmailConsent(prisma, reminder.user_id),
        prisma.user_configs.findFirst({
          where: { user_id: reminder.user_id },
          select: { user_email: true },
        }),
      ]);
      if (!consent || !config_?.user_email) {
        counts.skipped++;
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: "cancelled" },
        });
        continue;
      }
      const link = unsubscribeUrl(config.secret, reminder.user_id);
      const email = buildReminderEmail({
        targetDate: reminder.target_date,
        direction: reminder.direction,
        // 遅れて送った日でも本文の「◯日後」がずれないよう、今日から数える。
        leadDays: Math.round(
          (Date.parse(`${reminder.target_date}T00:00:00Z`) -
            Date.parse(`${today}T00:00:00Z`)) /
            86_400_000,
        ),
        unsubscribeUrl: link,
      });
      const result = await sendReminderEmail(config, {
        to: config_.user_email,
        ...email,
        unsubscribeUrl: link,
      });
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: result.ok
          ? { status: "sent", sent_at: new Date() }
          : { status: "failed" },
      });
      if (result.ok) counts.sent++;
      else counts.failed++;
    }
    counts.purged = await purgeOldReminders(prisma, today);
    console.info(
      JSON.stringify({
        severity: "INFO",
        event: "reminders_cron",
        today,
        ...counts,
      }),
    );
    return NextResponse.json({ today, ...counts });
  } catch {
    return NextResponse.json(
      { error: "お知らせの処理に失敗しました。", ...counts },
      { status: 500 },
    );
  }
}
