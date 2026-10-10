"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ActiveProfileBadge } from "@/components/profile/ActiveProfileBadge";

/*
  ホームの「いまの方位と時刻」の節を、そのままここへ移した。

  ホームでは中核ページの札の下（360x640 で 4.5 画面ぶん下）に置いてあり、
  LazyMount で画面に近づくまで作らないようにしてあっても、開いた人は
  必ず 1.2MB の JS（lunar-javascript を含む）を配られていた。利用者の
  指摘は「機能はいろいろなところに組み込まれているから載せなくても
  いいのでは。重いし使い勝手が良くない」。

  タブの中身は他の頁に無い（タイミング・プロフィールは名前が同じだけで
  別物）ので、消さずに 1 つの頁として残す。「履歴」タブは 2026-09-28 に
  外した（全利用者共通の記録で、本人のものではなかった）。
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
        <span>読み込んでいます…</span>
      </div>
    </div>
  );
}

/*
  この頁で分かること。**部品（SolarTimeClock）は ssr:false なので、
  検索エンジンとまだ読み込みが終わっていない人には、この見出しと
  下の一覧しか届かない。**何がある頁なのかを、部品が来る前から
  読める形で置く。中身の説明は部品側の文言と同じ意味で書き、番号や
  タブの名前には縛らない（並びを変えても嘘にならないように）。
*/
const SECTIONS: { title: string; body: string }[] = [
  {
    title: "いまの要点",
    body: "いま良い方位、いまの時間帯が天中殺かどうか、次に動ける時刻、30 日先までに動ける方位を 1 枚にまとめます。",
  },
  {
    title: "プロフィール",
    body: "生年月日・出生地・出発地。使用中のプロフィールと同じ値を読み、ここで直せば他の道具にも反映されます。",
  },
  {
    title: "目的地と 8 方位",
    body: "地図に目的地を置き、出発地から見た方位の吉凶と 12 か月のヒートマップを見ます。判定は真北で行います。",
  },
  {
    title: "時刻の刻",
    body: "2 時間ごとの刻（十二支・時盤の九星）と、天中殺にあたる時間帯。刻の境目だけ、出発地の経度と均時差を補正した真太陽時で切ります。",
  },
  {
    title: "盤の内訳",
    body: "年盤・月盤・日盤と本命星・月命星の重ね合わせを、方位ごとに開いて確かめます。",
  },
  {
    title: "30 日の見通し",
    body: "方位ごとに 30 日先までの吉凶を並べ、動ける日の数と候補の地域を見比べます。",
  },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 p-4 font-sans text-stone-800 md:p-8">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="pt-14 md:pt-0">
          <h1 className="text-xl font-bold">今日の方位と時刻を確かめる</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            出発地から見た8方位の吉凶と、動き出す時間帯を確かめます。未登録なら見本を表示します。自分の結果を見るには生年月日と場所を登録してください。
          </p>
          {/* どのプロフィールで判定しているかを頭に 1 行。他の道具の頁と
              同じ帯（利用者の指摘、2026-09-12）。この頁だけ無かった。 */}
          <ActiveProfileBadge purpose="今日の方位と時刻" className="mt-3" />
        </header>

        {/* SolarTimeClock は自分で min-h-screen と地色を持つ（ホームに
            埋め込まれていた頃からの作り）。ここでは器を重ねない。 */}
        <SolarTimeClock />

        <details className="rounded-2xl border border-stone-200 bg-white/80 px-4">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-stone-700">
            使い方・計算の基準を見る
          </summary>
          <p className="mb-3 text-sm leading-relaxed text-stone-600">
            年盤・月盤・日盤は日本時間の日付で決まります。約2時間ごとの時間帯（刻）だけ、出発地と太陽の動きに合わせた時刻（真太陽時）で区切ります。方位と時間帯は別の判定です。効果を保証するものではありません。
          </p>
          <p className="text-sm leading-relaxed text-stone-600">
            日ごとの一覧は
            <Link
              href="/relocation/timing"
              className="inline-flex min-h-11 items-center px-1 text-indigo-700 underline"
            >
              時期の分析
            </Link>
            、 暦から日を選ぶには
            <Link
              href="/calendar"
              className="inline-flex min-h-11 items-center px-1 text-indigo-700 underline"
            >
              日取りのカレンダー
            </Link>
            へ。
          </p>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-xs text-stone-600 md:grid-cols-2 xl:grid-cols-3">
            {SECTIONS.map((s) => (
              <div key={s.title}>
                <dt className="font-bold text-stone-700">{s.title}</dt>
                <dd className="leading-relaxed">{s.body}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </div>
  );
}
