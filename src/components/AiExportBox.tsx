/**
 * 「AI に渡す」文書。JS 無しでも読み取り専用の textarea で選べる。
 * コピーボタンは JS があるときだけ動く。緑と赤は使わない
 * （判定の印以外には使わない、という色の約束）。
 */
import { AiExportCopyButton } from "@/components/AiExportCopyButton";

export function AiExportBox({
  markdown,
  heading = "AI に渡す",
  className = "wg-card space-y-3 p-6",
}: {
  markdown: string;
  heading?: string;
  className?: string;
}) {
  return (
    <section aria-labelledby="ai-export-heading" className={className}>
      <h2 id="ai-export-heading" className="text-xl font-bold">
        {heading}
      </h2>
      <p className="text-sm text-slate-700">
        計算結果を、お使いの AI
        に貼り付けて続きを相談できます。この文書には生年月日と座標を入れていません。
      </p>
      <textarea
        readOnly
        rows={16}
        defaultValue={markdown}
        aria-label="AI に渡す用の文書"
        className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-800"
      />
      <AiExportCopyButton text={markdown} />
    </section>
  );
}
