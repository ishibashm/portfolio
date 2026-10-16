import type { Metadata } from "next";
import Link from "next/link";
import { pageOpenGraph } from "@/lib/siteUrl";
import { McpExplorer } from "./McpExplorer";

import { voiceState } from "@/lib/mcpVoiceConfig";
import { chainLlmState } from "@/lib/mcpAgentConfig";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "MCPで方位と街をたどる",
  description:
    "Cloud Paletteの公開MCPを順番に呼び出し、方位・日取り・街の候補と計算の過程を確かめる補助ツールです。",
  alternates: { canonical: "/houi/mcp-explorer" },
  robots: { index: false, follow: true },
  openGraph: pageOpenGraph(
    "/houi/mcp-explorer",
    "MCPで方位と街をたどる",
    "公開MCPで方位・日取り・街の候補と計算の過程を確かめます。",
  ),
};
export default function Page() {
  const state = chainLlmState();
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900">
      <article className="mx-auto max-w-5xl px-5 py-12">
        <Link href="/houi" className="text-sm underline text-slate-600">
          本命星と吉方位の早見表へ
        </Link>
        <h1 className="mt-5 text-3xl font-bold font-serif">
          MCPで方位と街をたどる
        </h1>
        <p className="mt-4 text-sm leading-relaxed">
          質問から方位・日取り・街の候補を調べます。回答と、その根拠になった道具の入力・結果を確かめられます。
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          {state.enabled
            ? "AIが必要な道具を選び、結果を使って次の計算へ進みます。最大8ステップ・20回、1回8秒・全体60秒で打ち切ります。"
            : "計算の連鎖は深さ3・最大4、20回までです。1回8秒・全体30秒で打ち切ります。街から先の展開は地理の参考です。"}
        </p>
        <McpExplorer
          voiceEnabled={voiceState().enabled}
          agentEnabled={state.enabled}
          mock={state.mock}
        />
        <p className="mt-8 text-sm text-slate-600">
          吉凶は九星気学の考え方による参考情報です。契約・費用・通勤など、現実の条件と合わせて検討してください。
        </p>
      </article>
    </main>
  );
}
