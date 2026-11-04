"use client";

import { useEffect, useRef, useState } from "react";
import type { DayVerdict } from "@/utils/auspiciousDays";
import { isAuspiciousStatus } from "@/utils/noiseSeverity";
import { toJapanDateString } from "@/utils/japanDate";

type Summary = { directionLabel: string; days: DayVerdict[] };
type Candidate = { date: string; directions: string[] };

/** All candidates have the existing triple-auspicious grade; ties use earliest date. */
export function topCandidateDates(
  summaries: Summary[],
  from: string,
  to: string,
): Candidate[] {
  const dates = new Map<string, Set<string>>();
  for (const summary of summaries)
    for (const day of summary.days) {
      if (
        day.date < from ||
        day.date > to ||
        day.blockedByTenchusatsu ||
        !day.isTripleAuspicious ||
        !isAuspiciousStatus(day.dayLayer)
      )
        continue;
      const directions = dates.get(day.date) ?? new Set<string>();
      directions.add(summary.directionLabel);
      dates.set(day.date, directions);
    }
  return [...dates]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 3)
    .map(([date, directions]) => ({ date, directions: [...directions] }));
}

export function CandidateDates({
  birthDate,
  lon,
  ready,
  directionFilterMode,
}: {
  birthDate: string;
  lon: number;
  ready: boolean;
  directionFilterMode: string;
}) {
  const [result, setResult] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setResult(null);
    setError("");
    setLoading(false);
    return () => {
      revision.current++;
    };
  }, [birthDate, lon, ready, directionFilterMode]);
  async function search() {
    const request = ++revision.current;
    setLoading(true);
    setError("");
    setResult(null);
    const from = toJapanDateString(new Date());
    const to = toJapanDateString(
      new Date(Date.parse(`${from}T12:00:00+09:00`) + 59 * 86400000),
    );
    try {
      const params = new URLSearchParams({
        birthDate,
        lon: String(lon),
        from,
        to,
        direction: "all",
        scope: "triple",
        directionFilterMode,
      });
      const response = await fetch(`/api/relocation/auspicious-days?${params}`);
      if (!response.ok) throw new Error("unavailable");
      const body = await response.json();
      const dates = topCandidateDates(body.summaries, from, to);
      if (request === revision.current) setResult(dates);
    } catch {
      if (request === revision.current)
        setError("候補日を取得できませんでした。もう一度お試しください。");
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }
  return (
    <section
      className="w-full rounded-2xl border border-stone-200 bg-white p-4"
      aria-label="引越しの候補日"
    >
      <button
        type="button"
        disabled={!ready || loading}
        onClick={search}
        className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {loading ? "候補日を計算中…" : "候補日を出す"}
      </button>
      <p className="mt-2 text-xs text-stone-600">
        今日から60日間で三盤の総合判定と日盤が吉の日を、日付順に最大3件表示します。
      </p>
      {!ready && (
        <p className="mt-2 text-sm">
          プロフィールで生年月日と出発地を登録してください。
        </p>
      )}
      <div aria-live="polite">
        {error && <p className="mt-2 text-sm">{error}</p>}
        {result?.length === 0 && (
          <p className="mt-2 text-sm">
            この60日間には条件に合う候補日がありません。
          </p>
        )}
        {!!result?.length && (
          <ol className="mt-3 space-y-2 text-sm">
            {result.map((day) => (
              <li key={day.date}>
                <time>{day.date}</time>：{day.directions.join("・")}（吉）
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
