import {
  extractAgentInput,
  needsAgentBirth,
  needsAgentOrigin,
} from "./agentInput";
import { AnswerCache } from "./answerCache";
import { searchIndex } from "./articleIndex";
import { extractFaq } from "./articleFaq";
import { headingId, extractHeadings } from "./blogToc";
import type { AgentEvent, AgentConversationContext } from "./mcpAgent";
const cache = new AnswerCache<AgentEvent[]>();
const normalize = (text: string) =>
  text.normalize("NFKC").replace(/[\s?？]/g, "");
/** Fail closed for personal/date/place questions and all contextual conversations. */
export function canRoutePublicQuestion(
  question: string,
  context: AgentConversationContext,
) {
  const extracted = extractAgentInput(question.normalize("NFKC"));
  return (
    !extracted.year &&
    !extracted.municipality &&
    !needsAgentBirth(question) &&
    !needsAgentOrigin(question) &&
    !context.profile &&
    !context.people?.length &&
    !context.memories?.length &&
    !context.history?.length &&
    !/[\d０-９@]|私|自分|家族|家内|夫|妻|子供|生まれ|誕生|住所|住ん|市|区|町|村|都|府|県|北海道|今年|来年|今日|明日|来月|今月|いつ|どっち|どちら|どこ|大丈夫|いいですか|計算|判定して/.test(
      question,
    ) &&
    /とは|違い|記事|考え方|仕組み|ですか|[?？]/.test(question)
  );
}
export async function routePublicAnswer(
  question: string,
  context: AgentConversationContext,
  model: string,
): Promise<AgentEvent[] | undefined> {
  if (!canRoutePublicQuestion(question, context)) return;
  const { loadSearchableBlogPosts } = await import("./blogStore");
  const posts = (await loadSearchableBlogPosts({ quiet: true })).filter(
    (post) => !post.draft,
  );
  const result = searchIndex(posts, question, 3);
  // Only a question already present in public material may be cached. A hash alone
  // does not make arbitrary user text safe to cache.
  const faq = posts
    .flatMap((post) =>
      extractFaq(post.body, post.title).map((pair) => ({ ...pair, post })),
    )
    .find((pair) => normalize(pair.question) === normalize(question));
  const canonical =
    faq?.question ??
    posts.find((post) => normalize(post.title) === normalize(question))?.title;
  const key = canonical
    ? cache.key(canonical, model, result.version)
    : undefined;
  const hit = key ? cache.get(key) : undefined;
  if (hit) return hit;
  const best = result.articles[0];
  if (!faq && (!best || best.score < 8)) return;
  const text = faq ? faq.answer : best.snippet;
  const title = faq ? faq.post.title : best.title;
  const section = faq
    ? faq.question === faq.post.title
      ? "先に結論"
      : faq.question
    : best.section;
  const url = faq
    ? `https://cloud-palette.com/blog/${faq.post.slug}`
    : best.url;
  const sourcePost = faq?.post ?? posts.find((post) => post.slug === best.slug);
  const hasAnchor =
    sourcePost &&
    extractHeadings(sourcePost.body).some(
      (heading) => heading.text === section,
    );
  const citation = `${url}${section && hasAnchor ? `#${encodeURIComponent(headingId(section))}` : ""}`;
  const events: AgentEvent[] = [
    {
      type: "text-delta",
      text: `資料の抜粋：\n\n${text}\n\n出典：[${title}「${section}」](${citation})\n\n個人の暦・方位は道具で計算してください。九星気学は参考情報です。`,
    },
    { type: "done", source: "site", calls: 0, reasons: [] },
  ];
  if (key) cache.set(key, events);
  return events;
}
