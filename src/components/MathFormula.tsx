"use client";

import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";

/**
 * 数式を 1 つ描く。**KaTeX をここだけに閉じ込めるための包み。**
 *
 * KaTeX はビルド後で 460 KB（gzip 126 KB）あり、このアプリで一番大きい
 * チャンク。ところが数式が出るのはホームの「総合スコア」タブの中の
 * 計算式の内訳だけで、他の画面・他のタブでは 1 つも使わない。
 *
 * それまでは SolarTimeClock が react-katex を静的に import していたため、
 * ホームを開いた全員がこの 460 KB を読み、パースしていた。転送量より
 * パースと実行のほうが効くので、CPU の遅い端末ほど待たされる。
 *
 * CSS も同じ理由でここに置く。以前は app/layout.tsx にあり、
 * 数式を出さないページも含めてサイト全体に配られていた。
 *
 * 呼ぶ側は next/dynamic で読み込むこと（静的 import に戻すと元に戻る）。
 */
export default function MathFormula({ math }: { math: string }) {
  return <InlineMath math={math} />;
}
