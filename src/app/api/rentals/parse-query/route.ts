import { NextRequest, NextResponse } from "next/server";

import { SmartFilters } from "@/utils/smartSearch";

/**
 * 純粋な自然文の検索語を、絞り込み条件へ解釈する。
 *
 * 「静かで広めの部屋がいい」のような、決定的パーサ（smartSearch.ts）が
 * 構造を 1 つも拾えなかった入力だけがここへ来る。定型表現（8万円以下・
 * 2LDK・徒歩10分…）はクライアント側の正規表現で即時・無料で解釈できる
 * ので、LLM に投げない。トークン代と往復の待ちを、曖昧な入力にだけ払う。
 *
 * ANTHROPIC_API_KEY が無い環境では 501 を返し、クライアントは
 * キーワード検索へ静かに落ちる。この機能が無くても検索は成立する。
 */

export const runtime = "nodejs";

const MODEL = "claude-haiku-4-5";

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 501 Not Implemented: この環境では自然文の解釈を提供していない。
    return NextResponse.json({ available: false }, { status: 501 });
  }

  let query: string;
  try {
    const body = await req.json();
    query = String(body?.query ?? "").slice(0, 300);
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!query.trim()) {
    return NextResponse.json({ error: "empty query" }, { status: 400 });
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
        max_tokens: 500,
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
      return NextResponse.json({ available: false }, { status: 502 });
    }
    const data = await res.json();
    const toolUse = (data?.content ?? []).find(
      (b: { type: string }) => b.type === "tool_use",
    );
    if (!toolUse?.input) {
      return NextResponse.json({ available: false }, { status: 502 });
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
    return NextResponse.json({ available: true, filters });
  } catch {
    return NextResponse.json({ available: false }, { status: 502 });
  }
}

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}
