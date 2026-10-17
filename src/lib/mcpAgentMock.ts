import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { z } from "zod";
import { formatFollowUpEnvelope } from "./followUpSuggestions";

/** ローカル確認専用。質問の解析はせず、画面に明示した固定例を計算する。 */
export function createAgentMock() {
  return new MockLanguageModelV3({
    doStream: async ({ prompt, tools }) => {
      const allResults = prompt
        .flatMap((m) => (m.role === "tool" ? m.content : []))
        .filter((p) => p.type === "tool-result");
      // 保存の提案は計算ではないので、手順の数には入れない。
      const results = allResults.filter((r) => r.toolName !== "propose_save");
      const offerSave =
        results.length >= 4 &&
        Boolean(tools?.some((t) => t.name === "propose_save")) &&
        !allResults.some((r) => r.toolName === "propose_save");
      const read = (name: string) => {
        const result = results.find((r) => r.toolName === name)?.output;
        if (result?.type === "text") {
          try {
            return JSON.parse(
              result.value
                .replace(/^BEGIN_UNTRUSTED_TOOL_DATA\n/, "")
                .replace(/\nEND_UNTRUSTED_TOOL_DATA$/, ""),
            );
          } catch {
            return undefined;
          }
        }
        return result?.type === "json" ? result.value : undefined;
      };
      let name = "search_municipality";
      let input: Record<string, unknown> = { query: "深谷市", limit: 3 };
      if (results.length === 1) {
        name = "get_honmei_star";
        input = { birthDate: "1990-05-05" };
      } else if (results.length >= 2) {
        const origin = z
          .object({ results: z.array(z.object({ lon: z.number() })).min(1) })
          .parse(read("search_municipality")).results[0];
        const birth = z
          .object({ birthDate: z.string(), honmeiStar: z.number() })
          .parse(read("get_honmei_star"));
        name =
          results.length === 2 ? "judge_directions" : "find_auspicious_days";
        input =
          results.length === 2
            ? {
                birthDate: birth.birthDate,
                lon: origin.lon,
                date: "2026-11-01",
              }
            : {
                birthDate: birth.birthDate,
                lon: origin.lon,
                from: z
                  .object({ date: z.string() })
                  .parse(read("judge_directions")).date,
                days: 30,
                maxDaysPerDirection: 3,
              };
      }
      const parts: LanguageModelV3StreamPart[] = [
        { type: "stream-start", warnings: [] },
      ];
      if (offerSave) {
        parts.push({
          type: "tool-call",
          toolCallId: "mock-save",
          toolName: "propose_save",
          input: JSON.stringify({
            reason: "save_result",
            resultCallIds: results
              .filter((r) => r.toolName === "find_auspicious_days")
              .map((r) => r.toolCallId),
          }),
        });
      } else if (results.length < 4) {
        parts.push({
          type: "tool-call",
          toolCallId: `mock-${results.length}`,
          toolName: name,
          input: JSON.stringify(input),
        });
        if (results.length === 0)
          parts.push({
            type: "tool-call",
            toolCallId: "mock-birth",
            toolName: "get_honmei_star",
            input: JSON.stringify({ birthDate: "1990-05-05" }),
          });
      } else {
        const days = z
          .object({
            directions: z.array(
              z.object({
                label: z.string(),
                bestDays: z.array(z.object({ date: z.string() })),
              }),
            ),
          })
          .parse(read("find_auspicious_days"));
        const summary = days.directions
          .map(
            (d) =>
              `${d.label}：${d.bestDays.map((b) => b.date).join("、") || "候補なし"}`,
          )
          .join("\n");
        parts.push(
          { type: "text-start", id: "answer" },
          {
            type: "text-delta",
            id: "answer",
            delta:
              `開発用の固定例（1990年5月5日生まれ・深谷市・2026年11月）を計算しました。\n${summary}\n九星気学は参考情報です。契約や通勤などの条件と合わせて検討してください。` +
              formatFollowUpEnvelope([
                "候補日の通勤条件も比べる？",
                "家族の本命星でも日取りを確認する？",
                "吉方位にある街をさらに絞る？",
              ]),
          },
          { type: "text-end", id: "answer" },
        );
      }
      parts.push({
        type: "finish",
        finishReason: {
          unified: results.length < 4 || offerSave ? "tool-calls" : "stop",
          raw: undefined,
        },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 0, text: 0, reasoning: 0 },
        },
      });
      return {
        stream: new ReadableStream({
          start(c) {
            for (const part of parts) c.enqueue(part);
            c.close();
          },
        }),
      };
    },
  });
}
