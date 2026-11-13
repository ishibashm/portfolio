import type { Metadata } from "next";
import Link from "next/link";
import { COMPASS_DIRECTIONS, DIRECTION_LABELS } from "@/utils/directionGeo";
import {
  FORTUNE_COMPARE_DISCLAIMER,
  FORTUNE_CONFIDENCE_LABEL,
  fortuneCompareFromQuery,
  fortuneCompareQueryPresent,
  fortuneCompareRobots,
  type FortuneJudgment,
  type FortuneQuery,
} from "@/lib/fortunePerspectives";
import { pageOpenGraph } from "@/lib/siteUrl";

const TITLE = "占いの観点を日付と方位で比べる";
const DESCRIPTION =
  "生年月日と日付、任意の出生時刻・方位・出発地の経度から、九星・干支・五行・陰陽・納音・暦注・十二直・数秘を同じ表に並べます。言い伝えは目安で、効果の保証はありません。入力は保存しません。";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<FortuneQuery>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const hasQuery = fortuneCompareQueryPresent(sp);
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/houi/fortune-compare" },
    robots: fortuneCompareRobots(hasQuery),
    openGraph: pageOpenGraph("/houi/fortune-compare", TITLE, DESCRIPTION),
  };
}

const JUDGMENT_CLASS: Record<FortuneJudgment, string> = {
  吉: "text-emerald-800",
  凶: "text-red-800",
  平: "text-stone-700",
  弱: "text-amber-800",
  未確認: "text-stone-500",
  情報: "text-stone-800",
};

export default async function FortuneComparePage({
  searchParams,
}: {
  searchParams: Promise<FortuneQuery>;
}) {
  const sp = await searchParams;
  const compared = fortuneCompareFromQuery(sp);
  const fields = compared.fields;
  return (
    <main className="wg-page min-h-screen px-4 py-10 text-slate-900">
      <article className="mx-auto max-w-[1700px] space-y-8">
        <header className="max-w-[70ch] space-y-3">
          <p className="text-sm">
            <Link href="/houi" className="text-rose-700 underline">
              方位の説明へ戻る
            </Link>
          </p>
          <h1 className="font-serif text-3xl font-bold">{TITLE}</h1>
          <p>
            同じ日付と方位を、九星（年盤・月盤・日盤）、干支、五行、陰陽、納音、暦注、十二直、数秘の個人年・個人日で並べます。
          </p>
          <p>
            {FORTUNE_COMPARE_DISCLAIMER}
            出生時刻が要る時柱、性別が要る八宅、四柱推命、算命学、宿、奇門遁甲、西洋占星術、タロット、易は出しません。
          </p>
        </header>
        <form method="get" className="wg-card space-y-4 p-5">
          <input type="hidden" name="compare" value="1" />
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              生年月日
              <input
                className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1"
                type="date"
                name="birthDate"
                min="1900-01-01"
                max="2100-12-31"
                defaultValue={fields.birthDate}
              />
            </label>
            <label className="block text-sm">
              出生時刻（任意・日本時間）
              <input
                className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1"
                type="time"
                name="birthTime"
                defaultValue={fields.birthTime}
              />
            </label>
            <label className="block text-sm">
              出発地の経度（任意。122〜154）
              <input
                className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1"
                type="number"
                name="lon"
                min={122}
                max={154}
                step="0.0001"
                inputMode="decimal"
                defaultValue={fields.lon}
              />
            </label>
          </div>
          <p className="max-w-[70ch] text-sm text-stone-600">
            九星の方位には経度が要ります。空欄のときは未確認になり、ほかの都市の経度では埋めません。方位が空欄のときは、その日付の暦注だけを出します。
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {fields.candidates.map((candidate, index) => {
              const n = index + 1;
              return (
                <fieldset
                  key={n}
                  className="rounded border border-stone-200 p-3"
                >
                  <legend className="px-1 text-sm font-bold">{n}件目</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="block text-sm">
                      日付
                      <input
                        className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1"
                        type="date"
                        name={`c${n}date`}
                        min="1900-01-01"
                        max="2100-12-31"
                        defaultValue={candidate.date}
                      />
                    </label>
                    <label className="block text-sm">
                      方位
                      <select
                        className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1"
                        name={`c${n}dir`}
                        defaultValue={candidate.direction}
                      >
                        <option value="">指定しない</option>
                        {COMPASS_DIRECTIONS.map((dir) => (
                          <option key={dir} value={dir}>
                            {DIRECTION_LABELS[dir]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </fieldset>
              );
            })}
          </div>
          <button
            type="submit"
            className="rounded bg-rose-700 px-4 py-2 text-sm font-bold text-white"
          >
            比べる
          </button>
        </form>
        {compared.status === "error" ? (
          <p role="alert" className="max-w-[70ch] text-red-800">
            {compared.message}
          </p>
        ) : null}
        {compared.status === "ok"
          ? compared.result.candidates.map((candidate, index) => (
              <section
                key={`${index}-${candidate.date}-${candidate.direction ?? "none"}`}
                className="space-y-2"
              >
                <h2 className="text-xl font-bold">
                  {candidate.date}
                  {candidate.directionLabel
                    ? `・${candidate.directionLabel}`
                    : "・方位なし"}
                </h2>
                <p className="max-w-[70ch] text-sm text-stone-600">
                  {compared.result.birth.honmeiStar
                    ? `本命星は${compared.result.birth.honmeiStar}。`
                    : null}
                  {compared.result.birth.voidNote}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <caption className="sr-only">
                      {candidate.date}の観点
                    </caption>
                    <thead>
                      <tr className="border-b border-stone-300 text-left">
                        <th className="py-2 pr-3">観点</th>
                        <th className="py-2 pr-3">値</th>
                        <th className="py-2 pr-3">判定</th>
                        <th className="py-2 pr-3">確かさ</th>
                        <th className="py-2">説明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidate.perspectives.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-stone-200 align-top"
                        >
                          <th className="py-2 pr-3 text-left font-normal">
                            {item.name}
                          </th>
                          <td className="py-2 pr-3">{item.value}</td>
                          <td
                            className={`py-2 pr-3 font-bold ${JUDGMENT_CLASS[item.judgment]}`}
                          >
                            {item.judgment}
                          </td>
                          <td className="py-2 pr-3">
                            {FORTUNE_CONFIDENCE_LABEL[item.confidence]}
                          </td>
                          <td className="py-2">{item.explanation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          : null}
        <p className="max-w-[70ch] text-sm text-stone-600">
          {FORTUNE_COMPARE_DISCLAIMER}
          クエリ付きのURLは検索対象にしません。入力した生年月日・時刻・経度・日付は、このページの表示以外には保存しません。
        </p>
      </article>
    </main>
  );
}
