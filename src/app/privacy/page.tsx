import type { Metadata } from "next";
import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";
import { pageOpenGraph } from "@/lib/siteUrl";
import { EXTERNAL_TRANSMISSIONS } from "@/lib/externalTransmissions";

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
    <div className="min-h-screen bg-background text-ink py-12 px-4 md:px-8">
      {/* 幅は全画面で 1700px に揃える（1/3 と同じ理由）。 */}
      <div className="max-w-[1700px] mx-auto bg-theme-surface backdrop-blur-xl border border-theme-border rounded-3xl p-8 md:p-12 shadow-xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-accent hover:text-accent mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          トップページへ戻る
        </Link>

        <div className="flex items-center gap-3 mb-6 border-b border-theme-border pb-6">
          <div className="p-3 rounded-2xl bg-accent text-on-accent shadow-md">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-serif">
              プライバシーポリシー
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              最終更新日: 2026年11月25日
            </p>
          </div>
        </div>

        <div className="space-y-6 text-sm text-ink leading-relaxed font-sans">
          <section>
            <h2 className="text-lg font-bold text-ink font-serif mb-2">
              1. 個人情報の収集と利用
            </h2>
            <p>
              Cloud
              Palette（以下「当サイト」）では、ユーザーの皆様がサービスをご利用になる際、お問い合わせやアカウント設定等を通じて、メールアドレス等の個人情報を収集する場合があります。収集した情報は、サービスの提供・運営・カスタマーサポートの目的にのみ使用いたします。
            </p>
            <p className="mt-2">
              「しるべと会話で相談する」のAIによる回答は現在停止しており、入力した質問、会話履歴、相談メモ、人物プロフィールを外部の生成AIサービスへ送信していません。
            </p>
            <p className="mt-2 font-bold text-ink">案内役AIについて</p>
            <p className="mt-2">
              案内役の「質問する」欄に入力した質問、直近のやり取り、道具（このサイトの記事検索）の結果の一部は、回答を作るため、Cloudflare,
              Inc.（米国）のAI推論サービス（Workers
              AI）へ送信します。同社は、公表している規約上、送信された内容をAIモデルの学習に使わず、通常の推論では回答を返したあとに内容を保持しません。処理は同社のデータセンターで行われ、日本国外で処理される場合があります（個人情報の保護に関する制度が日本と異なる国を含みます）。
            </p>
            <p className="mt-2">
              氏名・住所・電話番号・メールアドレス・生年月日などの個人情報は入力しないでください。入力された場合は、AIへ送る前に取り除くよう努めますが、すべてを取り除けるとは限りません。
            </p>
            <p className="mt-2">
              会話の流れは、暗号化した状態でこのページの中にだけ保持し、当サイトのサーバーには保存しません。最後の送信から2時間を過ぎるか、「会話を終える」を押すと、続きの会話には使えなくなります。
            </p>
            <p className="mt-2">
              AIの回答は、記事や計算の結果に基づく参考情報です。記事に根拠がないことは「分かりません」とお答えします。1日の利用回数には上限があり、上限に達した日は、AIを使わない定型の案内になります。
            </p>
            <p className="mt-2">
              「しるべと会話で相談する」の会話、相談メモ、人物プロフィールは、ログインしていない場合はこの端末に、ログインしている場合はアカウントにも保存されます。相談メモは画面から個別に削除でき、登録内容の一括削除ではアカウントと端末の両方から削除されます。
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
            <h2 className="text-lg font-bold text-ink font-serif mb-2">
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
                className="text-accent underline font-semibold mx-1"
              >
                Googleの広告設定
              </a>
              から行えます。Googleによる情報の使い方は
              <a
                href="https://policies.google.com/technologies/partner-sites"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline font-semibold mx-1"
              >
                Googleのサービスを使用するサイトやアプリから収集した情報のGoogleによる使用
              </a>
              に説明があります。
            </p>
            <p className="mt-2">
              欧州経済領域（EEA）・英国・スイスからのアクセスでは、同意をいただくまで広告のためのCookieを使わない設定にしています。同意の確認は、Googleが認定した同意管理の仕組みで行います。
            </p>
            <p className="mt-2">
              当サイトは、A8.netのアフィリエイトプログラム（成果報酬型の広告）に参加しています。掲載ページのリンクから商品やサービスを申し込むと、当サイトが紹介料を受け取ることがあります。アフィリエイトの広告枠には「広告」と表示します。紹介料の有無によって、方位の判定や記事の結論を変えることはありません。成果の確認のため、A8.netなどの提供元がCookie（クッキー）を使用することがあります。
            </p>
            <p className="mt-2">
              日本の電気通信事業法が定める外部送信について、広告配信のためにCookieをGoogle（AdSense）へ、成果の確認のためにCookieをアフィリエイトの提供元へ送ることがあります。送るのは広告と成果の確認に必要な識別子です。生年月日や出発地の座標は、広告のCookieには載せません。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink font-serif mb-2">
              3. アクセス解析ツールについて
            </h2>
            <p>
              当サイトでは、サービスの利便性向上およびトラフィック分析のため、アクセス解析ツールを使用する場合があります。これらのツールはデータ収集のためにCookieを使用していますが、収集されるデータは匿名であり、個人を特定するものではありません。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink font-serif mb-2">
              4. 外部への送信について（利用者情報の外部送信）
            </h2>
            <p>
              当サイトのページを表示すると、次の事業者へ、お使いのブラウザから情報が送信されることがあります（電気通信事業法の外部送信規律に基づく公表）。送信される情報は、どの事業者でも共通して、IPアドレス、ブラウザの種類などの端末の情報、表示したページのURL、参照元のURL、日時です。事業者によっては、これに加えてCookieなどの識別子が送信されます。
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-theme-border text-left">
                    <th className="py-2 pr-3 font-semibold">送信先</th>
                    <th className="py-2 pr-3 font-semibold">
                      送信されるページ・場面
                    </th>
                    <th className="py-2 font-semibold">目的</th>
                  </tr>
                </thead>
                <tbody>
                  {EXTERNAL_TRANSMISSIONS.map((t) => (
                    <tr
                      key={t.recipient}
                      className="border-b border-theme-border align-top"
                    >
                      <td className="py-2 pr-3">
                        <a
                          href={t.policy}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent underline"
                        >
                          {t.recipient}
                        </a>
                      </td>
                      <td className="py-2 pr-3">{t.where}</td>
                      <td className="py-2">{t.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2">
              生年月日・出生地・出発地の座標・相談の内容は、上の事業者へ送りません。広告とアフィリエイトのCookieは、ブラウザの設定で削除・拒否できます（拒否しても、方位と日取りの計算はすべてご利用いただけます）。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink font-serif mb-2">
              5. 免責事項
            </h2>
            <p>
              当サイトで提供する太陽時計算、方位・暦情報、不動産データ、株式・トレンド分析情報等のコンテンツについて、正確性・安全性を保証するものではありません。当サイトの情報を利用したことによって生じたトラブルや損害等について、当サイトは一切の責任を負いかねます。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink font-serif mb-2">
              6. お問い合わせ
            </h2>
            <p>
              プライバシーポリシーに関するお問い合わせは、
              <Link
                href="/contact"
                className="text-accent underline font-semibold mx-1"
              >
                お問い合わせページ
              </Link>
              からお願いいたします。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
