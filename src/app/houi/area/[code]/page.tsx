import Link from "next/link";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  AREAS,
  areaAsOf,
  emptyDirections,
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
import { DatasetJsonLd, BreadcrumbJsonLd } from "@/components/JsonLd";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { prefCodeByName } from "@/lib/prefContent";

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
  return {
    title,
    description,
    alternates: { canonical: `/houi/area/${area.code}` },
    /*
      索引には載せない。**道具としては残す**（follow は許す）。

      このページは areaDirections.json の 1,022 市区町村を同じ雛形で
      展開したもので、**地の文はどの URL でも同一**、変わるのは地名と
      表の数字だけ。1 サイトで 1,022 URL は Google の言う
      「スケーリングされたコンテンツ」に当たり、AdSense からも
      「有用性の低いコンテンツ」としてサイト全体の配信を止められた。

      Search Console の実測でも、この 1,022 ページは事実上索引されて
      いない（878 URL のうち登録済み 78、検出only 811、表示回数ほぼ 0）。
      **外しても失う流入が無い**ので、索引の対象を「1 ページ 1 記事」に
      なっているページへ絞る。

      吉方位からエリアを引く導線としては有用なので、リンクも中身も
      そのまま残す。索引に戻すなら、市区町村ごとではなく都道府県ごとに
      まとめて、各ページに固有の文章を書くのが先（docs 参照）。

      **その「固有の文章を書いた頁」から 1 つずつ索引に戻す。**
      areaEditorial に文章のある市区町村だけ index にする。雛形のまま
      一括で戻すのではないので、上の「スケーリングされたコンテンツ」に
      当たらない。表に無い市区町村は今までどおり noindex のまま。
    */
    robots: { index: Boolean(AREA_EDITORIAL[area.code]), follow: true },
    openGraph: {
      images: ["/ogp.png"], title, description, type: "article" },
  };
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
  /* 固有の文章がある市区町村だけ。無ければ雛形のまま（noindex） */
  const editorial = AREA_EDITORIAL[area.code];

  // その年に各本命星がどの方位を吉とするか。方位別の一覧と突き合わせられるようにする。
  const goodByStar = STARS.map((s) => ({
    star: s,
    dirs: getYearDirections(year, s)
      .verdicts.filter((v) => v.kind === "good")
      .map((v) => v.direction),
  }));

  const populated = DIRECTIONS.filter((d) => groups[d].length > 0);
  /* 候補が無い方位。**これを出さないと「街が無い」のか「頁が出し
     忘れている」のか読む側に分からない**（lib/areaContent の註）。
     行き止まりなのか、遠いだけなのかも分けて出す。 */
  const empty = emptyDirections(area);
  const deadEnd = empty.filter((e) => !e.hasBeyondRange);
  const farOnly = empty.filter((e) => e.hasBeyondRange);
  const siblings = siblingAreas(area);
  /* 県ページは 47 県ぶん全部ある（prefEditorial に 47 県そろっている）。
     市区町村ページからは今まで上へ辿れず、県 → 市区町村の片道だった。 */
  const prefCode = prefCodeByName(area.pref);

  const path = `/houi/area/${area.code}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      {/*
        description は 50 文字以上にする。Google の Dataset は 50〜5000 字を
        求め、以前の文（45 字）は Search Console で「文字列長が無効」の
        重大な問題として弾かれていた。地名は短いものだと 4 文字なので、
        地名を除いた地の文だけで 50 字を超える長さにしてある。
      */}
      <DatasetJsonLd
        name={`${area.full}から見た方位別のエリアと家賃相場`}
        description={`${area.full}を出発地として、北・北東・東・南東・南・南西・西・北西の八方位ごとに、その方角に位置する市区町村の一覧と、掲載中の賃貸物件から集計した専有面積あたりの家賃相場をまとめたデータ。九星気学の吉方位から引越し先を探すときの判断材料に使う。`}
        path={path}
        dateModified={areaAsOf(area)}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "方位の早見表", path: "/houi" },
          { name: "エリア別", path: "/houi/area" },
          ...(prefCode
            ? [{ name: area.pref, path: `/houi/pref/${prefCode}` }]
            : []),
          { name: area.full, path },
        ]}
      />
      {/* 幅は全画面で 1700px に揃える（1/3 と同じ理由）。 */}
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/houi" className="hover:text-rose-600">
            方位の早見表
          </Link>
          <span className="mx-2">/</span>
          <Link href="/houi/area" className="hover:text-rose-600">
            エリア別
          </Link>
          <span className="mx-2">/</span>
          {prefCode && (
            <>
              <Link
                href={`/houi/pref/${prefCode}`}
                className="hover:text-rose-600"
              >
                {area.pref}
              </Link>
              <span className="mx-2">/</span>
            </>
          )}
          <span>{area.full}</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          {area.full}から見た方位別のエリアと家賃相場
        </h1>

        <p className="mt-5 text-sm leading-relaxed text-slate-700">
          吉方位が分かっても、その方位に実際どんな街があっていくらなのかが分からないと引越し先は決められません。{area.full}を出発地として、八方位それぞれにある市区町村と家賃相場をまとめました。
        </p>

        {/* 固有の文章。書いた市区町村だけが索引に載る（AREA_EDITORIAL）。
            数字は下の札とデータ側が持ち、ここは地理の構造だけを書く */}
        {editorial && (
          <div className="mt-5 space-y-3">
            {editorial.intro.map((paragraph, i) => (
              <p
                key={i}
                className="max-w-[70ch] text-sm leading-relaxed text-slate-700"
              >
                {paragraph}
              </p>
            ))}
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-slate-300 bg-white/90 p-4">
          <p className="text-xs text-slate-700 leading-relaxed">
            <b>{area.full}の相場</b>: 専有面積あたり{" "}
            <b>{area.sqmRent.toLocaleString()}円/㎡</b>、家賃（管理費込み）の中央値 <b>{area.medianRent.toLocaleString()}円</b>
            。掲載中の {area.count.toLocaleString()} 件から集計しています。以下の増減率はこの値を基準にした差です。
          </p>
          {/*
            日付はファイル全体の generatedAt ではなく、この市区町村の asOf
            を出す。掲載が閾値に満たない市区町村は前回の数字を引き継いで
            いる（#533）ので、ファイルの日付だと更新していない相場に
            今日の日付が付く。
          */}
          <p className="mt-2 text-[11px] text-slate-500">
            集計日: {new Date(areaAsOf(area)).toLocaleDateString("ja-JP")}
            ／ 掲載中の物件は入れ替わるため、最新の相場とは差が出ることがあります。
          </p>
          {/*
            この数字がどう作られているかへの導線。
            「◯◯市 家賃相場」で来た人が最初に見るのがこの札で、
            中央値なのか平均なのか・何件から出したのかが分からないと
            読みようがない。この頁は noindex（#379）なので、
            説明そのものは索引に載る記事の側に置いてある。
          */}
          <p className="mt-1 text-[11px] text-slate-500">
            <Link
              href="/blog/how-we-analyze-the-rental-market"
              className="font-semibold text-indigo-700 underline"
            >
              相場をどう出しているか
            </Link>
            ：平均ではなく中央値を使う理由と、割安度の測り方。
          </p>
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            方位ごとのエリア
          </h2>
          <p className="text-xs text-slate-600 mt-3">
            {area.full}の中心から 5〜150km の範囲。距離が近い順に並べています。
          </p>

          {/* 街が無い方位。吉方位が出ても引越し先が無いので、
              候補の一覧より先に置く。

              **行き止まりと「遠いだけ」を分ける。**空の方位のうち
              一定数は、150km より先に市区町村がある（函館市の南西など）。
              そこを「行き止まり」と書くと嘘になる。 */}
          {deadEnd.length > 0 && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-900">
              <b>
                市区町村が 1 つも無い方位:{" "}
                {deadEnd.map((e) => DIRECTION_LABELS[e.direction]).join("・")}
              </b>
              。海や山で行き止まりになるため、暦の上でこの方位が吉に出ても引越し先の候補がありません。別の方位で探すことになります。
            </p>
          )}
          {farOnly.length > 0 && (
            <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
              <b>
                150km 以内に市区町村が無い方位:{" "}
                {farOnly.map((e) => DIRECTION_LABELS[e.direction]).join("・")}
              </b>
              。行き止まりではなく、いちばん近い街でもこの一覧の範囲より遠い、という意味です。
            </p>
          )}

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
                            <Link prefetch={false}
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

        {/*
          広告は置かない。索引から外した雛形展開のページに広告を置くのは、
          AdSense の「有用性の低いコンテンツ」の指摘にそのまま当たる。
          広告は記事・手引き・ホーム・索引ページに絞る。
        */}

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            {year}年、自分にとっての吉方位はどれか
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            方位の吉凶は本命星ごとに違います。{year}年の年盤では次のとおりです。上の表と突き合わせてください。
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
                      <Link prefetch={false}
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
            をご覧ください。年盤で吉でも月によって変わるため、実際に動く月の月盤も確認してください。
          </p>
        </section>

        <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-900">
            この表の読み方と限界
          </h2>
          <ul className="mt-3 text-xs text-amber-900 leading-relaxed list-disc pl-5 space-y-1.5">
            <li>
              方位は市区町村の<b>中心どうし</b>で計算しています。同じ市の中でも端のほうは方位が変わることがあります。実際の物件で確認してください。
            </li>
            <li>
              相場は掲載中の物件から集計した平均です。間取りや築年数の構成がエリアごとに違うため、単純比較には限界があります。
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
                <Link prefetch={false}
                  key={s.code}
                  href={`/houi/area/${s.code}`}
                  className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
                >
                  {s.city}
                </Link>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {prefCode && (
                <Link
                  href={`/houi/pref/${prefCode}`}
                  className="inline-flex text-xs font-semibold text-rose-600 underline hover:text-rose-700"
                >
                  {area.pref}全体の相場と方位を見る
                </Link>
              )}
              <Link
                href="/houi/area"
                className="inline-flex text-xs font-semibold text-rose-600 underline hover:text-rose-700"
              >
                すべての市区町村から選ぶ（{AREAS.length}エリア）
              </Link>
            </div>
          </section>
        )}

        <ContentDisclaimer />
      </article>
    </div>
  );
}
