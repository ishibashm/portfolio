import { z } from "zod";
import { chainRequestError } from "@/lib/mcpChainRequest";
import {
  SAVE_OFFER_STAGES,
  SAVE_OFFER_SURFACES,
  conversationKeySchema,
  parseSaveOfferState,
  readSaveOfferCookie,
  recordDeclined,
  recordOffered,
  saveOfferCookieHeader,
  saveOfferFunnelLine,
} from "@/lib/saveOffer";

/**
 * 保存の提案カードの出来事を受け取る。
 *
 * - shown    … その会話では二度と出さない印を Cookie に付ける
 * - declined … 7 日間出さない印を Cookie に付ける
 * - accepted / resumed … 計測だけ
 *
 * 計測は段階と画面（home / ask）だけを 1 行のログに出す。会話の鍵・
 * IP・UA・id・メールは記録しない。Cookie は端末にだけ残る。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    stage: z.enum(SAVE_OFFER_STAGES),
    surface: z.enum(SAVE_OFFER_SURFACES),
    conversationKey: conversationKeySchema.optional(),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const rejected = chainRequestError(request);
  if (rejected)
    return Response.json(
      { error: "送信元を確認できませんでした。" },
      { status: rejected },
    );
  let body: z.infer<typeof bodySchema>;
  try {
    const text = await request.text();
    if (text.length > 1024)
      return Response.json({ error: "入力が長すぎます。" }, { status: 413 });
    const parsed = bodySchema.safeParse(JSON.parse(text));
    if (!parsed.success)
      return Response.json(
        { error: "入力を確認してください。" },
        { status: 400 },
      );
    body = parsed.data;
  } catch {
    return Response.json(
      { error: "JSON形式で送信してください。" },
      { status: 400 },
    );
  }
  let state = parseSaveOfferState(
    readSaveOfferCookie(request.headers.get("cookie")),
  );
  if (
    (body.stage === "shown" ||
      body.stage === "declined" ||
      body.stage === "accepted") &&
    body.conversationKey
  )
    state = recordOffered(state, body.conversationKey);
  if (body.stage === "declined") state = recordDeclined(state);
  console.info(saveOfferFunnelLine(body.stage, body.surface));
  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": saveOfferCookieHeader(state),
      },
    },
  );
}
