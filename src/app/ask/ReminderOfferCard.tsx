"use client";

import { useId, useState } from "react";
import {
  REMINDER_TEXT,
  type ReminderOfferCard as Card,
} from "@/lib/reminderText";

type Status = "open" | "sending" | "created" | "declined" | "error";

/**
 * 吉日のお知らせ設定。文面はサーバーが書いた `card` だけ。
 *
 * - 同意のチェックは**最初は外れている**。入れるまで設定ボタンは押せない
 * - 「お知らせを設定する」「今はしない」は同じ見た目
 * - 押したときだけ /api/reminders へ送る（しるべは設定できない）
 */
export function ReminderOfferCard({ card }: { card: Card }) {
  const id = useId();
  const [status, setStatus] = useState<Status>("open");
  const [consent, setConsent] = useState(false);
  const [leadDays, setLeadDays] = useState(card.defaultLeadDays);
  const [error, setError] = useState("");

  if (status === "declined" || status === "created")
    return (
      <p
        className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-relaxed text-slate-700"
        data-reminder-offer={status}
      >
        {status === "created"
          ? REMINDER_TEXT.createdReply
          : REMINDER_TEXT.declinedReply}
      </p>
    );

  const submit = async () => {
    if (!consent) return;
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: card.date,
          direction: card.direction,
          token: card.token,
          leadDays,
          consent: true,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "設定できませんでした。");
      }
      setStatus("created");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "設定できませんでした。",
      );
      setStatus("error");
    }
  };

  const button =
    "min-h-12 flex-1 rounded-xl border border-indigo-300 bg-white px-4 py-3 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50";
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 sm:p-5"
      data-reminder-offer="open"
    >
      <h3
        id={`${id}-title`}
        className="font-serif text-base font-bold text-indigo-950"
      >
        {card.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{card.body}</p>
      <label
        className="mt-3 block text-xs font-semibold text-slate-700"
        htmlFor={`${id}-lead`}
      >
        お知らせする日
      </label>
      <select
        id={`${id}-lead`}
        className="mt-1 min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm"
        value={leadDays}
        onChange={(event) => setLeadDays(Number(event.target.value))}
      >
        {card.leadDays.map((days) => (
          <option key={days} value={days}>
            {days === 1 ? "前日" : `${days}日前`}
          </option>
        ))}
      </select>
      <label className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-slate-800">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          data-reminder-consent
        />
        <span>{card.consentLabel}</span>
      </label>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{card.note}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={button}
          disabled={!consent || status === "sending"}
          onClick={submit}
        >
          {status === "sending" ? "設定しています…" : card.acceptLabel}
        </button>
        <button
          type="button"
          className={button}
          disabled={status === "sending"}
          onClick={() => setStatus("declined")}
        >
          {card.declineLabel}
        </button>
      </div>
    </section>
  );
}
