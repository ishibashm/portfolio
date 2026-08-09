import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface ArbitrageSidebarSectionProps {
  title: string;
  summary: string;
  children: ReactNode;
  icon?: ReactNode;
}

/**
 * 物件スキャナー左欄の省スペースな開閉セクション。
 *
 * ネイティブの details/summary を使い、JavaScript が動く前から見出し操作と
 * キーボード操作ができるようにする。現在値の要約は閉じても残す。
 */
export function ArbitrageSidebarSection({
  title,
  summary,
  children,
  icon,
}: ArbitrageSidebarSectionProps) {
  return (
    <details
      data-testid="arbitrage-sidebar-section"
      className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xs dark:border-stone-200 dark:bg-stone-50"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden group-open:border-b group-open:border-gray-100 dark:group-open:border-stone-200">
        <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-500">
          {icon}
          <span className="truncate">{title}</span>
        </h3>
        <span className="flex min-w-0 shrink-0 items-center gap-1.5">
          <span className="max-w-32 truncate text-[10px] font-semibold normal-case tracking-normal text-stone-400">
            {summary}
          </span>
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 group-open:rotate-90"
          />
        </span>
      </summary>
      <div className="space-y-4 p-4">{children}</div>
    </details>
  );
}
