/**
 * 購入（成約価格）の相場分析。
 *
 * 国交省の不動産情報ライブラリから取り込んだ実際の成約価格を集計して出す。
 * 数字は毎晩 scripts/build_purchase_stats.ts が焼き込む
 * （src/data/purchaseStats.json）。**訪問時に DB は叩かない。**
 *
 * ## なぜ表が主役で、グラフ（recharts）を使わないか
 *
 * 1. **検索エンジンに中身が見える。**このページはサーバーコンポーネント
 *    で、JavaScript 無しで全部の数字が HTML に出る。AdSense に
 *    「有用性の低いコンテンツ」で配信を止められた経緯があり
 *    （Search Console の実測で 878 URL 中 登録済み 78）、
 *    **操作しないと何も出ない画面を増やさない**のが方針。
 * 2. **この用途では表のほうが正確。**「大阪の中古マンションはいくらか」に
 *    棒の長さでは答えられない。分布だけは形が要るので CSS の帯で描く。
 * 3. recharts の Tooltip は `any` を呼ぶ（CLAUDE.md 4 節）。lint の
 *    警告を増やさずに済む。
 */
import type { Metadata } from "next";
import Link from "next/link";
import purchaseStats from "@/data/purchaseStats.json";
import type { PurchaseStats } from "@/utils/purchaseStats";
import type { HistogramBucket } from "@/utils/marketStats";

const stats = purchaseStats as unknown as PurchaseStats;

export const metadata: Metadata = {
  title: "購入の相場を分析する | Cloud Palette",
  description:
    "国交省の成約価格をもとに、㎡単価・土地代と建物代の比率・築年数・構造・都道府県別の相場を集計して並べる。地価公示との対比も出す。",
};

/** 円を読みやすい単位に落とす。1 億以上は「億」、それ未満は「万」。 */
function yen(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)} 億円`;
  if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString()} 万円`;
  return `${Math.round(v).toLocaleString()} 円`;
}

/** ㎡単価。万円/㎡ で出す。 */
function perSqm(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${(v / 10_000).toFixed(1)} 万円/㎡`;
}

function count(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toLocaleString();
}

function pct(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-stone-800">{title}</h2>
      <p className="mt-0.5 mb-4 text-[11px] leading-relaxed text-stone-600">
        {subtitle}
      </p>
      {children}
    </section>
  );
}

/**
 * 分布。CSS の帯で描くので JavaScript が要らない。
 * 最大の階級を 100% として相対で伸ばす。
 */
function Distribution({
  buckets,
  format,
}: {
  buckets: HistogramBucket[];
  format: (x0: number) => string;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((a, b) => a + b.count, 0);
  return (
    <div className="space-y-1">
      {buckets.map((b) => (
        <div key={b.x0} className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-right font-mono text-[10px] text-stone-600">
            {format(b.x0)}
          </span>
          <div className="h-3.5 flex-1 overflow-hidden rounded-sm bg-stone-100">
            <div
              className="h-full rounded-sm bg-amber-400"
              style={{ width: `${(b.count / max) * 100}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right font-mono text-[10px] text-stone-600">
            {total > 0 ? `${((b.count / total) * 100).toFixed(1)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 表の枠。横に長い表はここで包んで、頁ごと横に流れないようにする。 */
function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

const TH =
  "px-2 py-1.5 text-left font-semibold text-stone-700 whitespace-nowrap";
const TD = "px-2 py-1.5 text-stone-700 whitespace-nowrap";
const TD_NUM = `${TD} text-right font-mono`;

export default function PurchaseAnalyticsPage() {
  if (!stats.generatedAt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 p-6 font-sans">
        <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
          <h1 className="text-lg font-bold text-amber-900">
            購入の相場分析（準備中）
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-amber-800">
            成約価格の集計がまだ一度も走っていません。次回の夜間バッチが完了すると、ここに㎡単価・土地代と建物代の比率・築年数別・都道府県別の相場が並びます。
          </p>
          <Link
            href="/relocation/market"
            className="mt-4 inline-block rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-900"
          >
            家賃相場の分析を見る
          </Link>
        </div>
      </div>
    );
  }

  const s = stats.source;
  const n = stats.national;
  const generated = new Date(stats.generatedAt).toLocaleDateString("ja-JP");

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 p-4 font-sans text-stone-800 md:p-8">
      {/* 幅は 1700px（CLAUDE.md 3 節）。表を並べる画面なので広く使う。 */}
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold">購入の相場を分析する</h1>
          <p className="mt-1 max-w-4xl text-xs leading-relaxed text-stone-600">
            国土交通省の不動産情報ライブラリが公開している
            <strong>実際の成約価格</strong>
            を集計しています。売り出し価格（希望額）ではなく、実際に取引が成立した額です。
            {s.yearFrom !== null && s.yearTo !== null && (
              <>
                対象は {s.yearFrom}〜{s.yearTo} 年の{" "}
                <strong>{count(s.rows)} 件</strong>。
              </>
            )}
            集計日 {generated}。
          </p>

          {/*
            この頁は全国の相場そのものを扱う。**自分の出発地から見た方位別**の
            成約価格は物件スキャナーが持っていて、これまでどちらからも
            互いを指していなかった。同じ成約価格を扱う頁が 2 つあるのに
            繋がっていないと、片方に辿り着いた人がもう片方を知らないまま終わる。
          */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/relocation/arbitrage"
              className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100"
            >
              方位別の成約価格を見る（物件スキャナー）
            </Link>
            <Link
              href="/relocation/market"
              className="rounded-full border border-gray-200 bg-stone-50 px-3 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
            >
              家賃の相場を見る
            </Link>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "集計した成約", value: count(s.rows) },
              { label: "座標が引けた件数", value: count(s.withCoords) },
              {
                label: "土地/建物の内訳を出せた件数",
                value: count(s.withBuildingRatio),
              },
              { label: "都道府県", value: `${stats.prefectures.length}` },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-2xl border border-gray-200 bg-stone-50 p-3"
              >
                <dt className="text-[10px] font-semibold tracking-wider text-stone-600">
                  {k.label}
                </dt>
                <dd className="mt-1 font-mono text-lg font-bold text-stone-800">
                  {k.value}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        {/* 種類別 */}
        <Section
          title="種類別の相場"
          subtitle="総額と㎡単価の両方を出しています。総額だけでは広さの違いで比べられないためです。p25〜p75 は真ん中の半数が収まる範囲で、相場の幅として読みます。"
        >
          <TableWrap>
            <table className="w-full min-w-[820px] text-[11px]">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className={TH}>種類</th>
                  <th className={`${TH} text-right`}>件数</th>
                  <th className={`${TH} text-right`}>総額の中央値</th>
                  <th className={`${TH} text-right`}>総額 p25〜p75</th>
                  <th className={`${TH} text-right`}>㎡単価の中央値</th>
                  <th className={`${TH} text-right`}>㎡単価 p25〜p75</th>
                </tr>
              </thead>
              <tbody>
                {n.byType.map((t) => (
                  <tr key={t.type} className="border-b border-stone-100">
                    <td className={`${TD} font-semibold`}>{t.type}</td>
                    <td className={TD_NUM}>{count(t.count)}</td>
                    <td className={TD_NUM}>{yen(t.price?.median)}</td>
                    <td className={TD_NUM}>
                      {yen(t.price?.p25)} 〜 {yen(t.price?.p75)}
                    </td>
                    <td className={TD_NUM}>{perSqm(t.unitPrice?.median)}</td>
                    <td className={TD_NUM}>
                      {perSqm(t.unitPrice?.p25)} 〜 {perSqm(t.unitPrice?.p75)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Section>

        {/* 土地代と建物代 */}
        <Section
          title="土地代と建物代の比率"
          subtitle="同じ総額でも「土地が高い物件」と「建物が良い物件」は中身が違います。設備の良い家を狙うなら建物寄り、資産として土地を持ちたいなら土地寄りを見ます。"
        >
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
            <strong>この内訳は積算による推定です。</strong>
            成約価格は総額でしか公開されないため、建物の構造・築年数から再調達価格を積み、残りを土地代とみなして按分しています。実際の売買契約書の内訳とは一致しません。
            <strong>傾向を読む用途に限ってください。</strong>
            計算式と単価表の出典は <code>scripts/propertyTxParse.ts</code>{" "}
            に書いてあります。
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <TableWrap>
              <table className="w-full min-w-[380px] text-[11px]">
                <thead className="border-b border-stone-200 bg-stone-50">
                  <tr>
                    <th className={TH}>内訳の傾向</th>
                    <th className={`${TH} text-right`}>件数</th>
                    <th className={`${TH} text-right`}>総額の中央値</th>
                  </tr>
                </thead>
                <tbody>
                  {n.byRatioBand.map((b) => (
                    <tr key={b.order} className="border-b border-stone-100">
                      <td className={TD}>{b.label}</td>
                      <td className={TD_NUM}>{count(b.count)}</td>
                      <td className={TD_NUM}>{yen(b.medianPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>

            <div>
              <p className="mb-2 text-[10px] font-semibold tracking-wider text-stone-600">
                建物比率の分布（0% = 全部が土地代、100% = 全部が建物代）
              </p>
              <Distribution
                buckets={n.buildingRatioHist}
                format={(x0) => `${Math.round(x0 * 100)}%〜`}
              />
            </div>
          </div>
        </Section>

        {/* 築年数・構造 */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Section
            title="築年数別の㎡単価"
            subtitle="築年が分からない成約は集計から外しています。0 年（新築）で埋めると新築の相場が下がって見えるためです。"
          >
            <TableWrap>
              <table className="w-full text-[11px]">
                <thead className="border-b border-stone-200 bg-stone-50">
                  <tr>
                    <th className={TH}>築年数</th>
                    <th className={`${TH} text-right`}>件数</th>
                    <th className={`${TH} text-right`}>㎡単価</th>
                  </tr>
                </thead>
                <tbody>
                  {n.byAge.map((a) => (
                    <tr key={a.order} className="border-b border-stone-100">
                      <td className={TD}>{a.label}</td>
                      <td className={TD_NUM}>{count(a.count)}</td>
                      <td className={TD_NUM}>{perSqm(a.medianUnitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Section>

          <Section
            title="構造別の㎡単価"
            subtitle="RC・鉄骨・木造など。構造は耐用年数と維持費に効くので、同じ㎡単価でも持ち続けたときの負担が変わります。"
          >
            <TableWrap>
              <table className="w-full text-[11px]">
                <thead className="border-b border-stone-200 bg-stone-50">
                  <tr>
                    <th className={TH}>構造</th>
                    <th className={`${TH} text-right`}>件数</th>
                    <th className={`${TH} text-right`}>㎡単価</th>
                  </tr>
                </thead>
                <tbody>
                  {n.byStructure.map((b) => (
                    <tr key={b.structure} className="border-b border-stone-100">
                      <td className={TD}>{b.structure}</td>
                      <td className={TD_NUM}>{count(b.count)}</td>
                      <td className={TD_NUM}>{perSqm(b.medianUnitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Section>
        </div>

        {/* ㎡単価の分布 */}
        <Section
          title="㎡単価の分布"
          subtitle="全国の成約を㎡単価で並べたものです。右に長い裾を引くのが不動産の特徴で、平均より中央値を見るほうが実感に近くなります。"
        >
          <Distribution
            buckets={n.unitPriceHist}
            format={(x0) => `${(x0 / 10_000).toFixed(0)} 万〜`}
          />
        </Section>

        {/* 都道府県別 */}
        <Section
          title="都道府県別の相場と、地価公示との対比"
          subtitle="成約の㎡単価を、同じ県の地価公示（国が毎年出す標準地の価格）と並べています。件数の多い順。"
        >
          <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-700">
            <strong>「公示比」は水準の比較ではありません。</strong>
            成約価格は建物込み、地価公示は更地の価格です。割った数字そのものに意味はありませんが、
            <strong>県をまたいだ相対の並び</strong>
            は読めます。値が大きい県ほど「土地の公示価格に対して、建物を含む取引が高い水準で成立している」ことを示します。
          </div>
          <TableWrap>
            <table className="w-full min-w-[720px] text-[11px]">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className={TH}>都道府県</th>
                  <th className={`${TH} text-right`}>成約件数</th>
                  <th className={`${TH} text-right`}>成約の㎡単価</th>
                  <th className={`${TH} text-right`}>建物比率</th>
                  <th className={`${TH} text-right`}>地価公示の㎡単価</th>
                  <th className={`${TH} text-right`}>公示比</th>
                </tr>
              </thead>
              <tbody>
                {stats.prefectures.map((p) => (
                  <tr key={p.prefecture} className="border-b border-stone-100">
                    <td className={`${TD} font-semibold`}>{p.prefecture}</td>
                    <td className={TD_NUM}>{count(p.count)}</td>
                    <td className={TD_NUM}>{perSqm(p.medianUnitPrice)}</td>
                    <td className={TD_NUM}>{pct(p.medianBuildingRatio)}</td>
                    <td className={TD_NUM}>{perSqm(p.landPriceMedian)}</td>
                    <td className={TD_NUM}>
                      {p.vsLandPrice === null
                        ? "—"
                        : `${p.vsLandPrice.toFixed(2)} 倍`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Section>

        {/* 年次 */}
        <Section
          title="年ごとの推移"
          subtitle="㎡単価の中央値。件数が少ない年は載せていません。"
        >
          <TableWrap>
            <table className="w-full min-w-[420px] text-[11px]">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className={TH}>年</th>
                  <th className={`${TH} text-right`}>成約件数</th>
                  <th className={`${TH} text-right`}>㎡単価の中央値</th>
                </tr>
              </thead>
              <tbody>
                {stats.yearly.map((y) => (
                  <tr key={y.year} className="border-b border-stone-100">
                    <td className={`${TD} font-semibold`}>{y.year} 年</td>
                    <td className={TD_NUM}>{count(y.count)}</td>
                    <td className={TD_NUM}>{perSqm(y.medianUnitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Section>

        <nav className="rounded-3xl border border-gray-200 bg-white p-5 text-[11px] shadow-sm">
          <p className="mb-2 font-bold text-stone-800">関連するページ</p>
          <ul className="flex flex-wrap gap-2">
            {[
              { href: "/relocation/market", label: "家賃相場を分析する" },
              { href: "/relocation/arbitrage", label: "物件を方位で探す" },
              { href: "/relocation/wealth", label: "移住先の地域を比べる" },
            ].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-block rounded-full border border-stone-300 bg-white px-3 py-1.5 font-semibold text-stone-700 transition hover:bg-stone-50"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 leading-relaxed text-stone-600">
            出典:
            国土交通省の不動産情報ライブラリ（成約価格・地価公示）。数字は毎晩の集計で更新されます。
          </p>
        </nav>
      </div>
    </div>
  );
}
