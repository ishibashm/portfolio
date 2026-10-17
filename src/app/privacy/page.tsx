import type { Metadata } from "next";
import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";
import { pageOpenGraph } from "@/lib/siteUrl";

const TITLE = "プライバシーポリシー";
const DESCRIPTION =
  "Cloud Paletteのプライバシーポリシーおよびクッキー、広告配信（Google AdSense等）、アクセス解析に関する取り扱い方針。";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  title: TITLE,
  description: DESCRIPTION,
  openGraph: pageOpenGraph("/privacy", TITLE, DESCRIPTION),
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 py-12 px-4 md:px-8">
      {/* 幅は全画面で 1700px に揃える（1/3 と同じ理由）。 */}
      <div className="max-w-[1700px] mx-auto bg-white/90 backdrop-blur-xl border border-slate-300 rounded-3xl p-8 md:p-12 shadow-xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-rose-600 hover:text-rose-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          トップページへ戻る
        </Link>

        <div className="flex items-center gap-3 mb-6 border-b border-slate-200 pb-6">
          <div className="p-3 rounded-2xl bg-rose-500 text-white shadow-md">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-serif">
              プライバシーポリシー
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              最終更新日: 2026年10月17日
            </p>
          </div>
        </div>

        <div className="space-y-6 text-sm text-slate-700 leading-relaxed font-sans">
          <section>
            <h2 className="text-lg font-bold text-slate-900 font-serif mb-2">
              1. 個人情報の収集と利用
            </h2>
            <p>
              Cloud
              Palette（以下「当サイト」）では、ユーザーの皆様がサービスをご利用になる際、お問い合わせやアカウント設定等を通じて、メールアドレス等の個人情報を収集する場合があります。収集した情報は、サービスの提供・運営・カスタマーサポートの目的にのみ使用いたします。
            </p>
            <p className="mt-2">
              「エージェントに案内してもらう」で入力した質問、会話履歴、相談メモ、選択した人物プロフィールは、回答を生成するためGoogleの生成AIサービスへ送信されます。本名、連絡先、詳しい住所などは入力しないでください。
            </p>
            <p className="mt-2">
              「エージェントに案内してもらう」の会話、相談メモ、人物プロフィールは、ログインしていない場合はこの端末に、ログインしている場合はアカウントにも保存されます。相談メモは画面から個別に削除でき、登録内容の一括削除ではアカウントと端末の両方から削除されます。
            </p>
            <p className="mt-2">
              計算の結果をお伝えしたあと、案内役のしるべが「結果を保存する」をご案内することがあります（1つの相談につき1回まで。ログイン中は表示しません）。案内を表示した相談と「今はしない」を選んだ日時は、同じ案内を繰り返さないためにこの端末のCookie（cp_save_offer）にだけ記録し、「今はしない」から7日間は案内しません。案内の表示・選択の回数は、個人を特定できる情報（アカウント、メールアドレス、IPアドレス、相談の内容）を含めない形で集計します。保存しなくても、すべての機能をご利用いただけます。
            </p>
            <p className="mt-2">
              ログインは、Googleアカウントのほか、メールアドレスに届くログイン用のリンクでも行えます（提供している場合）。メールアドレスは、ログインと、同意いただいた場合のお知らせに使います。
            </p>
            <p className="mt-2">
              吉日のお知らせ（メール）は、ログインしたうえで、お知らせごとに同意のチェックを入れて設定した場合にだけお送りします。お知らせする日付・方位・何日前に送るか、同意した日時と同意した時点のポリシーの版を記録し、ログインに使っているメールアドレスへ送ります。生年月日はメールに書きません。メールの送信は、委託先のResend,
              Inc.（米国）のサービスを使って行います。同社に渡すのは、送信に必要な送り先のメールアドレスとメールの本文だけです（米国の個人情報保護の制度は日本と異なります）。お知らせは、メールの「お知らせを止める」のリンク、またはアカウントのページからいつでも止められ、設定済みのお知らせも取り消されます。お知らせの記録は吉日から30日を過ぎたら削除し、登録内容の一括削除ではお知らせと同意の記録も削除します。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 font-serif mb-2">
              2. 広告の配信について（Google AdSense等）
            </h2>
            <p>
              当サイトでは、第三者配信の広告サービス（Google
              AdSense等）を利用しています。広告配信事業者は、ユーザーの興味に応じた広告を表示するためにCookie（クッキー）を使用することがあります。
            </p>
            <p className="mt-2">
              Cookieを使用することにより、当サイトや他サイトへの過去のアクセス情報に基づいた広告の配信が可能となります。パーソナライズ広告を無効にする設定は、
              <a
                href="https://www.google.com/settings/ads"
                target="_blank"
                rel="noopener noreferrer"
                className="text-rose-600 underline font-semibold mx-1"
              >
                Googleの広告設定
              </a>
              から行えます。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 font-serif mb-2">
              3. アクセス解析ツールについて
            </h2>
            <p>
              当サイトでは、サービスの利便性向上およびトラフィック分析のため、アクセス解析ツールを使用する場合があります。これらのツールはデータ収集のためにCookieを使用していますが、収集されるデータは匿名であり、個人を特定するものではありません。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 font-serif mb-2">
              4. 免責事項
            </h2>
            <p>
              当サイトで提供する太陽時計算、方位・暦情報、不動産データ、株式・トレンド分析情報等のコンテンツについて、正確性・安全性を保証するものではありません。当サイトの情報を利用したことによって生じたトラブルや損害等について、当サイトは一切の責任を負いかねます。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 font-serif mb-2">
              5. お問い合わせ
            </h2>
            <p>
              プライバシーポリシーに関するお問い合わせは、当サイトの問い合わせ窓口までお願いいたします。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
