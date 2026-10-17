import { blocksFromTool, type BlockSources } from "./answerBlockBuilder";
import type { AnswerBlock } from "./answerBlocks";
import { toolCallKey } from "./mcpToolCallKey";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/lib/mcpServer";
import { isAuspiciousStatus } from "@/utils/noiseSeverity";
import { toJapanDateString } from "@/utils/japanDate";
import { sanitizeFollowUpSuggestions } from "./followUpSuggestions";

export const CHAIN_LIMITS = {
  depth: 4,
  calls: 20,
  callMs: 8000,
  totalMs: 30000,
};
export const CHAIN_TOOLS = [
  "get_kanshi",
  "get_honmei_star",
  "judge_directions",
  "find_auspicious_days",
  "search_municipality",
  "area_directions",
  "prefecture_summary",
  "search_articles",
  "get_article",
] as const;
export function assertChainTool(name: string): void {
  if (!(CHAIN_TOOLS as readonly string[]).includes(name))
    throw new Error("許可されていない道具です。");
}
export const chainDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00+09:00`);
    return (
      Number.isFinite(d.getTime()) &&
      toJapanDateString(d) === s &&
      s >= "1900-01-01" &&
      s <= "2100-12-01"
    );
  }, "1900年から2100年12月1日までの実在する日を指定してください。");
export const chainInputSchema = z
  .object({
    birthDate: chainDateSchema,
    municipality: z.string().trim().min(2).max(80),
    date: chainDateSchema.optional(),
    depth: z.number().int().min(0).max(CHAIN_LIMITS.depth).default(3),
    mode: z.enum(["deterministic", "llm"]).default("deterministic"),
  })
  .strict();
export type ChainInput = z.infer<typeof chainInputSchema>;
export type ChainEvent =
  | { type: "blocks"; blocks: AnswerBlock[] }
  | {
      type: "call";
      id: number;
      parentId: number | null;
      depth: number;
      tool: string;
      input: Record<string, unknown>;
      output?: unknown;
      summary: string;
      durationMs: number;
      error?: boolean;
    }
  | {
      type: "done";
      calls: number;
      reasons: string[];
      suggestions?: string[];
    };
export { chainLlmState } from "./mcpAgentConfig";
export type ChainCaller = (
  name: string,
  input: Record<string, unknown>,
  signal: AbortSignal,
  timeout: number,
) => Promise<unknown>;
export async function connectChainClient() {
  const server = createMcpServer();
  const client = new Client({
    name: "cloud-palette-explorer",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const close = async () => {
    await Promise.allSettled([client.close(), server.close()]);
  };
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const call: ChainCaller = async (name, input, signal, timeout) => {
      assertChainTool(name);
      const result = await client.callTool(
        { name, arguments: input },
        undefined,
        { signal, timeout },
      );
      if (result.isError) throw new Error("道具が入力を処理できませんでした。");
      return result.structuredContent;
    };
    return { call, close, listTools: () => client.listTools() };
  } catch (error) {
    await close();
    throw error;
  }
}
const municipalitySchema = z.object({
  code: z.string().regex(/^\d{5}$/),
  name: z.string(),
  lon: z.number().min(122).max(154),
});
const directionsSchema = z.object({
  date: chainDateSchema,
  directions: z.array(
    z.object({ direction: z.string(), label: z.string(), status: z.string() }),
  ),
});
const areaSchema = z.object({
  origin: municipalitySchema,
  directions: z.array(
    z.object({
      direction: z.string(),
      nearest: z.array(
        z.object({ code: z.string().regex(/^\d{5}$/), name: z.string() }),
      ),
    }),
  ),
});
const auspiciousDaysSchema = z.object({
  directions: z.array(
    z.object({
      label: z.string(),
      bestDays: z.array(z.object({ date: z.string() })),
    }),
  ),
});

function calculationFollowUps(
  input: ChainInput,
  sources: BlockSources,
): string[] {
  const towns: string[] = [];
  const days: string[] = [];
  const auspiciousDirections: string[] = [];
  const searchResults: string[] = [];
  for (const source of sources.values()) {
    if (source.tool === "area_directions") {
      for (const block of blocksFromTool(source.tool, source.output, sources))
        if (block.type === "towns")
          towns.push(...block.towns.map((town) => town.name));
    }
    if (source.tool === "find_auspicious_days") {
      const result = auspiciousDaysSchema.safeParse(source.output);
      if (result.success)
        days.push(
          ...result.data.directions.flatMap((direction) =>
            direction.bestDays.map((day) => day.date),
          ),
        );
    }
    if (source.tool === "judge_directions") {
      const result = directionsSchema.safeParse(source.output);
      if (result.success)
        auspiciousDirections.push(
          ...result.data.directions
            .filter((direction) => isAuspiciousStatus(direction.status))
            .map((direction) => direction.label),
        );
    }
    if (source.tool === "search_municipality") {
      const result = z
        .object({ results: z.array(municipalitySchema) })
        .safeParse(source.output);
      if (result.success)
        searchResults.push(...result.data.results.map((place) => place.name));
    }
  }
  return sanitizeFollowUpSuggestions([
    ...(towns[0] ? [`${towns[0]}を出発地にして方位を計算する？`] : []),
    ...(days[0] ? [`${days[0]}を対象日にして候補を比べる？`] : []),
    ...(auspiciousDirections[0]
      ? [`${auspiciousDirections[0]}の街をさらに先まで見る？`]
      : []),
    ...(towns[1] ? [`${towns[1]}も出発地にして結果を比べる？`] : []),
    ...(searchResults.length > 1
      ? [`${searchResults[0]}を出発地に指定して計算する？`]
      : []),
    `${input.municipality}で対象日を変えて比べる？`,
    "県名を含む市区町村名で計算し直す？",
    "生年月日と出発地を確認して再計算する？",
  ]);
}

/** 深さは検索を0とする依存の辺の数。地理の再展開は移転の推奨ではない。 */
export async function runChain(
  raw: ChainInput,
  call: ChainCaller,
  emit: (event: ChainEvent) => void,
  signal: AbortSignal = new AbortController().signal,
  limits = CHAIN_LIMITS,
) {
  const input = chainInputSchema.parse(raw);
  if (input.mode !== "deterministic") throw new Error("LLM方式は無効です。");
  const maxDepth = Math.min(input.depth, limits.depth, CHAIN_LIMITS.depth);
  const maxCalls = Math.min(limits.calls, CHAIN_LIMITS.calls);
  const deadline = Date.now() + Math.min(limits.totalMs, CHAIN_LIMITS.totalMs);
  const results = new Map<string, { id: number; output: unknown }>();
  const blockSources: BlockSources = new Map();
  let calls = 0;
  const reasons = new Set<string>();
  const visited = new Set<string>();
  const date = input.date ?? toJapanDateString(new Date());
  async function invoke(
    tool: string,
    args: Record<string, unknown>,
    depth: number,
    parentId: number | null,
    summarize: (out: unknown) => string,
  ) {
    assertChainTool(tool);
    if (signal.aborted) {
      reasons.add("接続が終了したため打ち切りました。");
      return null;
    }
    if (Date.now() >= deadline) {
      reasons.add("全体の時間上限で打ち切りました。");
      return null;
    }
    if (depth > maxDepth) {
      reasons.add("深さの上限で打ち切りました。");
      return null;
    }
    const key = toolCallKey(tool, args);
    const previous = results.get(key);
    if (previous) return previous;
    if (calls >= maxCalls) {
      reasons.add("道具の回数上限で打ち切りました。");
      return null;
    }
    const id = ++calls;
    const started = Date.now();
    const timeout = Math.min(
      limits.callMs,
      CHAIN_LIMITS.callMs,
      deadline - started,
    );
    const abort = AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const output = await Promise.race([
        call(tool, args, abort, timeout),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error("呼び出しを中断しました。"));
          abort.addEventListener("abort", onAbort, { once: true });
          timer = setTimeout(
            () => reject(new Error("呼び出しの時間上限で打ち切りました。")),
            timeout,
          );
        }),
      ]);
      // 同期計算中はタイマーが動けないため、返った直後にも期限を見る。
      if (abort.aborted || Date.now() - started >= timeout)
        throw new Error("呼び出しの時間上限で打ち切りました。");
      emit({
        type: "call",
        id,
        parentId,
        depth,
        tool,
        input: args,
        output,
        summary: summarize(output),
        durationMs: Date.now() - started,
      });
      blockSources.set(String(id), { tool, output });
      const blocks = blocksFromTool(tool, output, blockSources);
      if (blocks.length) emit({ type: "blocks", blocks });
      const result = { id, output };
      results.set(key, result);
      return result;
    } catch {
      const message =
        abort.aborted || Date.now() - started >= timeout
          ? "時間上限または中断により打ち切りました。"
          : "道具の処理に失敗したため、この枝を打ち切りました。";
      reasons.add(message);
      emit({
        type: "call",
        id,
        parentId,
        depth,
        tool,
        input: args,
        summary: message,
        durationMs: Date.now() - started,
        error: true,
      });
      return null;
    } finally {
      clearTimeout(timer);
      if (onAbort) abort.removeEventListener("abort", onAbort);
      // 完了イベントをストリームへ渡し、切断と期限の通知も処理する。
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  const search = await invoke(
    "search_municipality",
    { query: input.municipality, limit: 10 },
    0,
    null,
    (out) => {
      const data = z
        .object({ results: z.array(municipalitySchema) })
        .parse(out);
      return `${data.results.length}件の市区町村が見つかりました。`;
    },
  );
  if (search) {
    const results = z
      .object({ results: z.array(municipalitySchema) })
      .parse(search.output).results;
    // 同名の街を勝手に選ばない。県名を含む正式名との完全一致を優先する。
    const origin =
      results.find((r) => r.name === input.municipality) ??
      (results.length === 1 ? results[0] : undefined);
    if (!origin)
      reasons.add(
        results.length
          ? "出発地を一つに絞れません。県名を含む市区町村名で入力してください。"
          : "出発地が見つかりませんでした。",
      );
    else {
      const honmei = await invoke(
        "get_honmei_star",
        { birthDate: input.birthDate },
        1,
        search.id,
        (out) =>
          `本命星は${z.object({ honmeiStar: z.number() }).parse(out).honmeiStar}です。`,
      );
      if (honmei) {
        const birth = z
          .object({ birthDate: chainDateSchema })
          .parse(honmei.output).birthDate;
        const judged = await invoke(
          "judge_directions",
          { birthDate: birth, lon: origin.lon, date },
          2,
          honmei.id,
          (out) => {
            const data = directionsSchema.parse(out);
            const good = data.directions.filter((d) =>
              isAuspiciousStatus(d.status),
            );
            return good.length
              ? `吉とされる方位：${good.map((d) => d.label).join("・")}`
              : "この条件では吉方位がありません。";
          },
        );
        if (judged) {
          const data = directionsSchema.parse(judged.output);
          const good = new Set(
            data.directions
              .filter((d) => isAuspiciousStatus(d.status))
              .map((d) => d.direction),
          );
          await invoke(
            "find_auspicious_days",
            {
              birthDate: birth,
              lon: origin.lon,
              from: data.date,
              days: 30,
              maxDaysPerDirection: 3,
            },
            3,
            judged.id,
            (out) => {
              const days = auspiciousDaysSchema.parse(out);
              return days.directions
                .map(
                  (d) =>
                    `${d.label}：${d.bestDays.map((b) => b.date).join("、") || "候補なし"}`,
                )
                .join(" / ");
            },
          );
          async function expand(code: string, depth: number, parentId: number) {
            if (visited.has(code)) return;
            const area = await invoke(
              "area_directions",
              { code, perDirection: 1 },
              depth,
              parentId,
              (out) => {
                const a = areaSchema.parse(out);
                return `${a.origin.name}から見た街：${
                  a.directions
                    .filter((d) => depth > 3 || good.has(d.direction))
                    .flatMap((d) => d.nearest.map((n) => n.name))
                    .join("、") || "候補なし"
                }`;
              },
            );
            if (!area) return;
            visited.add(code);
            const a = areaSchema.parse(area.output);
            const candidates = a.directions
              .filter((d) => depth > 3 || good.has(d.direction))
              .flatMap((d) => d.nearest);
            for (const candidate of candidates)
              await expand(candidate.code, depth + 1, area.id);
            await invoke(
              "prefecture_summary",
              { prefecture: a.origin.code.slice(0, 2), perDirection: 1 },
              depth + 1,
              area.id,
              (out) =>
                `${z.object({ pref: z.string() }).parse(out).pref}の方位別一覧です。`,
            );
          }
          if (good.size) await expand(origin.code, 3, judged.id);
        }
      }
    }
  }
  const suggestions = calculationFollowUps(input, blockSources);
  emit({
    type: "done",
    calls,
    reasons: [...reasons],
    ...(suggestions.length ? { suggestions } : {}),
  });
}
