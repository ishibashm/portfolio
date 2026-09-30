import { CandidateEmailImport } from "@/components/relocation/EmailListingDraft";
import { GmailFeature } from "@/components/relocation/GmailFeature";
import { getAuthUser, toUserId } from "@/lib/userConfig";
import Link from "next/link";
import { Bookmark, Mail, MapPin } from "lucide-react";
import CandidateHistory from "@/components/relocation/CandidateHistory";

/*
  保存した候補の頁（利用者の指摘、2026-09-30「履歴ページが履歴というには
  よくわからない」「ページが陳腐なのでリッチに」）。

  - 名前を「本人の候補履歴」から「保存した候補」に。中身は操作の履歴では
    なく、「候補に保存」した物件・地点と保存したときの判定の一覧
  - Gmail の取り込みが頁のいちばん上で主役になっていた。畳んだ節に移す
  - 幅は 1700px（CLAUDE.md 3 節。入力欄が主役の頁ではない）。候補は札で並ぶ
  - スマホでは左上に固定の目次ボタン（GlobalSidebar）があり、見出しの頭が
    隠れていた（「≡ への候補履歴」）。lg 未満は上を空ける
*/

export const dynamic = "force-dynamic";
export const metadata = {
  title: "保存した候補",
  robots: { index: false, follow: false },
};

const SHELL =
  "min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50";
const MAIN =
  "mx-auto max-w-[1700px] space-y-5 px-4 pb-16 pt-20 md:px-8 lg:pt-10";

export default async function CandidatesPage() {
  const user = await getAuthUser();
  if (!user || !toUserId(user))
    return (
      <div className={SHELL}>
        <main className={MAIN}>
          <header className="rounded-3xl border border-stone-200 bg-white/90 p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-stone-800">保存した候補</h1>
            <p className="mt-2 text-sm text-stone-600">
              候補はアカウントに保存します。見るにはログインしてください。
            </p>
            <Link
              href="/login?next=%2Frelocation%2Fcandidates"
              prefetch={false}
              className="mt-4 inline-flex rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
            >
              ログイン
            </Link>
          </header>
        </main>
      </div>
    );

  const gmailEnabled = process.env.LISTING_EMAIL_GMAIL_ENABLED === "true";
  return (
    <div className={SHELL}>
      <main className={MAIN}>
        <header className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white/90 p-6 shadow-sm md:p-8">
          <div
            className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-rose-100/60 blur-2xl"
            aria-hidden
          />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[70ch]">
              <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-rose-600">
                <Bookmark className="h-3.5 w-3.5" aria-hidden />
                引越し先の候補
              </p>
              <h1 className="mt-2 text-2xl font-bold text-stone-800 md:text-3xl">
                保存した候補
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                物件や地点を「候補に保存」すると、ここに並びます。保存したときの方位の段階（S〜X）・方位・距離を残すので、候補どうしを見比べられます。出発地や日付を変えたときは、札の「現在の条件で再判定」で今の条件に当て直してください。
              </p>
            </div>
            <Link
              href="/relocation/arbitrage"
              prefetch={false}
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-rose-700 lg:self-auto"
            >
              <MapPin className="h-4 w-4" aria-hidden />
              地図・住所・物件URLから候補を探す
            </Link>
          </div>
        </header>

        {gmailEnabled && (
          <details className="group rounded-2xl border border-stone-200 bg-white/90 shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-sm font-bold text-stone-700">
              <Mail className="h-4 w-4 text-rose-500" aria-hidden />
              Gmail の物件通知から候補を取り込む
              <span className="ml-auto text-xs font-normal text-stone-500 group-open:hidden">
                開く
              </span>
            </summary>
            <div className="border-t border-stone-100 p-4">
              <GmailFeature enabled>
                <CandidateEmailImport />
              </GmailFeature>
            </div>
          </details>
        )}

        <CandidateHistory />
      </main>
    </div>
  );
}
