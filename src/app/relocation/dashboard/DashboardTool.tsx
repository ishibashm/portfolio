"use client";

import dynamic from "next/dynamic";

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
  return <SolarTimeClock />;
}
