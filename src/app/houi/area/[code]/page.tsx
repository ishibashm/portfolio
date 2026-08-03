import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  AREAS,
  AREA_GENERATED_AT,
  findArea,
  neighboursByDirection,
  siblingAreas,
} from "@/lib/areaContent";
import {
  DIRECTIONS,
  DIRECTION_LABELS,
  STAR_NAMES,
  STARS,
  contentYears,
  getYearDirections,
} from "@/lib/kigakuContent";
import { AdBanner } from "@/components/ads/AdBanner";
import { DatasetJsonLd, BreadcrumbJsonLd } from "@/components/JsonLd";

/**
 * 「○○市から見た方位別のエリアと相場」。
 *
 * 方位は出発地からの向きで決まるため、市区町村どうしの位置関係は固定で、
 * 静的ページとして成立する。九星気学の記事は「北東が吉」までしか言えないが、
 * このページは「では北東に何があり、いくらか」まで繋ぐ。
 *
 * 載せているのは自前で集計した相場と方位判定だけで、
 * 物件そのものの情報は載せていない。
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return AREAS.map((a) => ({ code: a.code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const area = findArea((await params).code);
  if (!area) return {};
  const title = `${area.full}から見た方位別のエリアと家賃相場`;
  const description = `${area.full}を出発地としたとき、北・北東・東・南東・南・南西・西・北西それぞれにどの市区町村があり、家賃相場がいくらかをまとめています。引越しの方位を決めるときの比較に。`;
  return { title, description, openGraph: { title, description, type: "article" } };
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const area = findArea((await params).code);
  if (!area) notFound();

  const groups = neighboursByDirection(area);
  const year = contentYears()[0];

  // その年に各本命星がどの方位を吉とするか。方位別の一覧と突き合わせられるようにする。
  const goodByStar = STARS.map((s) => ({
    star: s,
    dirs: getYearDirections(year, s)
      .verdicts.filter((v) => v.kind === "good")
      .map((v) => v.direction),
  }));

  const populated = DIRECTIONS.filter((d) => groups[d].length > 0);
  const siblings = siblingAreas(area);

  const path = `/houi/area/${area.code}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      <DatasetJsonLd
        name={`${area.full}から見た方位別のエリアと家賃相場`}
        description={`${area.full}を出発地としたときの八方位ごとの市区町村と、専有面積あたりの家賃相場。`}
        path={path}
        dateModified={AREA_GENERATED_AT}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "方位の早見表", path: "/houi" },
          { name: "エリア別", path: "/houi/area" },
          { name: area.full, path },
        ]}
      />
      <article className="max-w-[860px] mx-auto px-5 py-12">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/houi" className="hover:text-rose-600">
            方位の早見表
          </Link>
          <span className="mx-2">/</span>
          <Link href="/houi/area" className="hover:text-rose-600">
            エリア別
          </Link>
          <span className="mx-2">/</span>
          <span>{area.full}</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          {area.full}から見た方位別のエリアと家賃相場
        </h1>

        <p className="mt-5 text-sm leading-relaxed text-slate-700">
          吉方位が分かっても、その方位に実際どんな街があっていくらなのかが分からないと
          引越し先は決められません。{area.full}を出発地として、
          八方位それぞれにある市区町村と家賃相場をまとめました。
        </p>

        <div className="mt-5 rounded-2xl border border-slate-300 bg-white/90 p-4">
          <p className="text-xs text-slate-700 leading-relaxed">
            <b>{area.full}の相場</b>: 専有面積あたり{" "}
            <b>{area.sqmRent.toLocaleString()}円/㎡</b>、
            家賃（管理費込み）の中央値 <b>{area.medianRent.toLocaleString()}円</b>
            。掲載中の {area.count.toLocaleString()} 件から集計しています。
            以下の増減率はこの値を基準にした差です。
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            集計日: {new Date(AREA_GENERATED_AT).toLocaleDateString("ja-JP")}
            ／ 掲載中の物件は入れ替わるため、最新の相場とは差が出ることがあります。
          </p>
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            方位ごとのエリア
          </h2>
          <p className="text-xs text-slate-600 mt-3">
            {area.full}の中心から 5〜150km の範囲。距離が近い順に並べています。
          </p>

          <div className="mt-6 space-y-6">
            {populated.map((d) => (
              <div key={d}>
                <h3 className="text-base font-bold font-serif flex items-baseline gap-2">
                  <span>{DIRECTION_LABELS[d]}</span>
                  <span className="text-xs font-normal text-slate-500">
                    {groups[d].length}エリア
                  </span>
                </h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-stone-100">
                        <th className="border border-slate-300 p-2 text-left font-bold">
                          市区町村
                        </th>
                        <th className="border border-slate-300 p-2 text-right font-bold">
                          距離
                        </th>
                        <th className="border border-slate-300 p-2 text-right font-bold">
                          ㎡単価
                        </th>
                        <th className="border border-slate-300 p-2 text-right font-bold">
                          家賃中央値
                        </th>
                        <th className="border border-slate-300 p-2 text-right font-bold">
                          {area.city}比
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups[d].slice(0, 12).map((n) => (
                        <tr key={n.code}>
                          <td className="border border-slate-300 p-2">
                            <Link
                              href={`/houi/area/${n.code}`}
                              className="hover:text-rose-600 font-semibold"
                            >
                              {n.full}
                            </Link>
                          </td>
                          <td className="border border-slate-300 p-2 text-right font-mono">
                            {n.distanceKm}km
                          </td>
                          <td className="border border-slate-300 p-2 text-right font-mono">
                            {n.sqmRent.toLocaleString()}
                          </td>
                          <td className="border border-slate-300 p-2 text-right font-mono">
                            {n.medianRent.toLocaleString()}
                          </td>
                          <td
                            className={`border border-slate-300 p-2 text-right font-mono font-bold ${
                              n.rentDiffPct < 0
                                ? "text-emerald-700"
                                : n.rentDiffPct > 0
                                  ? "text-rose-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {n.rentDiffPct > 0 ? "+" : ""}
                            {n.rentDiffPct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10">
          <AdBanner />
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            {year}年、自分にとっての吉方位はどれか
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            方位の吉凶は本命星ごとに違います。{year}年の年盤では次のとおりです。
            上の表と突き合わせてください。
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-stone-100">
                  <th className="border border-slate-300 p-2 text-left font-bold">
                    本命星
                  </th>
                  <th className="border border-slate-300 p-2 text-left font-bold">
                    {year}年の吉方位
                  </th>
                </tr>
              </thead>
              <tbody>
                {goodByStar.map((g) => (
                  <tr key={g.star}>
                    <td className="border border-slate-300 p-2">
                      <Link
                        href={`/houi/${year}/${g.star}`}
                        className="font-semibold hover:text-rose-600"
                      >
                        {STAR_NAMES[g.star]}
                      </Link>
                    </td>
                    <td className="border border-slate-300 p-2">
                      {g.dirs.length
                        ? g.dirs.map((d) => DIRECTION_LABELS[d]).join("・")
                        : "この年は吉方位なし"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-600 leading-relaxed">
            自分の本命星が分からない場合は
            <Link href="/houi" className="underline hover:text-rose-600">
              生まれ年から引ける早見表
            </Link>
            をご覧ください。年盤で吉でも月によって変わるため、
            実際に動く月の月盤も確認してください。
          </p>
        </section>

        <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-900">
            この表の読み方と限界
          </h2>
          <ul className="mt-3 text-xs text-amber-900 leading-relaxed list-disc pl-5 space-y-1.5">
            <li>
              方位は市区町村の<b>中心どうし</b>で計算しています。同じ市の中でも
              端のほうは方位が変わることがあります。実際の物件で確認してください。
            </li>
            <li>
              相場は掲載中の物件から集計した平均です。間取りや築年数の構成が
              エリアごとに違うため、単純比較には限界があります。
            </li>
            <li>
              九星気学は伝統的な考え方であり、科学的に効果が確認されたものではありません。
            </li>
          </ul>
          <Link
            href={`/relocation/arbitrage?baseLat=${area.lat}&baseLon=${area.lon}&radiusKm=all&prefecture=${encodeURIComponent(area.pref)}`}
            className="mt-4 inline-flex px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
          >
            {area.full}を出発地にして物件を探す
          </Link>
        </section>

        {/* 方位別の一覧は 5〜150km で切ってあるので、同一市内の区や県内の遠い市は
            そこに出てこない。出発地を選び直したい人のために県で辿れるようにする。 */}
        {siblings.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
              {area.pref}のほかのエリアを出発地にする
            </h2>
            <p className="mt-3 text-xs text-slate-600">
              出発地が変われば方位も変わります。近くにお住まいの場合はこちらから。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {siblings.map((s) => (
                <Link
                  key={s.code}
                  href={`/houi/area/${s.code}`}
                  className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
                >
                  {s.city}
                </Link>
              ))}
            </div>
            <Link
              href="/houi/area"
              className="mt-4 inline-flex text-xs font-semibold text-rose-600 underline hover:text-rose-700"
            >
              すべての市区町村から選ぶ（{AREAS.length}エリア）
            </Link>
          </section>
        )}
      </article>
    </div>
  );
}
