"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, CalendarCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  ALL_DIRECTIONS,
  DIRECTION_LABELS,
} from "@/utils/auspiciousDays";
import {
  DEFAULT_TENCHUSATSU_MODE,
  TENCHUSATSU_MODES,
} from "@/utils/tenchusatsuPolicy";
import { getAuspiciousDayErrorMessage } from "@/lib/auspiciousDayErrors";

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

/**
 * 保存済みの設定が無いときの初期値。
 *
 * 以前は空で始めていたため、初めて来た人が「吉日を出す」を押すと
 * 「生年月日と現住地の経度を入力してください。」とだけ出て、中核ページの
 * 主要な操作が最初の一回で必ず失敗していた。ホームなど他の画面は同じ値を
 * 既定にしているので、ここも揃える。入力欄には値が見えているので、
 * 自分の生年月日と現住地に直せば結果もそのぶん正確になる。
 */
const DEFAULT_BIRTH_DATE = "2000-01-01";
const DEFAULT_LAT = "35.6895";
const DEFAULT_LON = "139.6917";

export function AuspiciousDayFinder() {
  const [birthDate, setBirthDate] = useState(DEFAULT_BIRTH_DATE);
  const [lon, setLon] = useState(DEFAULT_LON);
  // スキャナーへ引き継ぐために緯度も持つ。方位の判定は経度だけで足りるが、
  // 物件を出すには出発地の座標が要る。
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [direction, setDirection] = useState("all");
  const [tenchusatsuMode, setTenchusatsuMode] = useState<string>(
    DEFAULT_TENCHUSATSU_MODE,
  );
  const [from, setFrom] = useState(todayString());
  const [months, setMonths] = useState(12);

  // 既定値のまま結果を出したかどうか。方位も吉日も生年月日と現住地で
  // 変わるので、既定のまま見た結果を「自分の結果」だと思われないように
  // 前提を明示する。物件スキャナー側も同じ理由で出発地を要求している。
  const usingDefaults =
    birthDate === DEFAULT_BIRTH_DATE && lon === DEFAULT_LON;

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
      if (c.base_lat !== undefined && c.base_lat !== null)
        setLat(String(c.base_lat));
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
        setError(getAuspiciousDayErrorMessage(json.error));
        setSummaries(null);
        return;
      }
      setSummaries(json.summaries);
      setMeta({ honmeiStar: json.honmeiStar, voidZodiacs: json.voidZodiacs });
    } catch {
      setError(getAuspiciousDayErrorMessage());
    } finally {
      setLoading(false);
    }
  }, [birthDate, lon, from, months, direction, tenchusatsuMode]);

  /**
   * 物件スキャナーへの受け渡し。対象日・方位・天中殺の扱いを引き継ぐ。
   * 出発地が分からないとスキャナーは方位を出せないので座標も渡す。
   */
  const scannerHref = (date: string, direction: string) => {
    const q = new URLSearchParams({ targetDate: date, direction, tenchusatsuMode });
    if (lat) q.set("baseLat", lat);
    if (lon) q.set("baseLon", lon);
    return `/relocation/arbitrage?${q.toString()}`;
  };

  return (
    <section className="mb-10 rounded-3xl border border-slate-300 bg-white/95 p-6 md:p-8 shadow-lg shadow-slate-200/50">
      <h2 className="text-lg font-bold font-serif flex items-center gap-2">
        <CalendarCheck className="w-5 h-5 text-rose-500" />
        三盤すべてが吉になる日を出す
      </h2>
      <p className="mt-3 text-sm text-slate-700 leading-relaxed">
        年盤・月盤・日盤のどれにも凶が入らない日だけを日付として並べます。年盤は立春で切り替わるため、その方位が吉でいられる期限も併せて出します。
      </p>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label
            htmlFor="ad-birth"
            className="text-xs font-semibold text-slate-500 block"
          >
            生年月日（時刻まで分かれば入れる）
          </label>
          <input
            id="ad-birth"
            type="datetime-local"
            value={birthDate.length === 10 ? `${birthDate}T12:00` : birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:border-rose-400"
          />
        </div>
        <div className="space-y-1">
          <label
            className="text-xs font-semibold text-slate-500 block cursor-help"
            htmlFor="ad-lon"
            title="今住んでいる場所の経度。方位も太陽時もここを起点に決まります。"
          >
            現住地の経度
          </label>
          <input
            id="ad-lon"
            type="number"
            step="0.0001"
            placeholder="例: 136.9008（名古屋）"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:border-rose-400 font-mono"
          />
        </div>
        <div className="space-y-1">
          <label
            className="text-xs font-semibold text-slate-500 block cursor-help"
            htmlFor="ad-lat"
            title="物件一覧へ渡すときに使います。方位の判定だけなら経度だけで足ります。"
          >
            現住地の緯度（任意）
          </label>
          <input
            id="ad-lat"
            type="number"
            step="0.0001"
            placeholder="例: 35.1430"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:border-rose-400 font-mono"
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor="ad-direction"
            className="text-xs font-semibold text-slate-500 block"
          >
            方位
          </label>
          <select
            id="ad-direction"
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
          <label
            htmlFor="ad-from"
            className="text-xs font-semibold text-slate-500 block"
          >
            開始日
          </label>
          <input
            id="ad-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:border-rose-400"
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor="ad-months"
            className="text-xs font-semibold text-slate-500 block"
          >
            走査期間
          </label>
          <select
            id="ad-months"
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
            htmlFor="ad-tenchusatsu"
            title="天中殺（算命学）＝空亡（四柱推命）。九星気学には本来無い概念で、どこまで禁止則として扱うかは流派によって異なります。"
          >
            天中殺の扱い
          </label>
          <select
            id="ad-tenchusatsu"
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

      {summaries && usingDefaults && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-900">
            いまの結果は仮の設定によるものです
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            生年月日「{DEFAULT_BIRTH_DATE}」・現住地「東京」を仮に置いて計算しています。本命星は生年で変わり、方位は現住地から見た向きで決まるため、
            <b>このままではあなたの吉日ではありません</b>。上の入力欄をご自身の生年月日と現住地に変えて、もう一度お試しください。
          </p>
        </div>
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
                        <th className="px-3 py-2 text-left font-semibold">物件</th>
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
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {/* この日・この方位のまま物件一覧へ渡す。
                                日と方位が決まってから物件を選ぶのが実際の順序で、
                                条件を入れ直させると前提がずれる。 */}
                            <Link
                              href={scannerHref(d.date, s.direction)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100 transition-colors"
                              title={`${d.date} に ${s.directionLabel} へ移る前提で物件を探す`}
                            >
                              この条件で探す
                              <ArrowRight className="w-3 h-3" />
                            </Link>
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
