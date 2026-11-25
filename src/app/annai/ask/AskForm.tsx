"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FreeAnswerResult } from "@/lib/guide/guideFreeform";
import { askAction } from "./actions";

type AskFormProps = {
  initialState: FreeAnswerResult;
};

export default function AskForm({ initialState }: AskFormProps) {
  const [state, formAction, isPending] = useActionState(
    askAction,
    initialState,
  );

  const hasResult =
    state.question.length > 0 ||
    state.sentences.length > 0 ||
    state.links.length > 0 ||
    state.trace.length > 0;

  const isErrorNotice =
    state.status === "disabled" ||
    state.status === "limited" ||
    state.status === "busy" ||
    state.status === "invalid_input" ||
    state.status === "pii" ||
    state.status === "expired" ||
    state.status === "full" ||
    state.status === "failed";

  return (
    <div className="mt-8 space-y-6">
      {/* 状態・お知らせ枠 */}
      {state.message && (
        <section
          role="status"
          aria-live="polite"
          className={
            isErrorNotice
              ? "rounded-2xl border border-theme-border bg-theme-gold-soft p-5 text-sm text-ink space-y-2"
              : "rounded-2xl border border-theme-border bg-theme-surface p-4 text-sm text-ink"
          }
        >
          <p className={isErrorNotice ? "font-semibold" : ""}>
            {state.message}
          </p>
          {(state.status === "disabled" ||
            state.status === "limited" ||
            state.status === "busy" ||
            state.status === "failed") && (
            <p>
              <Link
                href="/annai"
                className="font-bold text-accent underline hover:text-ink"
              >
                定型の案内（/annai）へ進む
              </Link>
            </p>
          )}
        </section>
      )}

      {/* 回答のカード（1回の送信につき1枚のみ表示。吹き出し形式にはしない） */}
      {hasResult && (
        <section
          aria-labelledby="free-answer-heading"
          className="rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-sm space-y-5"
        >
          {state.question && (
            <div className="border-b border-theme-border pb-4">
              <h2
                id="free-answer-heading"
                className="text-xs font-bold text-ink-muted"
              >
                あなたの質問
              </h2>
              <p className="mt-1 text-base font-bold font-serif text-ink">
                {state.question}
              </p>
            </div>
          )}

          {state.sentences.length > 0 && (
            <div className="space-y-2 text-sm leading-relaxed text-ink max-w-[70ch]">
              {state.sentences.map((sentence, idx) => (
                <p key={idx}>{sentence}</p>
              ))}
            </div>
          )}

          {state.links.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold text-ink-muted">
                根拠にした記事
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {state.links.map((link) => (
                  <li
                    key={link.url}
                    className="rounded-xl border border-theme-border bg-theme-subtle p-3"
                  >
                    <a
                      href={link.url}
                      className="text-sm font-bold text-accent underline hover:text-ink"
                    >
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.trace.length > 0 && (
            <details className="rounded-xl border border-theme-border bg-theme-subtle p-4 text-xs">
              <summary className="cursor-pointer font-bold text-ink">
                呼び出しの記録（{state.trace.length}回）
              </summary>
              <ol className="mt-3 space-y-2">
                {state.trace.map((item, idx) => (
                  <li
                    key={`${item.kind}-${item.name}-${idx}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-3 py-2"
                  >
                    <span className="rounded bg-theme-subtle px-1.5 py-0.5 font-mono text-ink-muted">
                      {item.kind === "tool" ? "道具" : "モデル"}
                    </span>
                    <span className="font-semibold text-ink">{item.name}</span>
                    <span
                      className={
                        item.ok
                          ? "rounded bg-theme-accent-soft px-1.5 py-0.5 font-bold text-accent"
                          : "rounded bg-theme-gold-soft px-1.5 py-0.5 font-bold text-theme-gold"
                      }
                    >
                      {item.ok ? "成功" : "失敗"}
                    </span>
                    <span className="text-ink-muted">{item.ms}ms</span>
                    {typeof item.neurons === "number" && (
                      <span className="text-ink-muted">
                        {item.neurons.toFixed(2)} neurons
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}

      {/* 問数カウンタ */}
      <div className="flex items-center justify-between text-xs font-semibold text-ink-muted">
        <span>
          会話の進行: {state.turn} / {state.maxTurns} 問目
        </span>
      </div>

      {/* 質問フォーム（JS無効でもServer Actionでそのまま送信可能） */}
      <section
        aria-labelledby="ask-form-heading"
        className="rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-sm space-y-4"
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="s" value={state.session ?? ""} />
          <input type="hidden" name="ft" value={state.formToken ?? ""} />

          {/* ボット検知用ハニーポット */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
          >
            <label htmlFor="annai-ask-website">Website</label>
            <input
              id="annai-ask-website"
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </div>

          <div>
            <label
              id="ask-form-heading"
              htmlFor="annai-ask-q"
              className="block text-sm font-bold text-ink"
            >
              質問を入力してください（200字以内）
            </label>
            <textarea
              id="annai-ask-q"
              name="q"
              rows={3}
              maxLength={200}
              required
              disabled={isPending || state.status === "full"}
              placeholder="例: 五黄殺と暗剣殺の違いは何ですか？"
              className="mt-2 w-full max-w-2xl rounded-xl border border-theme-border bg-theme-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-accent"
            />
          </div>

          <div className="space-y-1 text-xs leading-relaxed text-ink-muted max-w-[70ch]">
            <p className="font-semibold text-ink">
              個人情報（氏名・住所・電話番号・メールアドレス・生年月日）は入力しないでください。
            </p>
            <p>
              入力した質問、直近のやり取り、記事検索の結果の一部は、回答を作るため
              Cloudflare Workers AI（米国）へ送信します。詳しくは
              <Link
                href="/privacy"
                className="mx-1 font-semibold text-accent underline hover:text-ink"
              >
                プライバシーポリシー
              </Link>
              をご確認ください。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              type="submit"
              name="op"
              value="ask"
              disabled={isPending || state.status === "full"}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-on-accent hover:brightness-110 disabled:opacity-50"
            >
              {isPending ? "調べています…" : "質問する"}
            </button>
            <Link
              href="/annai"
              className="text-sm text-ink-muted underline hover:text-ink"
            >
              定型の案内へ戻る
            </Link>
          </div>
        </form>

        {/* 会話を終える（別フォームにして textarea の required に邪魔されないようにする） */}
        <form
          action={formAction}
          className="border-t border-theme-border pt-4 flex items-center justify-between"
        >
          <span className="text-xs text-ink-muted">
            会話の流れはこのページの中にだけ暗号化して保持しています。
          </span>
          <button
            type="submit"
            name="op"
            value="end"
            disabled={isPending}
            className="rounded-xl border border-theme-border bg-theme-subtle px-4 py-2 text-xs font-semibold text-ink hover:border-accent hover:text-accent"
          >
            会話を終える
          </button>
        </form>
      </section>
    </div>
  );
}
