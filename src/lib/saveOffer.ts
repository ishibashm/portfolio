import { z } from "zod";

/**
 * しるべの「結果を保存する」提案（Phase 1）。
 *
 * 提案するかどうかはモデルではなくサーバーが決める。モデルにできるのは
 * `propose_save` で「出したい」と頼むことだけで、文面・ボタン・保存項目は
 * すべてここに固定してある（モデルの文や道具の結果、相談メモに何が
 * 書かれていても、カードの中身は変わらない）。
 *
 * 守ること（docs/site-spec.md「保存の提案」）
 * - 1 つの会話で 1 回まで
 * - 実際の計算結果を出したあとだけ
 * - 「今はしない」から 7 日は出さない
 * - ログイン中は出さない
 * - 保存しなくても全機能が使える。不安をあおる文・急がせる文を書かない
 * - Phase 1 は保存だけ。お知らせ（メール）はまだ無いので約束しない
 */

export const SAVE_OFFER_COOKIE = "cp_save_offer";
export const SAVE_OFFER_DECLINE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 覚えておく会話の数。古いものから捨てる（Cookie を太らせない）。 */
export const SAVE_OFFER_MAX_CONVERSATIONS = 30;

/** 提案の根拠にしてよい「実際の計算結果」。記事検索や地名検索だけでは出さない。 */
export const SAVE_OFFER_RESULT_TOOLS = [
  "get_honmei_star",
  "judge_directions",
  "find_auspicious_days",
  "area_directions",
  "get_kanshi",
] as const;

/** ブラウザーが会話ごとに作る鍵。中身に意味を持たせない（人を指さない）。 */
export const conversationKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);

export const proposeSaveInputSchema = z
  .object({
    reason: z.enum(["save_result", "compare_people"]),
    resultCallIds: z.array(z.string().min(1).max(100)).min(1).max(8),
  })
  .strict();
export type ProposeSaveInput = z.infer<typeof proposeSaveInputSchema>;

export type SaveOfferSuppressed =
  | "signed_in"
  | "declined"
  | "already_offered"
  | "no_result"
  | "no_conversation";

export type SaveOfferField = { key: SaveOfferFieldKey; label: string };
export type SaveOfferFieldKey =
  | "conversations"
  | "memories"
  | "people"
  | "email";

/** サーバーが書くカード。モデルの文は入らない。 */
export type SaveOfferCard = {
  conversationKey: string;
  title: string;
  body: string;
  fields: SaveOfferField[];
  note: string;
  acceptLabel: string;
  declineLabel: string;
};

export const SAVE_OFFER_TEXT = {
  title: "この相談を保存しておきますか？",
  body: "ログインすると、いまの結果と会話をアカウントに保存して、別の端末からも見返せます。保存しなくても、これまでどおりすべての機能を使えます。",
  fields: [
    { key: "conversations", label: "この端末の相談の会話" },
    { key: "memories", label: "相談メモ" },
    {
      key: "people",
      label:
        "人物プロフィール（呼び名・生年月日、入力していれば出生地・現住所）",
    },
    { key: "email", label: "ログインに使う Google アカウントのメールアドレス" },
  ] satisfies SaveOfferField[],
  note: "保存した内容は、アカウントのページからいつでもまとめて削除できます。",
  acceptLabel: "結果を保存する",
  declineLabel: "今はしない",
  declinedReply:
    "わかりました。必要になったら、いつでもログインして保存できます。",
} as const;

export function saveOfferCard(conversationKey: string): SaveOfferCard {
  return {
    conversationKey,
    title: SAVE_OFFER_TEXT.title,
    body: SAVE_OFFER_TEXT.body,
    fields: SAVE_OFFER_TEXT.fields.map((f) => ({ ...f })),
    note: SAVE_OFFER_TEXT.note,
    acceptLabel: SAVE_OFFER_TEXT.acceptLabel,
    declineLabel: SAVE_OFFER_TEXT.declineLabel,
  };
}

/** Cookie に置く状態。個人を指す値は入れない（会話の鍵は端末が作る乱数）。 */
export type SaveOfferState = {
  /** 「今はしない」から提案を止める期限（epoch ms）。 */
  declinedUntil?: number;
  /** 提案を出した会話の鍵（新しいものが後ろ）。 */
  offered: string[];
};

const stateSchema = z
  .object({
    d: z.number().int().nonnegative().optional(),
    o: z.array(conversationKeySchema).max(SAVE_OFFER_MAX_CONVERSATIONS),
  })
  .strict();

export function parseSaveOfferState(
  raw: string | undefined | null,
): SaveOfferState {
  if (!raw) return { offered: [] };
  try {
    const parsed = stateSchema.safeParse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    if (!parsed.success) return { offered: [] };
    return {
      ...(parsed.data.d !== undefined ? { declinedUntil: parsed.data.d } : {}),
      offered: parsed.data.o,
    };
  } catch {
    return { offered: [] };
  }
}

export function serializeSaveOfferState(state: SaveOfferState): string {
  return Buffer.from(
    JSON.stringify({
      ...(state.declinedUntil !== undefined ? { d: state.declinedUntil } : {}),
      o: state.offered.slice(-SAVE_OFFER_MAX_CONVERSATIONS),
    }),
    "utf8",
  ).toString("base64url");
}

export function recordOffered(
  state: SaveOfferState,
  conversationKey: string,
): SaveOfferState {
  return {
    ...state,
    offered: [
      ...state.offered.filter((key) => key !== conversationKey),
      conversationKey,
    ].slice(-SAVE_OFFER_MAX_CONVERSATIONS),
  };
}

export function recordDeclined(
  state: SaveOfferState,
  now = Date.now(),
): SaveOfferState {
  return { ...state, declinedUntil: now + SAVE_OFFER_DECLINE_DAYS * DAY_MS };
}

export function readSaveOfferCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SAVE_OFFER_COOKIE) return rest.join("=");
  }
  return "";
}

export function saveOfferCookieHeader(state: SaveOfferState): string {
  return [
    `${SAVE_OFFER_COOKIE}=${serializeSaveOfferState(state)}`,
    "Path=/",
    `Max-Age=${90 * 24 * 60 * 60}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

/** 会話の始めに決まる条件（道具をモデルへ見せるかどうか）。 */
export function saveOfferPrecheck(input: {
  signedIn: boolean;
  conversationKey?: string;
  state: SaveOfferState;
  now?: number;
}): { allowed: true } | { allowed: false; reason: SaveOfferSuppressed } {
  const now = input.now ?? Date.now();
  if (input.signedIn) return { allowed: false, reason: "signed_in" };
  if (!input.conversationKey)
    return { allowed: false, reason: "no_conversation" };
  if (
    input.state.declinedUntil !== undefined &&
    input.state.declinedUntil > now
  )
    return { allowed: false, reason: "declined" };
  if (input.state.offered.includes(input.conversationKey))
    return { allowed: false, reason: "already_offered" };
  return { allowed: true };
}

/**
 * 1 回の回答の中で使う関所。モデルが何度呼んでも、ここを通るのは 1 回だけ。
 * `hasResult` は「その id が今回の実行で成功した計算の道具か」を返す。
 */
export function createSaveOfferGate(input: {
  signedIn: boolean;
  conversationKey?: string;
  state: SaveOfferState;
  now?: number;
}) {
  let used = false;
  const pre = saveOfferPrecheck(input);
  return {
    available: pre.allowed,
    request(
      proposal: unknown,
      hasResult: (callId: string) => boolean,
    ):
      | { shown: true; card: SaveOfferCard }
      | { shown: false; suppressed: SaveOfferSuppressed | "invalid" } {
      if (!pre.allowed) return { shown: false, suppressed: pre.reason };
      if (used) return { shown: false, suppressed: "already_offered" };
      const parsed = proposeSaveInputSchema.safeParse(proposal);
      if (!parsed.success) return { shown: false, suppressed: "invalid" };
      if (!parsed.data.resultCallIds.some(hasResult))
        return { shown: false, suppressed: "no_result" };
      used = true;
      return { shown: true, card: saveOfferCard(input.conversationKey!) };
    },
  };
}
export type SaveOfferGate = ReturnType<typeof createSaveOfferGate>;

/** 計測の段階。個人を指す値（id・メール・IP・会話の鍵）は記録しない。 */
export const SAVE_OFFER_STAGES = [
  "shown",
  "accepted",
  "declined",
  "resumed",
] as const;
export type SaveOfferStage = (typeof SAVE_OFFER_STAGES)[number];
export const SAVE_OFFER_SURFACES = ["home", "ask"] as const;

export function saveOfferFunnelLine(
  stage: SaveOfferStage,
  surface: (typeof SAVE_OFFER_SURFACES)[number],
): string {
  return JSON.stringify({
    severity: "INFO",
    event: "save_offer_funnel",
    stage,
    surface,
  });
}

/** 再開用の URL。会話の鍵だけを載せる（生年月日などは載せない）。 */
export function saveOfferResumePath(conversationId: string): string {
  return `/ask?resume=${encodeURIComponent(conversationId)}`;
}
export function saveOfferLoginPath(conversationId: string): string {
  return `/login?next=${encodeURIComponent(saveOfferResumePath(conversationId))}`;
}
