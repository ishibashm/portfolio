"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { TIER_LABELS, type DayTier } from "@/utils/auspiciousDays";
import { TIER_FILL, BLOCKED_FILL } from "@/utils/tierDisplay";

/**
 * カレンダーヒートマップで選んだ日の吹き出し。
 *
 * 以前はマスを押しても、詳細が**ヒートマップの下**に出るだけだった。
 * 見通しは 21 か月ぶんあるので、上のほうのマスを押すと画面外まで
 * スクロールしないと結果が見えない（利用者報告）。`title` 属性の
 * 説明も付けてあったが、**触る画面では出ない**ので、iPad からは
 * 押しても何も起きていないように見えていた。
 *
 * 詳細（全方位・県の地図）は下に残す。ここは「押したマスが何だったか」
 * だけをその場で返す。
 */

/** 吹き出しの幅。マスが小さいので、中身に合わせず固定にする。 */
export const POPOVER_WIDTH = 232;

/**
 * 器の中に収まる横位置。
 *
 * 端のマス（月初・月末）をそのまま中心に置くと、吹き出しが器から
 * はみ出して欠ける。器より吹き出しが広いときは中央に置く。
 */
export function clampPopoverX(
  x: number,
  containerWidth: number,
  width: number = POPOVER_WIDTH,
): number {
  const half = width / 2;
  if (containerWidth <= width) return containerWidth / 2;
  return Math.min(Math.max(x, half + 4), containerWidth - half - 4);
}

export interface PopoverDay {
  date: string;
  weekday: number;
  rokuyo: string;
  tags: string[];
  blocked: boolean;
}

export function DayCellPopover({
  day,
  tier,
  directionLabel,
  filteredOut,
  x,
  y,
  below,
  containerWidth,
  onClose,
  onShowAll,
}: {
  day: PopoverDay;
  tier: DayTier;
  /** いま見ている方位。未選択のときは段階を出さない */
  directionLabel: string | null;
  /** 絞り込みから外れているマスか */
  filteredOut: boolean;
  /** 器の左上から見たマスの中心（横）と上端（縦） */
  x: number;
  y: number;
  /** マスの下に出すか。上に置くと器からはみ出すときだけ真 */
  below: boolean;
  containerWidth: number;
  onClose: () => void;
  /** 全方位の詳細へ送る */
  onShowAll: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const weekday = "日月火水木金土"[day.weekday] ?? "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    /* 外を押したら閉じる。マスを押したときは、閉じたあとに click で
       開き直るので出たままになる。 */
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${day.date} の判定`}
      className="absolute z-30 rounded-xl border border-stone-300 bg-white p-3 text-left shadow-lg"
      style={{
        width: POPOVER_WIDTH,
        left: clampPopoverX(x, containerWidth),
        top: y,
        transform: below
          ? "translate(-50%, 28px)"
          : "translate(-50%, calc(-100% - 8px))",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-bold text-stone-800">
          {day.date}（{weekday}）
        </div>
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="-mt-1 shrink-0 px-1 text-sm leading-none text-stone-500 hover:text-stone-800"
        >
          ×
        </button>
      </div>

      {directionLabel && (
        <div className="mt-2 flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
            style={{ background: day.blocked ? BLOCKED_FILL : TIER_FILL[tier] }}
          >
            {day.blocked ? "天中殺" : TIER_LABELS[tier]}
          </span>
          <span className="text-[11px] text-stone-600">
            {directionLabel}へ動く場合
          </span>
        </div>
      )}

      <div className="mt-2 text-[11px] leading-relaxed text-stone-600">
        {day.rokuyo}
        {day.tags.length ? ` / ${day.tags.join("・")}` : ""}
      </div>
      {filteredOut && (
        <div className="mt-1 text-[11px] text-stone-500">
          いまの絞り込みからは外れています。
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        <button
          onClick={onShowAll}
          className="text-left text-[11px] font-semibold text-indigo-600 underline"
        >
          この日の全方位を見る
        </button>
        <Link
          href={`/relocation/arbitrage?targetDate=${day.date}&view=overview`}
          className="text-[11px] font-semibold text-indigo-600 underline"
        >
          この日で物件スキャナーを開く
        </Link>
      </div>
    </div>
  );
}
