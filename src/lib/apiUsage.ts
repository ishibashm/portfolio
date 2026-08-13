import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import { todayInJapan } from "@/utils/japanDate";

/**
 * 外部 API の呼び出しを数えて、従量課金を推定するところ。
 *
 * 固定費（lib/operatingCosts）と対になる。あちらは月額が決まっているもの、
 * こちらは使った分だけ増えるもの。
 *
 * **記録は本筋を止めない。**費用を数えたいだけなのに、数え損ねて機能が
 * 落ちるのでは本末転倒。書き込みが失敗してもログに残して先へ進む。
 *
 * **単価は推測で埋めない。**LLM の価格は改定されるうえ、ドルなら為替も
 * 要る。分からないものは null にして「呼び出し回数は出るが金額は出ない」
 * 状態にする。#257 の固定費と同じ扱い。回数だけでも十分に読める。
 */

/** 記録 1 件ぶん。呼び出し側はこれだけ渡す。 */
export interface ApiCallRecord {
  /** 提供元。課金はここ単位で来る。 */
  provider: string;
  /** モデル名。同じ提供元でも単価が違う。 */
  model: string;
  /** 呼び出した経路。どの機能が費用を出しているかを見る。 */
  route: string;
  /** 取れないときは渡さない。0 を渡さないこと（別の意味になる）。 */
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * 呼び出しを 1 件記録する。
 *
 * **失敗しても投げない。**呼び出し側は `void recordApiCall(...)` で
 * 投げっぱなしにしてよい。応答を待たせる理由が無い。
 */
export async function recordApiCall(call: ApiCallRecord): Promise<void> {
  try {
    await prisma.apiUsage.create({
      data: {
        day: todayInJapan(),
        provider: call.provider,
        model: call.model,
        route: call.route,
        // undefined は「数えられなかった」。0 で埋めない。
        input_tokens: call.inputTokens ?? null,
        output_tokens: call.outputTokens ?? null,
      },
    });
  } catch (e) {
    // 数えられなくても機能は動かす。原因を追う人のために生の 1 行を残す。
    console.error("API 使用量の記録に失敗:", toLogMessage(e));
  }
}

/**
 * モデルごとの単価。**100 万トークンあたりの円**で持つ。
 *
 * 埋めるときは、提供元の価格表を見て円に直した値を入れること。
 * ドル建てのまま入れると、為替が動いたときに黙って金額がずれる。
 */
export interface ModelPrice {
  provider: string;
  model: string;
  /** 入力 100 万トークンあたりの円。分からないうちは null。 */
  inputYenPerMTok: number | null;
  /** 出力 100 万トークンあたりの円。同上。 */
  outputYenPerMTok: number | null;
  note: string;
}

/**
 * 実際に呼んでいるモデルだけ。使っていないものを並べても意味が無い。
 *
 * 呼び出し箇所（2/3-b で計測を入れる）
 *   gemini-2.5-flash   api/rentals/webhook      メールから物件を取り込む
 *   gemini-2.5-pro     api/relocation-timing    時期の相談
 *   claude-haiku-4-5   api/rentals/parse-query  スマート検索の解釈
 */
export const MODEL_PRICES: ModelPrice[] = [
  {
    provider: "google",
    model: "gemini-2.5-flash",
    inputYenPerMTok: null,
    outputYenPerMTok: null,
    note: "メールからの物件取り込み。件数が増えると効いてくる",
  },
  {
    provider: "google",
    model: "gemini-2.5-pro",
    inputYenPerMTok: null,
    outputYenPerMTok: null,
    note: "時期の相談。flash より単価が高い",
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    inputYenPerMTok: null,
    outputYenPerMTok: null,
    note: "スマート検索の解釈。利用者が打つたびに呼ばれる",
  },
];

/** 集計 1 行ぶん。画面はこの形で受け取る。 */
export interface UsageRow {
  provider: string;
  model: string;
  calls: number;
  /** 数えられた分の合計。取れなかった呼び出しは含まない。 */
  inputTokens: number;
  outputTokens: number;
  /** トークンを数えられなかった呼び出しの数。推定額の当てにならなさを示す。 */
  untrackedCalls: number;
}

/**
 * 推定額。単価か実績が欠けていれば null。
 *
 * トークンを数えられなかった呼び出しがあると、そのぶん**実際より安く**出る。
 * 経費は小さく出るのが一番まずいので、1 件でも欠けていたら出さない。
 * 固定費で「一部だけ埋まった状態では合計を出さない」としたのと同じ理由。
 */
export function estimateYen(
  row: UsageRow,
  prices: ModelPrice[] = MODEL_PRICES,
): number | null {
  if (row.untrackedCalls > 0) return null;

  const p = prices.find(
    (x) => x.provider === row.provider && x.model === row.model,
  );
  if (!p || p.inputYenPerMTok === null || p.outputYenPerMTok === null) {
    return null;
  }

  const M = 1_000_000;
  return (
    (row.inputTokens / M) * p.inputYenPerMTok +
    (row.outputTokens / M) * p.outputYenPerMTok
  );
}

/** 全部の合計。1 つでも出せないものがあれば合計も出さない。 */
export function totalEstimateYen(
  rows: UsageRow[],
  prices: ModelPrice[] = MODEL_PRICES,
): number | null {
  if (rows.length === 0) return 0;
  const each = rows.map((r) => estimateYen(r, prices));
  if (each.some((v) => v === null)) return null;
  return each.reduce((sum: number, v) => sum + (v ?? 0), 0);
}
