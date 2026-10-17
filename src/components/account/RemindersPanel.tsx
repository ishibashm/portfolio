"use client";

import * as React from "react";
import { BellRing } from "lucide-react";
import { formatJapaneseDate } from "@/lib/reminderText";
import { DIRECTION_LABELS } from "@/utils/directionGeo";

type Reminder = {
  id: string;
  date: string;
  direction: string | null;
  leadDays: number;
  sendOn: string;
};
type State =
  | { kind: "hidden" }
  | {
      kind: "ready";
      consent: { grantedAt: string } | null;
      reminders: Reminder[];
    };

/**
 * 吉日のお知らせ（メール）の一覧・取り消し・すべて停止。
 *
 * メールの鍵が無い（`enabled: false`）・未ログイン・読み込み失敗のときは
 * 何も出さない。お知らせを使っていない人には欄自体が見えない。
 */
export function RemindersPanel() {
  const [state, setState] = React.useState<State>({ kind: "hidden" });
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const response = await fetch("/api/reminders", { cache: "no-store" });
      if (!response.ok) return setState({ kind: "hidden" });
      const data = (await response.json()) as {
        enabled: boolean;
        consent?: { grantedAt: string } | null;
        reminders?: Reminder[];
      };
      if (!data.enabled) return setState({ kind: "hidden" });
      setState({
        kind: "ready",
        consent: data.consent ?? null,
        reminders: data.reminders ?? [],
      });
    } catch {
      setState({ kind: "hidden" });
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "hidden") return null;
  if (!state.consent && state.reminders.length === 0) return null;

  const remove = async (query: string, done: string) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/reminders?${query}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      setMessage(done);
      await load();
    } catch {
      setMessage("うまくいきませんでした。時間をおいてお試しください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-2xl border border-stone-200 bg-white p-5"
      data-reminders-panel
    >
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <BellRing className="h-4 w-4 text-indigo-500" aria-hidden />
        吉日のお知らせ（メール）
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-stone-600">
        ログインに使っているメールアドレスへ送ります。生年月日はメールに書きません。
      </p>
      {state.reminders.length > 0 ? (
        <ul className="mt-3 divide-y divide-stone-100 text-sm">
          {state.reminders.map((reminder) => (
            <li
              key={reminder.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span>
                {formatJapaneseDate(reminder.date)}
                {reminder.direction
                  ? `・${DIRECTION_LABELS[reminder.direction as keyof typeof DIRECTION_LABELS] ?? reminder.direction}`
                  : ""}
                <span className="ml-2 text-xs text-stone-500">
                  {reminder.leadDays === 1
                    ? "前日"
                    : `${reminder.leadDays}日前`}
                  にお知らせ
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                className="min-h-10 rounded-lg border border-stone-300 px-3 text-xs hover:bg-stone-50 disabled:opacity-50"
                onClick={() =>
                  remove(
                    `id=${encodeURIComponent(reminder.id)}`,
                    "お知らせを取り消しました。",
                  )
                }
              >
                取り消す
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-stone-600">
          設定中のお知らせはありません。
        </p>
      )}
      {state.consent && (
        <button
          type="button"
          disabled={busy}
          className="mt-4 min-h-10 rounded-lg border border-stone-300 px-3 text-xs hover:bg-stone-50 disabled:opacity-50"
          onClick={() =>
            remove(
              "all=1",
              "メールのお知らせを止めました。設定中のお知らせも取り消しました。",
            )
          }
        >
          メールのお知らせをすべて止める
        </button>
      )}
      {message && (
        <p role="status" className="mt-3 text-xs text-stone-700">
          {message}
        </p>
      )}
    </section>
  );
}
