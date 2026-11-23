import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME, SITE_DESCRIPTION, CORE_ROUTES } from "@/lib/siteStructure";
import { pageOpenGraph } from "@/lib/siteUrl";
import { YouTubeChannelLinks } from "@/components/YouTubeChannelLinks";

/**
 * 運営者情報とデータの出典。
 *
 * AdSense の審査では、誰が運営していて何を根拠に情報を出しているかが見られる。
 * 判定の限界と免責もここに明記しておく。占いの判定を断定的に出すページなので、
 * 何を保証していないかを書いておかないと誤解を招く。
 */
const TITLE = "このサイトについて";
const DESCRIPTION = `${SITE_NAME}の運営者情報、データの出典、判定の考え方、免責事項について説明しています。`;

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: TITLE,
  description: DESCRIPTION,
  openGraph: pageOpenGraph("/about", TITLE, DESCRIPTION),
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-ink font-sans">
      {/* 幅は全画面で 1700px に揃える（/guide/[slug] と同じ理由）。 */}
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <h1 className="text-3xl font-bold font-serif tracking-tight">
          このサイトについて
        </h1>

        <section className="mt-8">
          <h2 className="text-lg font-bold font-serif border-b border-theme-border pb-2">
            何をするサイトか
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink">
            {SITE_DESCRIPTION}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            募集物件の掲載は2026年9月に終了しました。最新の募集は各社のサイトでご確認ください。
          </p>
          <ul className="mt-4 flex flex-wrap gap-2 text-sm">
            {CORE_ROUTES.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  className="block rounded-full border border-theme-border px-3 py-1.5 font-semibold hover:text-accent"
                >
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/*
          「何をするサイトか」は機能の一覧で、**決めるときに何の役に立つか**は
          どこにも書いていなかった（記事 29 本もすべて個別の論点で、入口が無い）。
          判定を断定的に出す画面がある一方、**しないこと**を正面から書いた場所が
          免責しか無いのは案内として足りない。ここに置く。

          **移り変わる数字を書かないこと。**掲載を集計できた市区町村の数は
          毎晩の巡回で動くので、ここに書くと確実に古くなる（CLAUDE.md 4 節の
          「残数は必ず実測してから言う」と同じ理由）。構造だけを書く。
        */}
        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-theme-border pb-2">
            決めるために、この道具が何をするか
          </h2>
          <dl className="mt-4 text-sm text-ink space-y-3">
            <div>
              <dt className="font-bold text-xs text-ink-muted">候補を絞る</dt>
              <dd className="leading-relaxed">
                動ける日の方位と住まいの統計から、候補の街を絞ります。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-ink-muted">
                前提を1つに固定する
              </dt>
              <dd className="leading-relaxed">
                「使用中のプロフィール」を共有し、各画面に「この設定でこの方位を出しています」と表示します。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-ink-muted">
                分からないことは、分からないと書く
              </dt>
              <dd className="leading-relaxed">
                統計のある街を表示し、流派で判定が分かれる箇所は両方を併記します。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-ink-muted">
                「動かない」も答えとして出す
              </dt>
              <dd className="leading-relaxed">
                避ける目安となる方位や時期を示し、見送る判断にも使えます。
              </dd>
            </div>
          </dl>
          <details className="mt-4 rounded-2xl border border-theme-border p-3 text-sm">
            <summary className="cursor-pointer font-semibold">
              候補に出る街と判定の前提
            </summary>
            <div className="mt-2 space-y-2 leading-relaxed">
              <p>
                指定した距離の範囲に家賃や空き家率の統計がある街がなければ、候補が出ないことがあります。
              </p>
              <p>
                生年月日と出発地は同じプロフィールから読み込みます。方位磁針で測ると別の方位に見える地点には注意を添えます。背景は
                <Link
                  href="/blog/where-feng-shui-came-from"
                  className="underline hover:text-accent"
                >
                  風水はどこから来たのか
                </Link>
                で紹介しています。
              </p>
            </div>
          </details>
          <p className="mt-4 text-sm leading-relaxed">
            方位の吉凶は占い上の目安です。家賃、災害リスク、契約、通勤などの条件は別に確かめてください。
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <li>
              <Link
                href="/blog/where-kigaku-and-houi-came-from"
                className="underline hover:text-accent"
              >
                九星気学と方位はどこから来たのか
              </Link>
            </li>
            <li>
              <Link href="/guide" className="underline hover:text-accent">
                使い方の案内
              </Link>
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-theme-border pb-2">
            データの出典
          </h2>
          <dl className="mt-4 text-sm text-ink space-y-3">
            <div>
              <dt className="font-bold text-xs text-ink-muted">住まいの統計</dt>
              <dd className="leading-relaxed">
                家賃・空き家率はe-Stat「統計でみる市区町村のすがた」（2023年住宅・土地統計調査）、成約価格・地価公示は国土交通省の公開データを使います。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-ink-muted">座標</dt>
              <dd className="leading-relaxed">
                国土地理院の住所検索APIを用いて住所から求めています。番地まで特定できない場合は町丁目の代表点になります。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-ink-muted">地域の統計</dt>
              <dd className="leading-relaxed">
                市区町村ごとの所得統計など、公的に公開されている統計を利用しています。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-xs text-ink-muted">
                方位・暦の計算
              </dt>
              <dd className="leading-relaxed">
                判定の基準は常に真北です。暦の日付は日本時間で切り替えます。
                <details className="mt-2 rounded-2xl border border-theme-border p-3">
                  <summary className="cursor-pointer font-semibold">
                    方位・暦の算出方法
                  </summary>
                  <p className="mt-2">
                    出発地から目的地への大圏方位角で方位を求めます。磁北は測り方の注意にのみ使い、出発地の地磁気偏角を取得できない場合は補正しません。九星気学の方位盤、六曜、天赦日・一粒万倍日、天中殺、土用はサイト内で計算します。
                  </p>
                </details>
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-theme-border pb-2">
            判定について（免責）
          </h2>
          <ul className="mt-4 text-sm text-ink space-y-2 list-disc pl-5 leading-relaxed">
            <li>
              九星気学は伝統的な考え方であり、科学的に効果が確認されたものではありません。判定結果は参考情報としてご利用ください。
            </li>
            <li>流派によって方位や吉凶の考え方は異なります。</li>
            <li>
              住まいの統計は地域の目安です。実際の物件条件は各社のサイトでご確認ください。
            </li>
            <li>
              本サイトの情報を用いた判断によって生じた損害について、運営者は責任を負いかねます。
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-theme-border pb-2">
            運営者
          </h2>
          <dl className="mt-4 text-sm text-ink space-y-2">
            <div className="flex gap-3">
              <dt className="font-bold text-xs text-ink-muted w-24 shrink-0 pt-0.5">
                運営
              </dt>
              <dd>M. Ishibashi</dd>
            </div>
            <div className="flex gap-3">
              <dt className="font-bold text-xs text-ink-muted w-24 shrink-0 pt-0.5">
                サイト名
              </dt>
              <dd>{SITE_NAME}（cloud-palette.com）</dd>
            </div>
            <div className="flex gap-3">
              <dt className="font-bold text-xs text-ink-muted w-24 shrink-0 pt-0.5">
                連絡先
              </dt>
              <dd>
                <Link
                  href="/contact"
                  className="font-semibold hover:text-accent underline"
                >
                  お問い合わせフォーム
                </Link>
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-theme-border pb-2">
            動画
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink">
            運営している YouTube チャンネルです。
          </p>
          <YouTubeChannelLinks className="mt-4 space-y-2 text-sm text-ink" />
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold font-serif border-b border-theme-border pb-2">
            広告について
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink">
            第三者配信の広告を利用する場合があります。A8.netのアフィリエイトプログラムに参加しており、リンク経由の申し込みで紹介料を受け取ることがあります。対象の広告枠には「広告」と表示します。紹介料は判定や記事の結論には影響しません。
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <li>
              <Link href="/privacy" className="underline hover:text-accent">
                プライバシーポリシー
              </Link>
            </li>
            <li>
              <Link href="/editorial" className="underline hover:text-accent">
                編集方針
              </Link>
            </li>
          </ul>
        </section>
      </article>
    </div>
  );
}
