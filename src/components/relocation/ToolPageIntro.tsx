import Link from "next/link";

/**
 * 操作して使う道具ページの、サーバー側で出す導入文。
 *
 * 本体がクライアントコンポーネントだと、入力前の HTML に説明が少なく、
 * 検索や広告審査では未完成の頁に見えやすい。レイアウト側に置けば、
 * 道具そのものを変えずに説明とガイドへの案内を残せる。
 */
export function ToolPageIntro({
  title,
  children,
  guideHref,
  guideLabel,
}: {
  title?: string;
  children: React.ReactNode;
  guideHref: string;
  guideLabel: string;
}) {
  return (
    <div className="mx-auto max-w-[1700px] px-4 pt-6 md:px-8">
      {title ? (
        <p className="text-xs font-bold tracking-wide text-slate-500">
          {title}
        </p>
      ) : null}
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-slate-700">
        {children}
      </p>
      <p className="mt-2 text-xs text-slate-600">
        <Link href={guideHref} className="underline hover:text-rose-600">
          {guideLabel}
        </Link>
      </p>
    </div>
  );
}
