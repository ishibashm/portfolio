"use client";

import dynamic from "next/dynamic";
import { ActiveProfileBadge } from "@/components/profile/ActiveProfileBadge";

const SolarTimeClock = dynamic(
  () => import("@/components/SolarTimeClock").then((mod) => mod.SolarTimeClock),
  { ssr: false, loading: ClockPlaceholder },
);

function ClockPlaceholder() {
  return (
    <div
      role="status"
      className="flex h-80 items-center justify-center rounded-2xl border border-theme-border bg-theme-surface text-sm text-ink-muted"
    >
      読み込んでいます…
    </div>
  );
}

export default function DashboardTool() {
  return (
    <>
      <ActiveProfileBadge purpose="今日の方位と時刻" className="my-3" />
      <SolarTimeClock />
    </>
  );
}
