import { z } from "zod";
import { guidancePlan, guidanceValuesSchema } from "@/lib/askGuidance";
import { resolveGuidance } from "@/lib/askGuidanceServer";
import { connectChainClient } from "@/lib/mcpChain";
import { chainRequestError } from "@/lib/mcpChainRequest";
import { agentSubject, canUseAgent } from "@/lib/agentEntitlement";
import { clientKey, TokenBucket } from "@/lib/apiGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Field confirmation and public municipality lookup do not spend a calculation slot.
const formBucket = new TokenBucket(12, 1 / 5000);
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
const schema = z
  .object({
    intent: z.enum(["move", "days", "towns", "star"]),
    values: guidanceValuesSchema,
    action: z.enum(["resolve", "search"]).default("resolve"),
  })
  .strict()
  .refine(
    (value) => value.action !== "search" || Boolean(value.values.municipality),
  );
export async function POST(request: Request) {
  const invalid = chainRequestError(request);
  if (invalid)
    return Response.json(
      { error: "同じサイトのフォームから送信してください。" },
      { status: invalid, headers },
    );
  const ip = clientKey(request.headers);
  if (!formBucket.take(agentSubject({ ip }), Date.now()))
    return Response.json(
      { error: "少し待ってから入力してください。" },
      { status: 429, headers },
    );
  let gate: ReturnType<typeof canUseAgent> | undefined;
  let connection: Awaited<ReturnType<typeof connectChainClient>> | undefined;
  try {
    if (!request.body)
      return Response.json(
        { error: "入力がありません。" },
        { status: 400, headers },
      );
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const timeout = setTimeout(() => void reader.cancel(), 5000);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 4096) {
          await reader.cancel();
          return Response.json(
            { error: "入力が長すぎます。" },
            { status: 413, headers },
          );
        }
        chunks.push(value);
      }
    } finally {
      clearTimeout(timeout);
      reader.releaseLock();
    }
    const body = schema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    if (!body.success)
      return Response.json(
        { error: "入力を確認してください。" },
        { status: 400, headers },
      );
    const plan = guidancePlan(body.data.intent, body.data.values);
    if (body.data.action === "resolve" && plan.fields.length)
      return Response.json(plan, { headers });
    if (body.data.action === "resolve") {
      gate = canUseAgent({ ip, mode: "deterministic" });
      if (!gate.allowed)
        return Response.json({ error: gate.reason }, { status: 429, headers });
    }
    connection = await connectChainClient();
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(20000),
    ]);
    const card = await resolveGuidance(
      body.data.intent,
      body.data.values,
      connection.call,
      signal,
      body.data.action === "search",
    );
    return Response.json(card, { headers });
  } catch {
    return Response.json(
      { error: "条件を確認できませんでした。" },
      { status: 400, headers },
    );
  } finally {
    await connection?.close().catch(() => {});
    gate?.finish();
  }
}
