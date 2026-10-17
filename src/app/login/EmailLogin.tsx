"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { EMAIL_LOGIN_TEXT, looksLikeEmail } from "@/lib/authMethods";

/**
 * メールアドレスでのログイン（マジックリンク）。サーバーが有効と
 * 答えたときだけ出す。届いたリンクは /auth/callback に戻り、Google と
 * 同じ道で `next` へ進む。
 */
export function EmailLogin({ next }: { next: string }) {
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/methods", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { email?: boolean } | null) => {
        if (alive) setEnabled(data?.email === true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!enabled) return null;
  if (status === "sent")
    return (
      <p
        role="status"
        className="mt-4 w-full rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800"
      >
        {EMAIL_LOGIN_TEXT.sent}
      </p>
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!looksLikeEmail(value)) return setError(EMAIL_LOGIN_TEXT.invalid);
    setStatus("sending");
    setError("");
    const { error: authError } = await createClient().auth.signInWithOtp({
      email: value,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (authError) {
      setError("リンクを送れませんでした。時間をおいてお試しください。");
      setStatus("idle");
      return;
    }
    setStatus("sent");
  };

  return (
    <form onSubmit={submit} className="mt-4 w-full" data-email-login>
      <div className="mb-3 flex items-center gap-3 text-[11px] text-stone-400">
        <span className="h-px flex-1 bg-stone-200" />
        または
        <span className="h-px flex-1 bg-stone-200" />
      </div>
      <label
        htmlFor="login-email"
        className="block text-xs font-medium text-stone-600"
      >
        {EMAIL_LOGIN_TEXT.label}
      </label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm"
      />
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-2 min-h-11 w-full rounded-xl border border-stone-200 bg-white px-6 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-50"
      >
        {status === "sending" ? "送っています…" : EMAIL_LOGIN_TEXT.submit}
      </button>
    </form>
  );
}
