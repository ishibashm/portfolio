import type { Metadata } from "next";
import dynamic from "next/dynamic";
import yieldStatsJson from "@/data/yieldStats.json";
import type { YieldStats } from "@/utils/yieldStats";
import {
  MIN_CELLS_FOR_PREFECTURE,
  YIELD_CAVEATS,
  formatYield,
  isPrefectureReliable,
  yieldColor,
} from "@/lib/yieldPresentation";

/**
 * 表面利回りの地図（/relocation/yield）。
 *
 * ## なぜこのサイトで作れるのか
 *
 * 分子（賃貸の募集）と分母（成約価格）の**両方**を持っているため。
 * ポータルの利回りは売主の希望価格を分母にするが、こちらは実際に
 * 成立した額を分母にする。ここが決定的に違うので、頁の冒頭で言う。
 *
 * ## 読み順は「結論 → 根拠 → 明細」
 *
 * 全国の中央値 → 地図 → 都道府県の一覧、の順に置く。数字を先に見せて
 * から、どこでそうなっているかを示す。
 *
 * ## 断り書きを畳まない
 *
 * 数字だけ出すと**根拠のある数字に見えてしまう。**折りたたみに入れず、
 * 一覧の直後に開いたまま置く。読み飛ばされてもよいが、探さないと
 * 見つからない場所には置かない。
 */

export const metadata: Metadata = {
  title: "表面利回りの地図 | Cloud Palette",
  description:
    "成約価格を分母にした中古マンションの表面利回りを、全国の区画ごとに出しています。分子は賃貸の募集賃料です。",
};

/*
  地図は react-simple-maps が window を触るので client 側だけで描く。
  ssr: false にしないと build が落ちる（他の地図と同じ扱い）。
*/
const YieldMap = dynamic(
  () => import("@/components/relocation/YieldMap").then((m) => m.YieldMap),
  { ssr: false, loading: () => <MapSkeleton /> },
);

function MapSkeleton() {
  return (
    <div className="flex h-[420px] w-full items-center justify-center rounded-2xl border border-stone-200 bg-stone-50">
      <p className="text-xs text-stone-500">地図を読み込んでいます…</p>
    </div>
  );
}

const stats: YieldStats = yieldStatsJson as YieldStats;

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-[11px] font-bold text-stone-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-stone-900">
        {value}
      </p>
      {note && <p className="mt-1 text-[11px] text-stone-500">{note}</p>}
    </div>
  );
}

export default function YieldPage() {
  const d = stats.distribution;
  const generated = stats.generatedAt
    ? new Date(stats.generatedAt).toLocaleDateString("ja-JP", {
        timeZone: "Asia/Tokyo",
      })
    : null;

  /* 集計が一度も走っていないときは、0% と偽らずそう言う。 */
  if (!d || stats.cells.length === 0) {
    return (
      <main className="min-h-screen bg-stone-50 p-4 md:p-8">
        <div className="mx-auto max-w-[1700px]">
          <h1 className="font-serif text-2xl font-bold text-stone-900">
            表面利回りの地図
          </h1>
          <p className="mt-3 text-sm text-stone-600">
            集計がまだ走っていません。準備ができ次第ここに出ます。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-stone-50 via-stone-50 to-blue-50/40 p-4 text-stone-800 md:p-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <header>
          <h1 className="font-serif text-2xl font-bold text-stone-900">
            表面利回りの地図
          </h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-stone-600">
            <strong>分母は実際に成立した成約価格です。</strong>
            ポータルに出ている利回りは売主の希望価格を分母にしていることが多く、そのぶん高く見えます。ここでは国土交通省の成約価格（中古マンション）を分母に、自前で集めた賃貸の募集賃料を分子にしています。
          </p>
          {generated && (
            <p className="mt-2 text-[11px] font-mono text-stone-500">
              {generated} 時点／対象年 {stats.source.yearFrom}〜
              {stats.source.yearTo}／賃貸{" "}
              {stats.source.rentalRows.toLocaleString()} 件・成約{" "}
              {stats.source.purchaseRows.toLocaleString()} 件
            </p>
          )}
        </header>

        {/* 結論を先に置く */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Figure
            label="全国の中央値"
            value={formatYield(d.median)}
            note={`区画 ${stats.source.cells.toLocaleString()} 個の中央値`}
          />
          <Figure
            label="低いほう（下位 10%）"
            value={formatYield(d.p10)}
            note="都心など、価格が先に上がった地域"
          />
          <Figure
            label="高いほう（上位 10%）"
            value={formatYield(d.p90)}
            note="価格が上がっていない地域でもあります"
          />
          <Figure
            label="区画の大きさ"
            value="約 5km 四方"
            note="片側 5 件以上そろった区画だけ"
          />
        </section>

        {/* 根拠 */}
        <section className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div>
            <YieldMap cells={stats.cells} />
          </div>

          {/* 明細 */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <h2 className="text-sm font-bold text-stone-800">
              都道府県ごとの中央値
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
              高い順。
              <strong>
                区画が {MIN_CELLS_FOR_PREFECTURE} 未満の県は「参考」
              </strong>
              としています。取引が薄く、数字が動きやすいためです。件数が少ないこと自体がその県の状況を表しているので、消さずに残しています。
            </p>
            <div className="mt-3 max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-stone-200 text-left text-[11px] text-stone-500">
                    <th className="py-1.5 font-semibold">都道府県</th>
                    <th className="py-1.5 text-right font-semibold">利回り</th>
                    <th className="py-1.5 text-right font-semibold">区画</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byPrefecture.map((p) => {
                    const reliable = isPrefectureReliable(p.cells);
                    return (
                      <tr
                        key={p.prefecture}
                        className="border-b border-stone-100"
                      >
                        <td className="py-1.5">
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 shrink-0 rounded-sm border border-stone-300"
                              style={{
                                backgroundColor: yieldColor(p.medianYield),
                              }}
                            />
                            {p.prefecture}
                            {!reliable && (
                              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-600">
                                参考
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {formatYield(p.medianYield)}
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-stone-500">
                          {p.cells}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 断り書きは畳まない */}
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="text-sm font-bold text-stone-800">
            この数字で分からないこと
          </h2>
          <ul className="mt-2 space-y-1.5">
            {YIELD_CAVEATS.map((caveat) => (
              <li
                key={caveat}
                className="max-w-[70ch] text-[12px] leading-relaxed text-stone-700"
              >
                ・{caveat}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
