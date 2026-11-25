import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import GuideCharacter from "@/components/guide/GuideCharacter";
import { STAR_NAMES } from "@/lib/kigakuContent";
import { createInitialFreeAnswerState } from "@/lib/guide/guideFreeform";
import {
  GUIDE_MEMORY_COOKIE,
  GUIDE_MEMORY_TOPIC_LABELS,
  GUIDE_PREFECTURES,
  guideMemoryConfig,
  readMemory,
  type GuideMemoryPayload,
} from "@/lib/guide/guideMemory";
import { guideSessionKey } from "@/lib/guide/guideSession";
import { workersAiGuideState } from "@/lib/guide/workersAi";
import { pageOpenGraph } from "@/lib/siteUrl";
import AskForm from "./AskForm";

export const dynamic = "force-dynamic";

const PAGE_TITLE = "案内役に自由に質問する｜公開記事を根拠に答える";
const PAGE_DESCRIPTION =
  "このサイト（Cloud Palette）の公開記事を検索し、記事に書かれている内容だけを根拠に案内役AIが答えます。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/annai/ask" },
  // 回答は利用者ごとに違うため索引しない
  robots: { index: false, follow: false },
  openGraph: pageOpenGraph("/annai/ask", PAGE_TITLE, PAGE_DESCRIPTION),
};

function formatRememberedSummary(memory: GuideMemoryPayload): string {
  const parts: string[] = [];
  if (memory.star !== undefined) {
    parts.push(`本命星${memory.star}（${STAR_NAMES[memory.star] ?? ""}）`);
  }
  if (memory.pref !== undefined) {
    parts.push(GUIDE_PREFECTURES[memory.pref]);
  }
  if (memory.topics.length > 0) {
    parts.push(
      `話題: ${memory.topics.map((t) => GUIDE_MEMORY_TOPIC_LABELS[t]).join("・")}`,
    );
  }
  if (memory.slugs.length > 0) {
    parts.push(`読んだ記事${memory.slugs.length}件`);
  }
  return parts.length > 0 ? parts.join("・") : "登録あり";
}

export default async function AnnaiAskPage() {
  const aiState = workersAiGuideState(process.env);
  const sessionKey = guideSessionKey(process.env);
  const enabled = aiState.enabled && sessionKey !== null;

  const memoryEnabled = guideMemoryConfig(process.env).enabled;
  let remembered: GuideMemoryPayload | null = null;
  if (memoryEnabled) {
    const cookieStore = await cookies();
    const rawCookie = cookieStore.get(GUIDE_MEMORY_COOKIE)?.value;
    const memRes = await readMemory(rawCookie, { touch: true });
    if (memRes.status === "ok") {
      remembered = memRes.memory;
    }
  }

  return (
    <main className="min-h-screen bg-background text-ink">
      <article className="mx-auto max-w-[1700px] px-5 py-12">
        <nav aria-label="パンくず" className="mb-4 text-sm text-ink-muted">
          <Link href="/" className="hover:underline">
            ホーム
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/annai" className="hover:underline">
            案内役に聞く
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">自由に質問する</span>
        </nav>

        <h1 className="text-2xl font-bold font-serif sm:text-3xl">
          案内役に自由に質問する
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink max-w-[70ch]">
          このサイトの公開記事を検索し、記事に書かれていることだけを根拠に5文以内で答えます。記事に根拠がないことは「分かりません」とお答えします。生年月日や出発地から方位・日取りを計算する場合は
          <Link
            href="/annai"
            className="mx-1 font-semibold text-accent underline"
          >
            定型の案内（案内役に聞く）
          </Link>
          をご利用ください。
        </p>

        <GuideCharacter pose="compass" size="sm" className="mt-4 max-w-xl">
          記事の内容について気になることを短く聞いてください。個人情報や生年月日は入れないでくださいね。吉凶は参考情報です。
        </GuideCharacter>

        {remembered && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-xs text-ink">
            <span>覚えている条件: {formatRememberedSummary(remembered)}</span>
            <Link
              href="/annai/memory"
              className="font-semibold text-accent underline hover:text-ink"
            >
              記憶を見る・消す
            </Link>
          </div>
        )}

        {!enabled ? (
          <section
            role="status"
            className="mt-8 rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-sm space-y-3"
          >
            <p className="text-sm font-semibold text-ink">
              AIによる自由質問はいま停止しています。
            </p>
            <p className="text-sm text-ink-muted">
              本命星・吉方位・引越しの日取り・記事の検索は、定型の案内からいつでもご利用いただけます。
            </p>
            <p>
              <Link
                href="/annai"
                className="inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-on-accent hover:brightness-110"
              >
                案内役に聞く（定型の案内）へ
              </Link>
            </p>
          </section>
        ) : (
          <AskForm
            initialState={createInitialFreeAnswerState(process.env)}
            memoryEnabled={memoryEnabled}
          />
        )}

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
          <p>吉凶は九星気学の考え方による参考情報です。</p>
          <Link
            href="/annai/memory"
            className="text-xs font-semibold text-accent underline hover:text-ink"
          >
            記憶を見る・消す
          </Link>
        </div>
      </article>
    </main>
  );
}
