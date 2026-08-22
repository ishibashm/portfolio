import type { Metadata } from "next";
import { AppraisalForm } from "./AppraisalForm";

/**
 * 持ち込み査定（/relocation/appraisal）。
 *
 * 検討中の物件を 1 件入力して、近所の成約の分布に当てる。
 *
 * **売出価格を集めているのではない。**ポータル（SUUMO・HOMES・
 * アットホーム）は規約で収集を禁じており、一般開発者向けの公式 API も
 * 無い。利用者が 1 件を手で入力して評価するのは収集ではないので、
 * 規約に触れない。
 *
 * 冒頭で「分母は成約価格」と言うのは /relocation/yield と同じ理由。
 * ポータルの相場は売主の希望額を並べたもので、成立した額ではない。
 */

export const metadata: Metadata = {
  title: "この物件は高いか安いか | Cloud Palette",
  description:
    "検討中のマンションを入力すると、近所で実際に成立した成約価格の分布のどこにあるかを出します。売出価格ではなく成約価格で比べます。",
};

export default function AppraisalPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-stone-50 via-stone-50 to-blue-50/40 p-4 text-stone-800 md:p-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <header>
          <h1 className="font-serif text-2xl font-bold text-stone-900">
            この物件は高いか安いか
          </h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-stone-600">
            検討中のマンションを入力すると、
            <strong>近所で実際に成立した成約価格</strong>
            の分布のどこにあるかを出します。ポータルに出ている相場は売主の希望額を並べたもので、成立した額ではありません。
          </p>
          <p className="mt-2 max-w-[70ch] text-[11px] leading-relaxed text-stone-500">
            入力した内容は保存していません。この画面を閉じると残りません。
          </p>
        </header>

        <AppraisalForm />
      </div>
    </main>
  );
}
