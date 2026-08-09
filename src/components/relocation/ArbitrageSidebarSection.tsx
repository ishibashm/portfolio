"use client";

import { useId, useState, type ReactNode } from "react";
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
 * 見出し内の disclosure ボタンで、キーボード操作と見出しナビゲーションを
 * 両立する。現在値の要約は閉じても残し、内容は DOM に保持して入力を失わない。
 */
export function ArbitrageSidebarSection({
  title,
  summary,
  children,
  icon,
}: ArbitrageSidebarSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  return (
    <section
      data-testid="arbitrage-sidebar-section"
      className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xs dark:border-stone-200 dark:bg-stone-50"
    >
      <h3>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen((open) => !open)}
          className={`flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left select-none ${
            isOpen ? "border-b border-gray-100 dark:border-stone-200" : ""
          }`}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-500">
            {icon}
            <span className="truncate">{title}</span>
          </span>
          <span className="flex min-w-0 shrink-0 items-center gap-1.5">
            <span className="max-w-32 truncate text-[10px] font-semibold normal-case tracking-normal text-stone-400">
              {summary}
            </span>
            <ChevronRight
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 ${
                isOpen ? "rotate-90" : ""
              }`}
            />
          </span>
        </button>
      </h3>
      <div id={contentId} hidden={!isOpen} className="space-y-4 p-4">
        {children}
      </div>
    </section>
  );
}
