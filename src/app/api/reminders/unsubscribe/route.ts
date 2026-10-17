import prisma from "@/lib/prisma";
import { remindersConfig, verifyUnsubscribe } from "@/lib/reminders";
import { revokeEmailConsent } from "@/lib/reminderStore";

/**
 * メールの「お知らせを止める」。
 *
 * - GET はページを出すだけで、何も変えない（メールの事前読み込みや
 *   リンクの安全確認で止まってしまわないように）
 * - POST で止める。メールソフトの 1 クリック停止（RFC 8058。
 *   `List-Unsubscribe=One-Click` の POST）も同じ口で受ける
 *
 * ログインは要らない。署名つきの印だけで本人を確かめる。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}｜Cloud Palette</title></head><body style="font-family:sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.8;color:#1e293b"><h1 style="font-size:1.25rem">${title}</h1>${body}<p><a href="/">トップページへ</a></p></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

function tokenFrom(request: Request): string {
  return new URL(request.url).searchParams.get("token") ?? "";
}

const INVALID = () =>
  page(
    "リンクを確認できませんでした",
    "<p>メールのリンクが途中で切れているかもしれません。ログインして、アカウントのページからお知らせを止めることもできます。</p>",
    400,
  );

export async function GET(request: Request) {
  const config = remindersConfig();
  if (!config.enabled)
    return page(
      "お知らせは停止中です",
      "<p>現在、メールのお知らせは送っていません。</p>",
      404,
    );
  const token = tokenFrom(request);
  if (!verifyUnsubscribe(config.secret, token)) return INVALID();
  const action = `/api/reminders/unsubscribe?token=${encodeURIComponent(token)}`;
  return page(
    "吉日のお知らせを止めますか？",
    `<p>止めると、設定済みのお知らせもすべて取り消されます。あとからまた設定できます。</p><form method="post" action="${action}"><button type="submit" style="padding:.75rem 1.5rem;font-size:1rem">お知らせを止める</button></form>`,
  );
}

export async function POST(request: Request) {
  const config = remindersConfig();
  if (!config.enabled)
    return page(
      "お知らせは停止中です",
      "<p>現在、メールのお知らせは送っていません。</p>",
      404,
    );
  const userId = verifyUnsubscribe(config.secret, tokenFrom(request));
  if (!userId) return INVALID();
  try {
    await revokeEmailConsent(prisma, userId);
  } catch {
    return page(
      "止められませんでした",
      "<p>時間をおいてもう一度お試しください。アカウントのページからも止められます。</p>",
      500,
    );
  }
  return page(
    "お知らせを止めました",
    "<p>吉日のお知らせメールは今後お送りしません。設定済みのお知らせも取り消しました。</p>",
  );
}
