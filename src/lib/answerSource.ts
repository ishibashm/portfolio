export type AnswerSource = "calc" | "site" | "general";
export const ANSWER_SOURCE_LABELS: Record<AnswerSource, string> = {
  calc: "🧮 計算結果",
  site: "📑 サイトの資料より",
  general: "💬 サイト外の回答（一般知識・最新情報は未確認）",
};
export function answerSource(
  sources: Iterable<{ tool: string; output: unknown }>,
): AnswerSource {
  let site = false;
  for (const { tool, output } of sources) {
    if (!output || typeof output !== "object" || "error" in output) continue;
    if (tool === "search_articles") {
      if (
        "articles" in output &&
        Array.isArray(output.articles) &&
        output.articles.length
      )
        site = true;
    } else if (tool === "get_article") {
      if ("found" in output && output.found === true) site = true;
    } else return "calc";
  }
  return site ? "site" : "general";
}
