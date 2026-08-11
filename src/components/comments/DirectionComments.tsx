"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { toUserMessage } from "@/lib/errorMessage";
import { COMMENT_MAX_LENGTH, COMMENT_MIN_LENGTH } from "@/lib/comments";

/**
 * 方位・日取りについての投稿欄。
 *
 * 記事ページは計算結果が中心で、ページ間の差が数値だけになりやすい。
 * 「実際にその方位へ引越してどうだったか」は計算では作れず、同じ方位でも
 * 人によって違うので、ページ固有の中身になる。
 *
 * 投稿が 0 件のときは見出しごと出さない。600 ページ以上に空の欄が並ぶと、
 * 未完成のサイトに見える（AdSense の審査で不利に働く点でもある）。
 * 投稿するための入口だけを控えめに残す。
 */

interface CommentRow {
  id: string;
  displayName: string;
  body: string;
  createdAt: string;
}

export function DirectionComments({
  topicKey,
  heading = "この方位についての投稿",
  prompt,
}: {
  topicKey: string;
  heading?: string;
  /** 何を書けばよいかの手掛かり。ページごとに変える。 */
  prompt?: string;
}) {
  const [rows, setRows] = useState<CommentRow[] | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/comments?topicKey=${encodeURIComponent(topicKey)}`,
      );
      const json = await res.json();
      setRows(json.success ? json.data : []);
    } catch {
      // 読み込めなくても記事本体は成立する。欄ごと出さない。
      setRows([]);
    }
  }, [topicKey]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (alive) setSignedIn(!!data.user);
      })
      .catch(() => {
        if (alive) setSignedIn(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicKey, body }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "投稿できませんでした。");
        return;
      }
      setBody("");
      setOpen(false);
      setRows((prev) => [json.data, ...(prev ?? [])]);
    } catch (err) {
      setError(toUserMessage(err, "投稿できませんでした。"));
    } finally {
      setSending(false);
    }
  }

  const count = rows?.length ?? 0;
  const trimmed = body.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < COMMENT_MIN_LENGTH;
  const tooLong = trimmed.length > COMMENT_MAX_LENGTH;

  return (
    <section className="mt-10 border-t border-stone-200 pt-6">
      {count > 0 && (
        <>
          <h2 className="text-base font-bold text-stone-800">
            {heading}
            <span className="ml-2 text-xs font-normal text-stone-500">
              {count}件
            </span>
          </h2>
          <ul className="mt-4 space-y-4">
            {rows!.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl border border-stone-200 bg-white/70 p-4"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-stone-700">
                    {c.displayName}
                  </span>
                  <time
                    className="text-[11px] text-stone-400"
                    dateTime={c.createdAt}
                  >
                    {new Date(c.createdAt).toLocaleDateString("ja-JP")}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {!open && (
        <div className={count > 0 ? "mt-6" : ""}>
          {signedIn === false ? (
            <Link
              href="/login"
              className="inline-block rounded-full border border-stone-300 px-4 py-2 text-xs text-stone-600 transition hover:bg-stone-100"
            >
              ログインして体験を書く
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full border border-stone-300 px-4 py-2 text-xs text-stone-600 transition hover:bg-stone-100"
            >
              この方位の体験を書く
            </button>
          )}
          {prompt && (
            <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
              {prompt}
            </p>
          )}
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={COMMENT_MAX_LENGTH + 100}
            placeholder={
              prompt ??
              "いつ、どこからどこへ移って、その後どうだったかを書いてください。"
            }
            className="w-full rounded-2xl border border-stone-300 p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] ${tooLong ? "text-rose-600" : "text-stone-400"}`}
            >
              {trimmed.length} / {COMMENT_MAX_LENGTH}
              {tooShort && `（${COMMENT_MIN_LENGTH}文字以上）`}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-4 py-2 text-xs text-stone-500"
              >
                やめる
              </button>
              <button
                type="submit"
                disabled={
                  sending || trimmed.length < COMMENT_MIN_LENGTH || tooLong
                }
                className="rounded-full bg-stone-800 px-5 py-2 text-xs text-white transition disabled:opacity-40"
              >
                {sending ? "送信中…" : "投稿する"}
              </button>
            </div>
          </div>
          {error && (
            <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
