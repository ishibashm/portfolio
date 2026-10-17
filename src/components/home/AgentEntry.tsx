"use client";
import FaqPanel from "@/components/FaqPanel";
import Link from "next/link";
import { coreRouteLabel } from "@/lib/siteStructure";
import { useEffect, useState } from "react";
import GuideCharacter from "@/components/guide/GuideCharacter";
import { SHIRUBE_INVITATIONS } from "@/lib/shirubeInvitations";

export function AgentEntry() {
  const [available, setAvailable] = useState(false);
  const [faq, setFaq] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    const check = () => {
      void fetch("/api/mcp-chain/status", {
        signal: abort.signal,
        cache: "no-store",
      })
        .then((r) => {
          if (!r.ok) throw new Error("status");
          return r.json();
        })
        .then((s) =>
          setAvailable(
            s.enabled === true && !s.paused && s.remaining?.requests !== 0,
          ),
        )
        .catch(() => {
          if (!abort.signal.aborted) setAvailable(false);
        });
    };
    check();
    window.addEventListener("focus", check);
    return () => {
      abort.abort();
      window.removeEventListener("focus", check);
    };
  }, []);
  return (
    <section className="w-full max-w-[1700px] rounded-3xl border border-rose-200 bg-white p-6">
      <h2 className="text-xl font-serif font-bold">
        エージェントに案内してもらう
      </h2>
      <GuideCharacter
        pose="pointing"
        size="md"
        float
        priority="low"
        className="mt-4 max-w-2xl"
      >
        引越しの予定はありますか？気になることを選んでください。
        <span className="mt-1 block text-xs text-slate-500">
          サイトの計算と公開記事にもとづく参考情報です。
        </span>
      </GuideCharacter>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="しるべの案内">
        {SHIRUBE_INVITATIONS.map((item) => (
          <Link
            key={item.id}
            href={available ? `/ask?start=${item.id}` : item.calculationHref}
            prefetch={false}
            className="rounded-xl border border-rose-200 px-4 py-3 text-sm hover:bg-rose-50"
          >
            {item.label}
            {!available && (
              <span className="ml-1 text-xs text-slate-500">（計算のみ）</span>
            )}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={faq}
          onClick={() => setFaq(!faq)}
          className="rounded-xl border px-4 py-3 text-sm"
        >
          よくある質問（AI不要）
        </button>
        <Link
          href="/relocation/arbitrage"
          prefetch={false}
          className="rounded-xl border px-4 py-3 text-sm"
        >
          {coreRouteLabel("/relocation/arbitrage")}（計算のみ）
        </Link>
      </div>
      {faq && (
        <div className="mt-4 rounded-xl bg-stone-50 p-4 text-sm">
          <p className="font-bold">AIを使わずに調べられますか？</p>
          <p className="mt-2">
            はい。本命星の早見表や、日付・方位の計算ページはAIを使わずに確認できます。
          </p>
          <Link href="/houi" className="mt-2 inline-block underline">
            本命星と吉方位の早見表を見る
          </Link>
        </div>
      )}
      {faq && (
        <FaqPanel onQuestion={() => window.location.assign("/ask")} />
      )}
      <Link
        href="/ask"
        prefetch={false}
        className="mt-4 inline-block text-sm underline"
      >
        自由に質問する
      </Link>
    </section>
  );
}
