"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

// 操作するまではモジュールを描画せず、チャットのJSも取得しない。
const Chat = dynamic(() => import("./HomeAgentChat"), {
  ssr: false,
  loading: () => <p role="status">質問の画面を準備しています…</p>,
});
export function AgentEntry() {
  const [opened, setOpened] = useState(false);
  const [question, setQuestion] = useState("");
  return (
    <section className="w-full max-w-[1700px] rounded-3xl border border-rose-200 bg-white p-6">
      <h2 className="text-xl font-serif font-bold">AIに聞く</h2>
      <p className="mt-2 text-sm">
        公開記事と計算の道具から、疑問を一つずつ確かめます。
      </p>
      {opened ? (
        <Chat initialQuestion={question} />
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setOpened(true);
          }}
        >
          <label className="block text-sm">
            質問
            <input
              aria-label="質問"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              className="mt-2 w-full rounded-lg border p-3"
              placeholder="例：引越しの日取りの考え方を知りたい"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              "引越しの日取りの記事を教えて",
              "本命星はどう調べる？",
              "名古屋市中区から東にある街は？",
            ].map((q) => (
              <button
                type="button"
                key={q}
                onClick={() => setQuestion(q)}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                {q}
              </button>
            ))}
          </div>
          <button className="rounded-lg bg-slate-800 px-5 py-3 text-sm text-white">
            質問の画面を開く
          </button>
        </form>
      )}
      <Link
        href="/ask"
        prefetch={false}
        className="mt-4 inline-block text-sm underline"
      >
        詳しく見る
      </Link>
    </section>
  );
}
