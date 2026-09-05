import Link from "next/link";
import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { AccountPanel } from "@/components/account/AccountPanel";
import { SITE_NAME } from "@/lib/siteStructure";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * マイページ。**いま何が登録されているか**を 1 か所で見せる。
 *
 * ## なぜ作ったか
 *
 * よくある新規登録の流れと比べたときに欠けていたもののひとつ。
 * ログイン状態は /login を開くか サイドバーを見るしかなく、登録した
 * 内容は /profile の入力欄を開いて確かめるしかなく、保存済み
 * プロフィールは呼び出す口が 4 画面にあるのに一覧が無かった。
 *
 * ## 入力はここでしない
 *
 * 入力は /profile の仕事。同じ値を 2 か所で書けるようにすると必ず
 * 食い違う（`lib/geoDirection.ts` が「集約するために作られたモジュールが
 * 二重にある」例として CLAUDE.md に残っている）。ここは見るところ。
 *
 * ## 索引に載せない
 *
 * 自分の登録内容を見る頁で、検索から来ても読むものが無い。/login や
 * /profile と同じ扱いにする（next-sitemap の除外にも足すこと。noindex と
 * サイトマップの両方に載せると指示が食い違う）。
 */

const TITLE = "アカウントと登録内容";
const DESCRIPTION =
  "ログイン中のアカウント、登録した生年月日と場所、保存済みプロフィールの一覧をまとめて確認します。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/account" },
  robots: { index: false, follow: true },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/account`,
    type: "website",
  },
};

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 p-4 font-sans text-stone-800 md:p-8">
      {/* 読むだけの頁。横に伸ばしても一覧が間延びするので、/profile と
          同じ幅に揃える */}
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <UserRound className="h-5 w-5 text-rose-500" aria-hidden />
            {TITLE}
          </h1>
          <p className="mt-2 max-w-[70ch] text-xs leading-relaxed text-stone-600">
            {
              "登録した内容と、それがどこに保存されているかを確認できます。変更は「生年月日と場所を登録」から行います。"
            }
          </p>
        </header>

        <AccountPanel />

        <footer className="border-t border-stone-200 pt-5 text-[11px] leading-relaxed text-stone-500">
          <p>
            {"保存する範囲と扱いは "}
            <Link href="/privacy" className="underline hover:text-stone-700">
              プライバシーポリシー
            </Link>
            {" に書いています。"}
          </p>
        </footer>
      </div>
    </div>
  );
}
