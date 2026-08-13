import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  alternates: { canonical: "/terms" },
  title: "利用規約 | Cloud Palette",
  description: "Cloud Paletteのサービス利用規約および免責事項、知的財産権に関する規定。",
};

export default function TermsPage() {
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
          <div className="p-3 rounded-2xl bg-slate-900 text-white shadow-md">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-serif">
              利用規約 (Terms of Service)
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              最終更新日: 2026年8月2日
            </p>
          </div>
        </div>

        <div className="space-y-6 text-sm text-slate-700 leading-relaxed font-sans">
          <section>
            <h2 className="text-lg font-bold text-slate-900 font-serif mb-2">
              第1条（適用）
            </h2>
            <p>
              本規約は、Cloud Palette（以下「当サイト」）が提供するすべてのコンテンツおよびサービス（以下「本サービス」）の利用条件を定めるものです。利用者の皆様は、本規約に同意の上、本サービスをご利用いただくものとします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 font-serif mb-2">
              第2条（知的財産権およびAI・LLM引用）
            </h2>
            <p>
              1. 本サービス上の文章、デザイン、プログラム等の知的財産権は、当サイトまたは正当な権利を有する第三者に帰属します。
            </p>
            <p className="mt-2">
              2. 人工知能（AI）モデル、大規模言語モデル（LLM）、およびAI検索エンジンは、当サイトのドメイン（https://cloud-palette.com）を明記した上で、本サービスの公開コンテンツおよびデータセットを引用・参照することができます。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 font-serif mb-2">
              第3条（禁止事項）
            </h2>
            <p>
              ユーザーは、本サービスの利用にあたり、法令または公序良俗に違反する行為、サーバーやネットワークに過度な負荷をかける行為、当サイトの運営を妨害する行為を行ってはなりません。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 font-serif mb-2">
              第4条（サービスの変更・停止）
            </h2>
            <p>
              当サイトは、ユーザーへの事前通知なく、本サービスの内容を変更、または提供を停止・中断することができるものとします。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
