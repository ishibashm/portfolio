"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, CalendarCheck } from "lucide-react";
import {
  ALL_DIRECTIONS,
  DIRECTION_LABELS,
} from "@/utils/auspiciousDays";
import {
  DEFAULT_TENCHUSATSU_MODE,
  TENCHUSATSU_MODES,
} from "@/utils/tenchusatsuPolicy";

/**
 * 「年盤・月盤・日盤がすべて吉になる日」を列挙するパネル。
 *
 * これまで三盤の重ね合わせはヒートマップを目で追うしかなく、
 * 「今日から立春までに何日あるのか」「そのうちどれが天赦日か」を
 * 日付として取り出せなかった。引越し業者の予約や契約日の調整は
 * 日付が確定して初めて動かせるので、そこに接続できる形で出す。
 *
 * 天中殺で落ちる日も消さずに印を付ける。落とした結果だけを見せると
 * 「天中殺を勘定に入れるかどうかで何日変わるのか」が分からなくなり、
 * その判断自体ができない。
 */

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const STATUS_LABELS: Record<string, string> = {
  OPTIMAL: "大吉",
  OPTIMAL_REGULAR: "吉",
  SAFE: "平",
  WARNING: "注意",
  NOISE_GOU: "五黄殺",
  NOISE_ANKEN: "暗剣殺",
  NOISE_HA: "歳破/月破",
  NOISE_HONMEI: "本命殺",
  NOISE_TEKI: "本命的殺",
  NOISE_GETSUMEI: "月命殺",
  NOISE_GETSUTEKI: "月命的殺",
  NOISE_VOID: "空亡",
  NOISE_NODE: "月交点",
  NOISE_TENCHU: "天中殺",
};

const label = (s: string) => STATUS_LABELS[s] ?? s;

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface DayVerdict {
  date: string;
  weekday: number;
  yearLayer: string;
  monthLayer: string;
  dayLayer: string;
  blockedByTenchusatsu: boolean;
  voidScopes: { year: boolean; month: boolean; day: boolean };
  tags: string[];
}

interface Summary {
  direction: string;
  directionLabel: string;
  scannedDays: number;
  tripleAuspiciousDays: number;
  availableDays: number;
  blockedByTenchusatsuDays: number;
  window: {
    yearBoardValidUntil: string | null;
    afterYearBoardStatus: string | null;
  };
  days: DayVerdict[];
}

export function AuspiciousDayFinder() {
  const [birthDate, setBirthDate] = useState("");
  const [lon, setLon] = useState("");
  const [direction, setDirection] = useState("all");
  const [tenchusatsuMode, setTenchusatsuMode] = useState<string>(
    DEFAULT_TENCHUSATSU_MODE,
  );
  const [from, setFrom] = useState(todayString());
  const [months, setMonths] = useState(12);

  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [meta, setMeta] = useState<{ honmeiStar?: number; voidZodiacs?: string[] }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 他の画面で保存済みの設定を初期値にする。ここで入れ直させると、
  // 別画面の判定と違う前提で日付を出してしまう。
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tactical_config_v1");
      if (!raw) return;
      const c = JSON.parse(raw);
      if (typeof c.birth_date === "string") setBirthDate(c.birth_date);
      if (c.base_lon !== undefined && c.base_lon !== null)
        setLon(String(c.base_lon));
    } catch {
      // 壊れていれば手入力してもらう
    }
  }, []);

  const search = useCallback(async () => {
    if (!birthDate || !lon) {
      setError("生年月日と現住地の経度を入力してください。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const to = new Date(`${from}T12:00:00+09:00`);
      to.setMonth(to.getMonth() + months);
      const params = new URLSearchParams({
        birthDate,
        lon,
        from,
        to: `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(to.getDate()).padStart(2, "0")}`,
        direction,
        tenchusatsuMode,
      });
      const res = await fetch(
        `/api/relocation/auspicious-days?${params.toString()}`,
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || "計算に失敗しました。");
        setSummaries(null);
        return;
      }
      setSummaries(json.summaries);
      setMeta({ honmeiStar: json.honmeiStar, voidZodiacs: json.voidZodiacs });
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [birthDate, lon, from, months, direction, tenchusatsuMode]);

  return (
    <section className="mb-10 rounded-3xl border border-slate-300 bg-white/95 p-6 md:p-8 shadow-lg shadow-slate-200/50">
      <h2 className="text-lg font-bold font-serif flex items-center gap-2">
        <CalendarCheck className="w-5 h-5 text-rose-500" />
        三盤すべてが吉になる日を出す
      </h2>
      <p className="mt-3 text-sm text-slate-700 leading-relaxed">
        年盤・月盤・日盤のどれにも凶が入らない日だけを日付として並べます。
        年盤は立春で切り替わるため、その方位が吉でいられる期限も併せて出します。
      </p>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 block">
            生年月日（時刻まで分かれば入れる）
          </label>
          <input
            type="datetime-local"
            value={birthDate.length === 10 ? `${birthDate}T12:00` : birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:border-rose-400"
          />
        </div>
        <div className="space-y-1">
          <label
            className="text-xs font-semibold text-slate-500 block cursor-help"
            title="今住んでいる場所の経度。方位も太陽時もここを起点に決まります。"
          >
            現住地の経度
          </label>
          <input
            type="number"
            step="0.0001"
            placeholder="例: 136.9008（名古屋）"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:border-rose-400 font-mono"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 block">
            方位
          </label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none cursor-pointer focus:border-rose-400"
          >
            <option value="all">全方位（多い順に並べる）</option>
            {ALL_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {DIRECTION_LABELS[d]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 block">
            開始日
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:border-rose-400"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 block">
            走査期間
          </label>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none cursor-pointer focus:border-rose-400"
          >
            <option value={3}>3ヶ月</option>
            <option value={6}>6ヶ月</option>
            <option value={12}>12ヶ月</option>
            <option value={24}>24ヶ月</option>
          </select>
        </div>
        <div className="space-y-1">
          <label
            className="text-xs font-semibold text-slate-500 block cursor-help"
            title="天中殺（算命学）＝空亡（四柱推命）。九星気学には本来無い概念で、どこまで禁止則として扱うかは流派によって異なります。"
          >
            天中殺の扱い
          </label>
          <select
            value={tenchusatsuMode}
            onChange={(e) => setTenchusatsuMode(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none cursor-pointer focus:border-rose-400"
          >
            {TENCHUSATSU_MODES.map((m) => (
              <option key={m.id} value={m.id} title={m.description}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={search}
        disabled={loading}
        className="mt-5 px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white text-sm font-bold transition-colors inline-flex items-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        吉日を出す
      </button>

      {error && (
        <p className="mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {meta.honmeiStar !== undefined && (
        <p className="mt-4 text-xs text-slate-500">
          本命星: <b className="text-slate-700">{meta.honmeiStar}</b> ／ 天中殺の支:{" "}
          <b className="text-slate-700">{meta.voidZodiacs?.join("・")}</b>
        </p>
      )}

      {summaries && (
        <div className="mt-5 space-y-5">
          {summaries.every((s) => s.tripleAuspiciousDays === 0) && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              走査した期間に、三盤すべてが吉になる日はありませんでした。期間を延ばすか、方位を変えて試してください。
            </p>
          )}

          {summaries
            .filter((s) => s.tripleAuspiciousDays > 0)
            .map((s) => (
              <div
                key={s.direction}
                className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
              >
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-base font-bold text-slate-800">
                      {s.directionLabel}
                    </span>
                    <span className="text-sm text-slate-600">
                      三盤吉{" "}
                      <b className="text-rose-600">{s.tripleAuspiciousDays}</b> 日
                      {s.blockedByTenchusatsuDays > 0 && (
                        <>
                          {" "}
                          ／ 天中殺で不可{" "}
                          <b className="text-amber-700">
                            {s.blockedByTenchusatsuDays}
                          </b>{" "}
                          日 ／ 実質{" "}
                          <b className="text-emerald-700">{s.availableDays}</b> 日
                        </>
                      )}
                    </span>
                  </div>
                  {s.window.yearBoardValidUntil && (
                    <span className="text-xs text-slate-500">
                      年盤の期限:{" "}
                      <b className="text-slate-700">
                        {s.window.yearBoardValidUntil}
                      </b>
                      {s.window.afterYearBoardStatus && (
                        <> まで（翌日から「{label(s.window.afterYearBoardStatus)}」に変わる）</>
                      )}
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white text-xs text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">日付</th>
                        <th className="px-3 py-2 text-left font-semibold">年盤</th>
                        <th className="px-3 py-2 text-left font-semibold">月盤</th>
                        <th className="px-3 py-2 text-left font-semibold">日盤</th>
                        <th className="px-3 py-2 text-left font-semibold">暦</th>
                        <th className="px-3 py-2 text-left font-semibold">天中殺</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.days.map((d) => (
                        <tr
                          key={d.date}
                          className={`border-b border-slate-100 ${
                            d.blockedByTenchusatsu ? "bg-amber-50/60" : ""
                          }`}
                        >
                          <td className="px-3 py-2 font-mono whitespace-nowrap">
                            {d.date}
                            <span className="text-slate-400">
                              （{WEEKDAYS[d.weekday]}）
                            </span>
                          </td>
                          <td className="px-3 py-2">{label(d.yearLayer)}</td>
                          <td className="px-3 py-2">{label(d.monthLayer)}</td>
                          <td className="px-3 py-2">{label(d.dayLayer)}</td>
                          <td className="px-3 py-2">
                            <span className="flex flex-wrap gap-1">
                              {d.tags.map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-semibold"
                                >
                                  {t}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {d.blockedByTenchusatsu ? (
                              <span className="text-amber-700 font-semibold">
                                不可（
                                {[
                                  d.voidScopes.year && "年",
                                  d.voidScopes.month && "月",
                                  d.voidScopes.day && "日",
                                ]
                                  .filter(Boolean)
                                  .join("・")}
                                ）
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
