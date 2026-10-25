import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { createFortuneModel, withinSignal } from "./mcpAgent";
import { fortuneHeadings, type FortuneFact } from "./fortuneHtml";
import { createFortuneReportService } from "./fortuneReport";

export async function generateFortuneHtml(facts: FortuneFact[]) {
  const model = createFortuneModel();
  const signal = AbortSignal.timeout(12000);
  let called = false;
  const result = await withinSignal(
    generateText({
      model,
      abortSignal: signal,
      maxRetries: 0,
      maxOutputTokens: 2200,
      stopWhen: stepCountIs(2),
      prepareStep: ({ stepNumber }) => ({
        toolChoice: stepNumber === 0 ? "required" : "none",
      }),
      tools: {
        registered_fortune: tool({
          description:
            "登録済みプロフィールの公開MCP judge_directions / judge_time_slotsの計算結果を取得する。入力不要。",
          inputSchema: z.object({}).strict(),
          execute: async () => {
            called = true;
            return facts.map((fact, i) => ({
              ...fact,
              placeholder: `{{fact:${i}}}`,
            }));
          },
        }),
      },
      system: `You decorate a Japanese fortune report, not a chat. Call registered_fortune. Return HTML + CSS only, with inline CSS in style elements. CSS animations and transitions are allowed. No scripts, JavaScript, event handlers, URLs, @import, expression() or behavior. It runs in an isolated sandbox with no network, forms, navigation, external assets or embedding. Animate presentation only; never create or change fact text using CSS content. Each fact placeholder must appear exactly once, alone in its text node. Do not write values yourself or split placeholders. Other text is limited to these headings: ${fortuneHeadings.join(", ")}. No other prose or markdown.`,
      prompt:
        "登録済みプロフィールの今日の計算結果を読み、JavaScriptを使わず、HTMLとCSSのみ（CSSアニメーション・トランジション可）の見やすいHTMLに配置してください。",
    }),
    signal,
  );
  if (!called) throw new Error("FORTUNE_TOOL_REQUIRED");
  return result.text;
}

export const getFortuneReport = createFortuneReportService(generateFortuneHtml);
