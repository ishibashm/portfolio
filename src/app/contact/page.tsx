"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * お問い合わせフォーム。
 *
 * 運営者の個人メールアドレスを公開せずに連絡手段を用意する。
 * 送信内容は DB に保存するだけで、外部サービスには渡していない。
 */
export default function ContactPage() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          body: form.get("body"),
          website: form.get("website"),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(json?.error ?? "送信に失敗しました。");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setMessage("通信に失敗しました。時間をおいてお試しください。");
    }
  }

  const field =
    "w-full px-4 py-3 rounded-xl border border-theme-border bg-theme-surface text-sm outline-none focus:border-accent";

  return (
    <div className="min-h-screen bg-background text-ink font-sans">
      {/* 幅は全画面で 1700px に揃える（/guide/[slug] と同じ理由）。 */}
      <div className="max-w-[1700px] mx-auto px-5 py-12">
        <h1 className="text-3xl font-bold font-serif tracking-tight">
          お問い合わせ
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink">
          判定内容の誤り、物件データの不備、掲載の停止依頼などをお寄せください。いただいた内容は運営者のみが確認します。
        </p>

        {state === "done" ? (
          <div className="mt-8 rounded-2xl border border-theme-border bg-theme-accent-soft p-6">
            <h2 className="text-sm font-bold text-accent">送信しました</h2>
            <p className="mt-2 text-xs text-accent leading-relaxed">
              内容を確認のうえ、必要に応じてご記入のメールアドレス宛にご連絡します。
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex text-xs font-bold text-accent hover:underline"
            >
              ホームに戻る
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="name"
                className="text-xs font-bold text-ink-muted block mb-1.5"
              >
                お名前
              </label>
              <input
                id="name"
                name="name"
                required
                maxLength={100}
                className={field}
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="text-xs font-bold text-ink-muted block mb-1.5"
              >
                メールアドレス
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                maxLength={200}
                className={field}
              />
            </div>
            <div>
              <label
                htmlFor="body"
                className="text-xs font-bold text-ink-muted block mb-1.5"
              >
                お問い合わせ内容
              </label>
              <textarea
                id="body"
                name="body"
                required
                maxLength={4000}
                rows={8}
                className={field}
              />
            </div>

            {/* ボット除け。人間には見えないので、値が入っていれば自動投稿と判断する */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <p className="text-xs text-ink-muted leading-relaxed">
              送信することで
              <Link href="/privacy" className="underline hover:text-accent">
                プライバシーポリシー
              </Link>
              に同意したものとみなします。
            </p>

            {state === "error" && (
              <p className="text-xs text-accent font-semibold">{message}</p>
            )}

            <button
              type="submit"
              disabled={state === "sending"}
              className="px-6 py-3 rounded-full bg-accent hover:brightness-110 disabled:opacity-50 text-on-accent font-bold text-sm transition-colors"
            >
              {state === "sending" ? "送信中..." : "送信する"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
