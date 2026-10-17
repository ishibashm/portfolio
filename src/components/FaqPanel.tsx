"use client";
import { useState } from "react";
import { availableFaq, faqData, FAQ_TOOL_QUESTIONS } from "@/lib/faq";
import { sanitizeFollowUpSuggestions } from "@/lib/followUpSuggestions";

export default function FaqPanel({
  onQuestion,
}: {
  onQuestion: (question: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [trivia, setTrivia] = useState<number>();
  const items = availableFaq();
  const answer = items.find((item) => item.id === selected);
  const fact = trivia === undefined ? undefined : faqData.trivia[trivia];
  const suggestions = [
    ...sanitizeFollowUpSuggestions(
      faqData.suggestedQuestions.items.slice(0, 4),
    ),
    ...sanitizeFollowUpSuggestions(faqData.suggestedQuestions.items.slice(4)),
  ];
  const related = answer
    ? items
        .filter(
          (item) => item.chapter === answer.chapter && item.id !== answer.id,
        )
        .slice(0, 2)
    : [];
  const validRelated = sanitizeFollowUpSuggestions([
    ...related.map((item) => item.question),
    ...suggestions,
  ]);
  return (
    <section className="mt-4 space-y-3" aria-label="よくある質問と豆知識">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-2"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          よくある質問
        </button>
        <button
          type="button"
          className="rounded-lg border px-3 py-2"
          onClick={() => {
            setTrivia(Math.floor(Math.random() * faqData.trivia.length));
            setSelected(undefined);
          }}
        >
          🎲 豆知識
        </button>
      </div>
      {open &&
        [...new Set(items.map((item) => item.chapter))].map((chapter) => (
          <fieldset key={chapter} className="space-y-2">
            <legend className="text-sm font-bold">{chapter}</legend>
            {items
              .filter((item) => item.chapter === chapter)
              .slice(0, 5)
              .map((item) => (
                <button
                  type="button"
                  className="mr-2 rounded-lg border px-3 py-2 text-sm"
                  key={item.id}
                  onClick={() => {
                    setSelected(item.id);
                    setTrivia(undefined);
                  }}
                >
                  {item.question}
                </button>
              ))}
          </fieldset>
        ))}
      <div aria-live="polite">
        {(answer || fact) && (
          <article className="space-y-2 rounded-xl border bg-white p-4">
            <p className="text-sm font-bold">📑 サイトの資料より</p>
            {answer && <h3 className="font-bold">{answer.question}</h3>}
            <p>{answer?.answer ?? fact?.text}</p>
            {answer?.asOf && (
              <p className="text-xs">
                {answer.asOf}年の記述です。個人の判定は道具で確認してください。
              </p>
            )}
            {answer?.sources.map((source) => (
              <a
                className="mr-3 inline-block text-sm underline"
                key={source.url}
                href={source.url}
              >
                出典：{source.slug}「{source.section}」
              </a>
            ))}
            {fact && (
              <a className="text-sm underline" href={`/blog/${fact.source}`}>
                出典記事を読む
              </a>
            )}
            <p className="text-xs">九星気学は参考情報です。</p>
            {answer && (
              <div className="flex flex-wrap gap-2">
                {answer.relatedTools.map((tool) => (
                  <button
                    type="button"
                    className="rounded-lg border p-2 text-sm"
                    key={tool}
                    onClick={() => onQuestion(FAQ_TOOL_QUESTIONS[tool])}
                  >
                    {FAQ_TOOL_QUESTIONS[tool]}
                  </button>
                ))}
                {related
                  .filter((item) => validRelated.includes(item.question))
                  .map((item) => (
                    <button
                      type="button"
                      className="rounded-lg border p-2 text-sm"
                      key={item.id}
                      onClick={() => setSelected(item.id)}
                    >
                      {item.question}
                    </button>
                  ))}
              </div>
            )}
          </article>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((question) => (
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm"
            key={question}
            onClick={() => onQuestion(question)}
          >
            {question}
          </button>
        ))}
      </div>
    </section>
  );
}
