import {
  buildCurrentDirections,
  buildTodayBoard,
  TOKYO_LONGITUDE,
} from "@/lib/todayDirections";

export function buildRelocationDashboardSummary(now: Date) {
  const { common } = buildTodayBoard(now);
  const { date, branch, start, end } = buildCurrentDirections(
    now,
    undefined,
    TOKYO_LONGITUDE,
  );
  return { date, common, branch, start, end };
}
