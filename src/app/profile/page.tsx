import Link from "next/link";
import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { SITE_NAME } from "@/lib/siteStructure";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * 生年月日・出生地・出発地・目的地をまとめて入れる頁。
 *
 * ## なぜ作ったか（利用者の指摘、2026-09-04）
 *
 * 「出生地や目的地を簡単に設定できるようにしたい。よくある個人情報登録
 * ページ、申し込みとかで入力する入力フォームみたいにしたい」。
 *
 * これまでの入口はホームの設定バーだけで、等幅フォントの計器盤ふうの
 * 見た目だった。項目も画面の中に散っていて、どこまで入れれば道具が動く
 * のかが分からない。ここは**順に埋めるだけの 1 枚**にする。
 *
 * 既存の入口は消していない。同じ値を書くので、どちらから入れても同じ
 * 結果になる。
 *
 * ## 索引に載せない
 *
 * 入力するだけの頁で、検索から来ても読むものが無い。robots で外す。
 * `/login` と同じ扱い。
 */

const TITLE = "生年月日と場所を登録する";
const DESCRIPTION =
  "生年月日・出生地・いま住んでいる場所・引越し先の候補をまとめて登録します。一度入れておくと、方位の判定・引越しの試算・物件検索で入れ直さずに使えます。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/profile" },
  robots: { index: false, follow: true },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/profile`,
    type: "website",
  },
};

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 p-4 font-sans text-stone-800 md:p-8">
      {/* 入力欄が主役の頁。横に伸ばしても欄が間延びするだけなので、
          サイトの既定（1700px）ではなく狭く取る。/login と同じ考え方 */}
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <UserRound className="h-5 w-5 text-rose-500" aria-hidden />
            {TITLE}
          </h1>
          <p className="mt-2 max-w-[70ch] text-xs leading-relaxed text-stone-600">
            {
              "一度入れておくと、方位の判定・引越しの試算・物件検索で入れ直さずに使えます。ホームの設定バーからでも同じ値を変えられます。"
            }
          </p>
        </header>

        {/*
          何がどこへ行くのかを先に書く。入力を求める頁で、送り先を
          書かずに欄だけ並べない。
        */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-bold text-stone-800">入れた内容の扱い</h2>
          <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-stone-600">
            <li>
              <b>生年月日・出生地・いま住んでいるところ</b>
              {
                "は、この端末に保存します。ログインしている場合は、ほかの端末でも使えるようにクラウドにも保存します。"
              }
            </li>
            <li>
              <b>引越し先の候補</b>
              {
                "は、この端末にだけ残ります。ログインしていてもクラウドには送りません。"
              }
            </li>
            <li>
              {"詳しくは "}
              <Link href="/privacy" className="text-indigo-600 underline">
                プライバシーポリシー
              </Link>
              {" をご覧ください。"}
            </li>
          </ul>
        </section>

        <ProfileForm />

        <p className="text-[11px] leading-relaxed text-stone-500">
          {
            "方位の吉凶は九星気学という古典的な考え方にもとづく参考情報です。医療・健康・法律・投資に関する助言ではありません。引越しは契約・費用・通勤など現実の条件が優先されます。"
          }
        </p>
      </div>
    </div>
  );
}
