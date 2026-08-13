import { NextRequest, NextResponse } from "next/server";

import {
  DailyCounter,
  TokenBucket,
  TtlCache,
  clientKey,
  isSameOrigin,
} from "@/lib/apiGuard";
import {
  SmartFilters,
  hasStructuredFilters,
  parseSmartQuery,
} from "@/utils/smartSearch";
import { recordApiCall, tokensFromAnthropicUsage } from "@/lib/apiUsage";

/**
 * 純粋な自然文の検索語を、絞り込み条件へ解釈する。
 *
 * 「静かで広めの部屋がいい」のような、決定的パーサ（smartSearch.ts）が
 * 構造を 1 つも拾えなかった入力だけがここへ来る。定型表現（8万円以下・
 * 2LDK・徒歩10分…）はクライアント側の正規表現で即時・無料で解釈できる
 * ので、LLM に投げない。トークン代と往復の待ちを、曖昧な入力にだけ払う。
 *
 * ここは従量課金の外部 API を叩く唯一のルートで、middleware の認証の外に
 * ある（/api は isInternal 扱い）。つまり誰でも叩ける。クライアント側の
 * 「定型表現なら LLM を使わない」という判断は、直接 POST すれば素通りする
 * ので、費用の歯止めとしては数えない。歯止めはこのファイルの中に置く。
 *
 *   0. 同一オリジンでない POST を弾く
 *   1. 決定的パーサをサーバー側でもう一度かける（構造が取れたら課金しない）
 *   2. 同じ問い合わせはキャッシュから返す
 *   3. 相手ごとに連打を止める
 *   4. 1 日の総数に天井を作る。超えたら LLM を使わず素通りさせる
 *
 * 1〜4 のどれで止めても、機能が落ちるだけで検索は成立する。上限に当たった
 * 利用者にはキーワード検索として扱われた結果が返る。
 *
 * ANTHROPIC_API_KEY が無い環境では 501 を返し、クライアントは
 * キーワード検索へ静かに落ちる。この機能が無くても検索は成立する。
 */

export const runtime = "nodejs";

const MODEL = "claude-haiku-4-5";

/**
 * 1 日の呼び出し上限（1 インスタンスあたり）。Cloud Run は max-instances=2
 * なので実効は最大その 2 倍。Haiku 4.5 で 1 回あたり入力 ~600 / 出力 ~100
 * トークン、$1.00 / $5.00 per 1M として概ね $0.0011。既定の 500 回なら
 * 最悪でも 1000 回 ≒ $1.1/日 で頭打ちになる。
 */
const DAILY_LIMIT = Number(process.env.PARSE_QUERY_DAILY_LIMIT ?? 500);

/** 同じ相手からは 5 連射まで、その後は 20 秒に 1 回だけ回復する */
const bucket = new TokenBucket(5, 1 / 20_000);
const daily = new DailyCounter(DAILY_LIMIT);
/** 同じ文面は 1 時間使い回す。流行りの言い回しで何度も払わない */
const cache = new TtlCache<SmartFilters>(60 * 60 * 1000, 500);

/** LLM に回す価値のない短文は決定的パーサで十分。クライアント側と同じ閾値 */
const MIN_LLM_QUERY_LEN = 8;

const TOOL = {
  name: "set_search_filters",
  description: "賃貸物件の検索条件を設定する",
  input_schema: {
    type: "object",
    properties: {
      maxRentMan: {
        type: "number",
        description: "家賃上限（万円）。管理費込みの総額",
      },
      minRentMan: { type: "number", description: "家賃下限（万円）" },
      maxBuildingAge: { type: "number", description: "築年数の上限（年）" },
      maxStationMin: {
        type: "number",
        description: "駅からの徒歩分数の上限。駅近なら10",
      },
      minSizeSqm: { type: "number", description: "専有面積の下限（㎡）" },
      direction: {
        type: "string",
        enum: ["北", "北東", "東", "南東", "南", "南西", "西", "北西"],
        description: "出発地から見た方位。明示されたときだけ",
      },
      luckyOnly: {
        type: "boolean",
        description: "凶方位を除外するか。吉方位を望む表現があれば true",
      },
      layouts: {
        type: "array",
        items: { type: "string" },
        description: "間取り。1R/1K/1LDK/2DK/2LDK など",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "物件名・住所に含めたい語（地名など）",
      },
    },
    required: ["keywords"],
  },
} as const;

/** キャッシュの鍵。表記ゆれで取りこぼさない程度に均す */
function cacheKey(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 501 Not Implemented: この環境では自然文の解釈を提供していない。
    return NextResponse.json({ available: false }, { status: 501 });
  }

  // 0. 自分のページからの呼び出しに限る。
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let query: string;
  try {
    const body = await req.json();
    query = String(body?.query ?? "").slice(0, 300);
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  query = query.trim();
  if (!query) {
    return NextResponse.json({ error: "empty query" }, { status: 400 });
  }

  // 1. 無料で解ける入力に金を払わない。クライアントを信用せずここで判定する。
  const local = parseSmartQuery(query);
  if (hasStructuredFilters(local) || query.length < MIN_LLM_QUERY_LEN) {
    return NextResponse.json({
      available: true,
      source: "local",
      filters: local,
    });
  }

  // 2. 同じ文面は前の答えを返す。
  const key = cacheKey(query);
  const now = Date.now();
  const cached = cache.get(key, now);
  if (cached) {
    return NextResponse.json({
      available: true,
      source: "cache",
      filters: cached,
    });
  }

  // 3. 連打を止める。ここで返すのも「解釈できなかった」扱いにして、
  //    画面はキーワード検索へ落ちる（エラー表示にはしない）。
  if (!bucket.take(clientKey(req.headers), now)) {
    return NextResponse.json(
      { available: false, reason: "rate_limited", filters: local },
      {
        status: 429,
        headers: {
          "retry-after": String(
            Math.max(1, bucket.retryAfterSec(clientKey(req.headers), now)),
          ),
        },
      },
    );
  }

  // 4. 1 日の天井。届いたら LLM を使わずキーワード検索として返す。
  //    落ちる側に倒す（fail closed）。上限を超えて課金され続けるより、
  //    自然文の解釈だけが今日は効かない、という状態のほうが望ましい。
  if (!daily.tryConsume(now)) {
    return NextResponse.json({
      available: false,
      reason: "daily_limit",
      filters: local,
    });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        // 返るのは検索条件の JSON だけ。出力は $5/1M と入力の 5 倍なので絞る。
        max_tokens: 300,
        // 曖昧な希望を検索条件に落とすだけ。会話はさせない。
        system:
          "あなたは賃貸検索の条件解釈だけを行う。ユーザーの希望文から" +
          "set_search_filters を1回呼ぶ。推測しすぎない。明示されていない" +
          "条件は設定しない。「広め」は minSizeSqm=40、「安め」は" +
          "maxRentMan=6 程度の控えめな解釈にとどめる。",
        tools: [TOOL],
        tool_choice: { type: "tool", name: "set_search_filters" },
        messages: [{ role: "user", content: query }],
      }),
      // 検索 UI から呼ばれる。待たせても意味がないので短く切る。
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      // 課金が起きていない見込みのぶんは日次カウントに戻す。
      if (res.status >= 500 || res.status === 429) daily.refund(now);
      return NextResponse.json(
        { available: false, filters: local },
        { status: 502 },
      );
    }
    const data = await res.json();
    void recordApiCall({
      provider: "anthropic",
      model: MODEL,
      route: "/api/rentals/parse-query",
      ...tokensFromAnthropicUsage(data?.usage),
    });
    const toolUse = (data?.content ?? []).find(
      (b: { type: string }) => b.type === "tool_use",
    );
    if (!toolUse?.input) {
      return NextResponse.json(
        { available: false, filters: local },
        { status: 502 },
      );
    }

    const input = toolUse.input as Partial<SmartFilters>;
    const filters: SmartFilters = {
      maxRentMan: numberOrUndefined(input.maxRentMan),
      minRentMan: numberOrUndefined(input.minRentMan),
      maxBuildingAge: numberOrUndefined(input.maxBuildingAge),
      maxStationMin: numberOrUndefined(input.maxStationMin),
      minSizeSqm: numberOrUndefined(input.minSizeSqm),
      direction:
        typeof input.direction === "string" ? input.direction : undefined,
      luckyOnly: input.luckyOnly === true ? true : undefined,
      status: undefined,
      layouts: Array.isArray(input.layouts)
        ? input.layouts.map(String).slice(0, 5)
        : [],
      keywords: Array.isArray(input.keywords)
        ? input.keywords.map(String).slice(0, 5)
        : [],
    };
    cache.set(key, filters, now);
    return NextResponse.json({ available: true, source: "llm", filters });
  } catch {
    // タイムアウト・接続断。応答を受け取れていないので戻す。
    daily.refund(now);
    return NextResponse.json(
      { available: false, filters: local },
      { status: 502 },
    );
  }
}

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}
