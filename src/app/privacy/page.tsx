import type { Metadata } from "next";
import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  title: "プライバシーポリシー | Cloud Palette",
  description:
    "Cloud Paletteのプライバシーポリシーおよびクッキー、広告配信（Google AdSense等）、アクセス解析に関する取り扱い方針。",
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
              最終更新日: 2026年8月2日
            </p>
          </div>
        </div>

        <div className="space-y-6 text-sm text-slate-700 leading-relaxed font-sans">
          <section>
            <h2 className="text-lg font-bold text-slate-900 font-serif mb-2">
              1. 個人情報の収集と利用
            </h2>
            <p>
              Cloud Palette（以下「当サイト」）では、ユーザーの皆様がサービスをご利用になる際、お問い合わせやアカウント設定等を通じて、メールアドレス等の個人情報を収集する場合があります。収集した情報は、サービスの提供・運営・カスタマーサポートの目的にのみ使用いたします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 font-serif mb-2">
              2. 広告の配信について（Google AdSense等）
            </h2>
            <p>
              当サイトでは、第三者配信の広告サービス（Google AdSense等）を利用しています。広告配信事業者は、ユーザーの興味に応じた広告を表示するためにCookie（クッキー）を使用することがあります。
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
