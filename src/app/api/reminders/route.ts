import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/apiGuard";
import { privateHeaders } from "@/lib/listingCandidateApi";
import prisma from "@/lib/prisma";
import { getAuthUser, toUserId } from "@/lib/userConfig";
import {
  REMINDER_MAX_ACTIVE,
  REMINDER_MAX_AHEAD_DAYS,
  addDays,
  createReminderSchema,
  jstToday,
  realDate,
  remindersConfig,
  sendOnFor,
  verifyReminderOffer,
} from "@/lib/reminders";
import {
  activeEmailConsent,
  grantEmailConsent,
  revokeEmailConsent,
} from "@/lib/reminderStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: privateHeaders });

async function signedInUserId() {
  const user = await getAuthUser();
  return user ? toUserId(user) : null;
}

/** 本人のお知らせ一覧。無効なら DB を読まずに enabled:false だけ返す。 */
export async function GET() {
  if (!remindersConfig().enabled) return json({ enabled: false });
  const userId = await signedInUserId();
  if (!userId) return json({ error: "Unauthorized" }, 401);
  try {
    const [reminders, consent] = await Promise.all([
      prisma.reminder.findMany({
        where: { user_id: userId, status: { in: ["scheduled", "sending"] } },
        orderBy: { target_date: "asc" },
        take: REMINDER_MAX_ACTIVE,
        select: {
          id: true,
          target_date: true,
          direction: true,
          lead_days: true,
          send_on: true,
        },
      }),
      activeEmailConsent(prisma, userId),
    ]);
    return json({
      enabled: true,
      consent: consent ? { grantedAt: consent.granted_at.toISOString() } : null,
      reminders: reminders.map((r) => ({
        id: r.id,
        date: r.target_date,
        direction: r.direction,
        leadDays: r.lead_days,
        sendOn: r.send_on,
      })),
    });
  } catch {
    return json({ error: "お知らせを読み込めませんでした。" }, 500);
  }
}

/** しるべのカードから、同意つきでお知らせを作る。 */
export async function POST(request: NextRequest) {
  const config = remindersConfig();
  if (!config.enabled) return json({ error: "Not found" }, 404);
  if (!isSameOrigin(request))
    return json({ error: "同じサイトから操作してください。" }, 403);
  const userId = await signedInUserId();
  if (!userId) return json({ error: "ログインしてください。" }, 401);
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 2048) return json({ error: "入力が長すぎます。" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "JSON形式で送信してください。" }, 400);
  }
  const parsed = createReminderSchema.safeParse(body);
  if (!parsed.success)
    return json(
      { error: "同意のチェックと、お知らせする日数を確認してください。" },
      400,
    );
  const input = parsed.data;
  if (!realDate(input.date) || !verifyReminderOffer(config.secret, input))
    return json({ error: "しるべの案内からもう一度設定してください。" }, 400);
  const today = jstToday();
  const sendOn = sendOnFor(input.date, input.leadDays);
  if (sendOn < today || input.date > addDays(today, REMINDER_MAX_AHEAD_DAYS))
    return json({ error: "その日数前のお知らせは設定できません。" }, 400);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const active = await tx.reminder.count({
        where: { user_id: userId, status: { in: ["scheduled", "sending"] } },
      });
      if (active >= REMINDER_MAX_ACTIVE) return "full" as const;
      await grantEmailConsent(tx, userId);
      await tx.reminder.upsert({
        where: {
          user_id_target_date_direction: {
            user_id: userId,
            target_date: input.date,
            direction: input.direction,
          },
        },
        create: {
          user_id: userId,
          kind: "auspicious_day",
          target_date: input.date,
          direction: input.direction,
          lead_days: input.leadDays,
          send_on: sendOn,
          channel: "email",
          status: "scheduled",
        },
        update: {
          lead_days: input.leadDays,
          send_on: sendOn,
          status: "scheduled",
          sent_at: null,
        },
      });
      return "ok" as const;
    });
    if (result === "full")
      return json(
        { error: `お知らせは${REMINDER_MAX_ACTIVE}件までです。` },
        409,
      );
    return json({ ok: true, sendOn });
  } catch {
    return json({ error: "お知らせを設定できませんでした。" }, 500);
  }
}

/** 1 件の取り消し（?id=）か、メールのお知らせをすべて止める（?all=1）。 */
export async function DELETE(request: NextRequest) {
  if (!remindersConfig().enabled) return json({ error: "Not found" }, 404);
  if (!isSameOrigin(request))
    return json({ error: "同じサイトから操作してください。" }, 403);
  const userId = await signedInUserId();
  if (!userId) return json({ error: "ログインしてください。" }, 401);
  const params = request.nextUrl.searchParams;
  try {
    if (params.get("all") === "1") {
      await revokeEmailConsent(prisma, userId);
      return json({ ok: true });
    }
    const id = params.get("id");
    if (!id || id.length > 100)
      return json({ error: "id がありません。" }, 400);
    const { count } = await prisma.reminder.updateMany({
      where: { id, user_id: userId, status: { in: ["scheduled", "sending"] } },
      data: { status: "cancelled" },
    });
    return json({ ok: count > 0 });
  } catch {
    return json({ error: "取り消せませんでした。" }, 500);
  }
}
