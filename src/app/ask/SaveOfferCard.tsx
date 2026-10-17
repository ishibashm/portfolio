"use client";

import type { SaveOfferCard as Card, SaveOfferFieldKey } from "@/lib/saveOffer";
import { SAVE_OFFER_TEXT } from "@/lib/saveOffer";

export type SaveOfferStatus = "open" | "accepting" | "declined";

/**
 * しるべの保存の提案。文面はサーバーが書いた `card` だけを出す
 * （モデルの文は入らない）。2 つのボタンは同じ大きさ・同じ見た目にして、
 * どちらかへ誘導しない。
 */
export function SaveOfferCard({
  card,
  status,
  counts,
  onAccept,
  onDecline,
}: {
  card: Card;
  status: SaveOfferStatus;
  counts?: Partial<Record<SaveOfferFieldKey, number>>;
  onAccept: () => void;
  onDecline: () => void;
}) {
  if (status === "declined")
    return (
      <p
        className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-relaxed text-slate-700"
        data-save-offer="declined"
      >
        {SAVE_OFFER_TEXT.declinedReply}
      </p>
    );
  const button =
    "min-h-12 flex-1 rounded-xl border border-indigo-300 bg-white px-4 py-3 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50";
  return (
    <section
      aria-labelledby={`save-offer-${card.conversationKey}`}
      className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 sm:p-5"
      data-save-offer="open"
    >
      <h3
        id={`save-offer-${card.conversationKey}`}
        className="font-serif text-base font-bold text-indigo-950"
      >
        {card.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{card.body}</p>
      <p className="mt-3 text-xs font-semibold text-slate-700">
        保存される内容
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-700">
        {card.fields.map((field) => {
          const count = counts?.[field.key];
          return (
            <li key={field.key}>
              {field.label}
              {typeof count === "number" ? `（${count}件）` : ""}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">{card.note}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={button}
          disabled={status === "accepting"}
          onClick={onAccept}
        >
          {status === "accepting"
            ? "ログイン画面へ移動しています…"
            : card.acceptLabel}
        </button>
        <button
          type="button"
          className={button}
          disabled={status === "accepting"}
          onClick={onDecline}
        >
          {card.declineLabel}
        </button>
      </div>
    </section>
  );
}
