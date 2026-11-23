import type { Metadata } from "next";
import Link from "next/link";
import { pageOpenGraph } from "@/lib/siteUrl";
import { McpExplorer } from "./McpExplorer";
import { GuideAvatar } from "@/components/guide/GuideCharacter";

import { voiceState } from "@/lib/mcpVoiceConfig";
import { chainLlmState } from "@/lib/mcpAgentConfig";
import { paidApisDisabled } from "@/lib/paidApis";

export const dynamic = "force-dynamic";
/*
  2026-11-15: トップとサイドバーの「しるべに案内してもらう」は /annai へ移した。
  ここはAIと会話する入口なので名前を分け、AIが止まっているときは会話を約束しない。
*/
const PAGE_NAME = "しるべと会話で相談する";
export const metadata: Metadata = {
  title: `${PAGE_NAME}｜方位と引越しの相談`,
  description:
    "初代案内役しるべと会話しながら、方位・日取り・街の候補と計算の過程を確かめる補助ツールです。",
  alternates: { canonical: "/ask" },
  robots: { index: false, follow: true },
  openGraph: pageOpenGraph(
    "/ask",
    PAGE_NAME,
    "初代案内役しるべと、方位・日取り・街の候補と計算の過程を確かめます。",
  ),
};
export default function Page() {
  const state = chainLlmState();
  const paidPaused = paidApisDisabled();
  const aiOn = state.enabled && !paidPaused;
  return (
    <main className="min-h-screen bg-background text-ink">
      <article className="mx-auto max-w-[1700px] px-5 py-12">
        <nav aria-label="パンくず" className="mb-4 text-sm text-ink-muted">
          <Link href="/">ホーム</Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{PAGE_NAME}</span>
        </nav>
        <Link href="/houi" className="text-sm text-accent underline">
          本命星と吉方位の早見表へ
        </Link>
        <h1 className="mt-5 text-2xl font-bold font-serif sm:text-3xl">
          {PAGE_NAME}
        </h1>
        {aiOn ? (
          <p className="mt-4 text-sm leading-relaxed">
            初代案内役「しるべ」が、相談する人の登録から方位・日取り・街の候補まで会話でご案内します。回答ごとに、根拠になった道具の入力・結果も確かめられます。
          </p>
        ) : (
          /* サーバーで描くので、JSが動かない環境でもこの案内と /annai への道は出る。 */
          <section
            aria-label="AI回答の停止"
            className="mt-4 flex items-start gap-3 rounded-2xl border border-theme-border bg-theme-gold-soft p-4 text-sm leading-relaxed sm:gap-4"
          >
            {/* 文で状態を伝えるので、イラストは読み上げない（装飾）。 */}
            <GuideAvatar pose="magnifier" size="sm" decorative />
            <div className="min-w-0 flex-1">
              <p>
                AIとの会話は、いまは停止しています。質問を選ぶと、しるべが計算道具の結果をもとにご案内する「案内役に聞く」をご利用ください（JavaScriptなしでも動きます）。
              </p>
              <Link
                href="/annai"
                className="mt-3 inline-block rounded-xl border border-theme-border px-4 py-2 font-semibold text-accent hover:border-accent hover:bg-theme-accent-soft"
              >
                案内役に聞く
              </Link>
              <p className="mt-3 text-ink-muted">
                結果は、ご自分のAIに渡して続きを相談できます。
                <Link href="/mcp" className="ml-1 text-accent underline">
                  自分のAIからつなぐ
                </Link>
              </p>
            </div>
          </section>
        )}
        <p className="mt-3 text-sm leading-relaxed">
          {aiOn
            ? "AIが必要な道具を選び、結果を使って次の計算へ進みます。最大8ステップ・20回、1回8秒・全体60秒で打ち切ります。"
            : "計算の連鎖は深さ3・最大4、20回までです。1回8秒・全体30秒で打ち切ります。街から先の展開は地理の参考です。"}
        </p>
        {aiOn && (
          <p className="mt-3 text-sm leading-relaxed text-ink">
            フォームで聞く（JSなし）:{" "}
            <Link href="/annai" className="font-semibold text-accent underline">
              案内役に聞く
            </Link>
          </p>
        )}
        <McpExplorer
          voiceEnabled={voiceState().enabled}
          agentEnabled={state.enabled}
          mock={state.mock}
          persistConversation
          paidApisPaused={paidPaused}
        />
        <p className="mt-8 text-sm text-ink-muted">
          吉凶は九星気学の考え方による参考情報です。契約・費用・通勤など、現実の条件と合わせて検討してください。
        </p>
      </article>
    </main>
  );
}
