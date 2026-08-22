"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { TIER_BADGE_CLASS, TIER_JP } from "@/utils/tierDisplay";
import type { DayTier } from "@/utils/auspiciousDays";
import { getAuspiciousDayErrorMessage } from "@/lib/auspiciousDayErrors";
import { toLogMessage } from "@/lib/errorMessage";
import {
  adviseTargetDate,
  type DayCandidate,
  type TargetDateRationale,
  type TimelineDay,
} from "@/utils/targetDateRationale";

/**
 * 目標日の根拠を出す。
 *
 * 移住先を比べる画面には目標日の入力欄があるのに、**入れた日が良い日なのか
 * どこにも出ていなかった。**利用者からそのまま指摘を受けている——
 * 「目標日は設定できるけど、その目標日が根拠あるものにするのに」。
 *
 * 答えるのは 3 つだけ。方位ごとに、選んだ日は何段階か／もっと良い日が
 * 近くにあるか／この範囲でいちばん良いのはいつか。押せばその日を目標日に
 * 採れる。全日 × 全方位の一望は時期分析（`/relocation/timing`）の役目で、
 * ここに持ち込むと同じ画面が 2 つになる。
 *
 * **判定は作らない。**段階は timeline が返すものをそのまま読む。並べ替えと
 * 選び方だけが `utils/targetDateRationale`（テスト済み）にある。
 */

/** 目標日の前後どれだけを見るか。片側の日数。 */
const WINDOW_DAYS = 45;

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CandidateButton({
  candidate,
  onAdopt,
}: {
  candidate: DayCandidate;
  onAdopt: (date: string) => void;
}) {
  const dir = candidate.daysFromTarget < 0 ? "前" : "後";
  return (
    <button
      type="button"
      onClick={() => onAdopt(candidate.date)}
      className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-700 transition-colors hover:border-indigo-400 hover:text-indigo-700"
      title={`${candidate.date} を目標日にする`}
    >
      {candidate.date.slice(5)}
      <span className="ml-1 font-normal text-stone-500">
        {candidate.daysAway}日{dir}・{TIER_JP[candidate.tier]}
      </span>
    </button>
  );
}

export function TargetDateAdvice({
  targetDate,
  birthDate,
  lon,
  onAdopt,
}: {
  /** YYYY-MM-DD。空なら何も出さない。 */
  targetDate: string;
  /** 生年月日。本命星と天中殺はここからしか決まらない。 */
  birthDate: string;
  /** 出発地の経度。盤の基準になる。 */
  lon: number | null;
  /** 候補日を押したとき。目標日を差し替える。 */
  onAdopt: (date: string) => void;
}) {
  const [result, setResult] = useState<TargetDateRationale | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!targetDate || !birthDate || lon === null || !Number.isFinite(lon)) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        mode: "timeline",
        birthDate,
        lon: String(lon),
        from: shiftDate(targetDate, -WINDOW_DAYS),
        to: shiftDate(targetDate, WINDOW_DAYS),
      });
      const res = await fetch(`/api/relocation/auspicious-days?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(getAuspiciousDayErrorMessage(json?.error));
        setResult(null);
        return;
      }
      const days: TimelineDay[] = json.days ?? [];
      setResult(adviseTargetDate(days, targetDate));
    } catch (e) {
      console.error("目標日の助言を取得できませんでした:", toLogMessage(e));
      setError(getAuspiciousDayErrorMessage());
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [targetDate, birthDate, lon]);

  /*
    日付欄は 1 文字打つたびに値が変わる（年の途中の 202 なども通る）。
    そのまま投げると 91 日 × 8 方位の走査が何度も走るので、少し待つ。
    片付け関数で前のタイマーを消しているので、最後の 1 回だけが残る。
  */
  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  if (!targetDate) return null;

  if (!birthDate || lon === null || !Number.isFinite(lon)) {
    return (
      <p className="mt-2 text-[11px] text-stone-500">
        生年月日と出発地を入れると、この目標日が方位ごとに何段階かを出します。
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-stone-200 bg-white/70 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold text-stone-700">この目標日はどうか</h3>
        {loading && (
          <span className="flex items-center gap-1 text-[10px] text-stone-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            前後{WINDOW_DAYS}日を確認中
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-[11px] text-rose-700">{error}</p>}

      {result?.target && (
        <p className="mt-1 text-[11px] text-stone-600">
          {targetDate}
          {result.target.rokuyo ? `・${result.target.rokuyo}` : ""}
          {result.target.tags.length > 0
            ? `・${result.target.tags.join("・")}`
            : ""}
          {result.target.blocked && (
            <b className="ml-2 text-rose-700">天中殺（この日は動けません）</b>
          )}
        </p>
      )}

      {result && !result.targetInRange && !loading && !error && (
        <p className="mt-2 text-[11px] text-stone-600">
          この目標日は判定できる範囲の外です。年盤が二度替わる先まで見ると、精度より不確かさが勝つため出していません。
        </p>
      )}

      {result?.targetInRange && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[11px]">
            <thead>
              <tr className="text-[10px] text-stone-500">
                <th className="pb-1 font-normal">方位</th>
                <th className="pb-1 font-normal">目標日</th>
                <th className="pb-1 font-normal">もっと良い日</th>
                <th className="pb-1 font-normal">この前後でいちばん良い日</th>
              </tr>
            </thead>
            <tbody>
              {result.advice.map((a) => (
                <tr key={a.direction} className="border-t border-stone-100">
                  <td className="py-1.5 font-bold text-stone-700">
                    {a.directionLabel}
                  </td>
                  <td className="py-1.5">
                    {/* 段階は色だけで出さない。名前を必ず添える */}
                    {a.tier ? (
                      <span
                        className={`rounded border px-1.5 py-0.5 font-bold ${TIER_BADGE_CLASS[a.tier as DayTier]}`}
                      >
                        {TIER_JP[a.tier as DayTier]}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    {a.better ? (
                      <CandidateButton candidate={a.better} onAdopt={onAdopt} />
                    ) : (
                      <span className="text-stone-400">この前後には無い</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    {a.best ? (
                      <CandidateButton candidate={a.best} onAdopt={onAdopt} />
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-stone-500">
        日付を押すとその日を目標日にします。天中殺で塞がる日は候補に入れていません（段階が良くても動けない日のため）。全期間を一望したいときは引越し時期を分析する画面へ。
      </p>
    </div>
  );
}
