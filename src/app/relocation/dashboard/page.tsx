"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

/*
  ホームの「いまの方位と時刻」の節を、そのままここへ移した。

  ホームでは中核ページの札の下（360x640 で 4.5 画面ぶん下）に置いてあり、
  LazyMount で画面に近づくまで作らないようにしてあっても、開いた人は
  必ず 1.2MB の JS（lunar-javascript を含む）を配られていた。利用者の
  指摘は「機能はいろいろなところに組み込まれているから載せなくても
  いいのでは。重いし使い勝手が良くない」。

  7 つのタブの中身は他の頁に無い（履歴・タイミング・プロフィールは
  名前が同じだけで別物）ので、消さずに 1 つの頁として残す。
  ホームからはこの頁への札 1 枚（siteStructure の CORE_ROUTES）で
  辿り着く。

  **部品を直に読むこと。まとめ役の入口を作って、そこから読まないこと。**
  dynamic import の先に再輸出だけの層を挟むと、束ねられた部品が全部
  同じチャンクに入る（#392・#396）。
*/
const SolarTimeClock = dynamic(
  () => import("@/components/SolarTimeClock").then((mod) => mod.SolarTimeClock),
  {
    ssr: false,
    loading: () => <ClockPlaceholder />,
  },
);

function ClockPlaceholder() {
  return (
    <div className="w-full h-80 flex items-center justify-center bg-stone-50/80 rounded-2xl border border-slate-200">
      <div className="flex items-center gap-2 text-slate-500 font-sans text-sm">
        <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <span>Solar Time & Geomancy Engine ロード中...</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 p-4 font-sans text-stone-800 md:p-8">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header>
          <h1 className="text-xl font-bold">今日の方位と時刻を確かめる</h1>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            日盤の吉凶は真太陽時で切り替わります。引越し当日の動き出す時刻を決めるときに使います。生年月日と現在地は
            <Link
              href="/"
              className="mx-1 font-semibold text-indigo-600 underline"
            >
              ホーム
            </Link>
            の入力欄と同じものを読みます。
          </p>
          {/* 「時期を選ぶ」道具は 3 本ある。役割の違いを冒頭に書かないと、
              どちらを開けばいいか初見で分からない（timing・calendar と
              同じ作法）。 */}
          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            この頁は「今日・いま」の判定です。日ごとの一覧は
            <Link
              href="/relocation/timing"
              className="mx-1 font-semibold text-indigo-600 underline"
            >
              時期の分析
            </Link>
            、暦注を突き合わせて日を選ぶには
            <Link
              href="/calendar"
              className="mx-1 font-semibold text-indigo-600 underline"
            >
              日取りのカレンダー
            </Link>
            を使ってください。
          </p>
        </header>
        {/* SolarTimeClock は自分で min-h-screen と地色を持つ（ホームに
            埋め込まれていた頃からの作り）。ここでは器を重ねない。 */}
        <SolarTimeClock />
      </div>
    </div>
  );
}
