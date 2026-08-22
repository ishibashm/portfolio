"use client";

import dynamic from "next/dynamic";
import type { YieldCell } from "@/utils/yieldStats";

/**
 * 利回りの地図の読み込み口。
 *
 * ## なぜ包むのか
 *
 * `react-simple-maps` は描画時に `window` を触るので、サーバ側で先に
 * 描かせると落ちる。`ssr: false` で外す必要がある。
 *
 * **ところが `ssr: false` は Server Component の中では使えない**
 * （Next.js 16）。頁側（/relocation/yield）は metadata を出すので
 * Server Component であり、そこに直接書くと**ビルドが落ちる。**
 *
 * 実際に落とした。しかも CI が `npm run build` を見ていなかったため
 * 気付かず、**デプロイが 8 回連続で失敗していた**（#497〜#506）。
 *
 * `"use client"` を付けたこの薄い層で `dynamic` を呼び、頁からは
 * ただの部品として読む。`ArbitrageMap` / `ArbitrageMapInner` と同じ形で、
 * このリポジトリで既に決まっているやり方に揃えてある。
 */
const YieldMapInner = dynamic(
  () => import("./YieldMapInner").then((m) => m.YieldMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center rounded-2xl border border-stone-200 bg-stone-50">
        <p className="text-xs text-stone-500">地図を読み込んでいます…</p>
      </div>
    ),
  },
);

export function YieldMap({ cells }: { cells: YieldCell[] }) {
  return <YieldMapInner cells={cells} />;
}
