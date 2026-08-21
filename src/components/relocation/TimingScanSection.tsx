"use client";

/**
 * スキャナー左欄の「引っ越し時期を探す」。
 *
 * 物件を探す文脈の中で「いつ・どの方位なら動けるか」を先に走査し、
 * 選んだ日をそのままスキャンの条件に反映するための節。時期そのものを
 * 主役にした全期間の分析は /relocation/timing が持つ（棲み分けは
 * timing 側の冒頭コメントに書いてある）。
 *
 * arbitrage/page.tsx から**そのまま切り出したもの**で、表示も計算も
 * 変えていない。切り出した理由は、1 ファイル 4,658 行のうち 543 行を
 * この節が占めており、他の節を読むのに邪魔だったこと。
 *
 * 走査そのもの（runTimingScan）と結果の状態は、スキャンの日付・方位
 * フィルターと同じ状態を触るので**呼び出し側に残してある**。ここは
 * 受け取って描くだけ。
 */

import calendarClimatology from "@/data/calendarClimatology.json";
import { ArbitrageSidebarSection } from "@/components/relocation/ArbitrageSidebarSection";
import { TIER_LABELS, type DayTier } from "@/utils/auspiciousDays";
import type { DirectionCell } from "@/components/relocation/SpotVerdict";
import { TIER_BADGE_CLASS } from "@/utils/tierDisplay";

/** 平年値（calendarClimatology.json）のうち、この節が読む枝。 */
interface ClimatologyProfile {
  avgAnySPerYear: number;
  directions?: Record<
    string,
    { perYear: Record<"S" | "A" | "B" | "C" | "D" | "X", number> } | undefined
  >;
}

function climatologyFor(honmeiStar: number, voidZodiacs: string[]) {
  const profiles: Record<string, ClimatologyProfile | undefined> =
    calendarClimatology.profiles ?? {};
  const joined = voidZodiacs.join("");
  return (
    profiles[`${honmeiStar}|${joined}`] ??
    profiles[`${honmeiStar}|${[...voidZodiacs].reverse().join("")}`] ??
    null
  );
}

/**
 * 走査 1 方位ぶんの結果。
 *
 * 呼び出し側の useState もこの型を使う。同じ形を 2 か所に書かないため、
 * 定義はここに 1 つだけ置いて page 側が import する。
 */
export interface TimingDirectionRank {
  direction: string;
  directionLabel: string;
  tierCounts: Record<string, number>;
  bestAvailableTier: string | null;
  topDays: {
    date: string;
    weekday: number;
    tier: string;
    rokuyo: string;
    tags: string[];
  }[];
  luckyDays: {
    date: string;
    weekday: number;
    tier: string;
    rokuyo: string;
    tags: string[];
  }[];
  months: {
    month: string;
    bestTier: string | null;
    bestTierDays: number;
    firstDate: string | null;
  }[];
  blockedByTenchusatsuDays: number;
  firstDate: string | null;
  windows: {
    count: number;
    avgLen: number;
    maxLen: number;
    avgGapDays: number | null;
  } | null;
}

interface Props {
  /** 走査結果。null は「まだ走査していない」 */
  timingRanked: TimingDirectionRank[] | null;
  timingBusy: boolean;
  timingError: string | null;
  timingRangeDays: 365 | 730;
  setTimingRangeDays: (d: 365 | 730) => void;
  runTimingScan: () => void;
  /** 走査に使った本命星・空亡。平年比の突き合わせに要る */
  timingProfile: { honmeiStar: number; voidZodiacs: string[] } | null;
  /** 開いている方位。1 つだけ開く */
  timingOpenDir: string | null;
  setTimingOpenDir: (d: string | null) => void;
  /** ボタンを押せない理由を出すための入力状況 */
  hasBaseLocation: boolean;
  birthDate: string;
  /** 日付を選んだとき、スキャンの日付と方位フィルターを切り替える */
  applyTimingChoice: (dateStr: string, dir: string) => void;
  /** 方位ごとの候補件数・家賃中央値。走査結果の横に並べる */
  directionPropertyCounts: Record<string, number>;
  directionRentMedians: Record<string, number>;
  /** その日の盤。方位ごとの吉凶の内訳を出すのに使う */
  dayKigaku: { byDirection: Record<string, DirectionCell> } | undefined;
  /** スキャンが対象にしている日（YYYY-MM-DD）。いま選んでいる日の印に使う */
  targetDate: string;
  /** いま効いている方位フィルター。選択中の印に使う */
  filterDirection: string;
}

export function TimingScanSection({
  timingRanked,
  timingBusy,
  timingError,
  timingRangeDays,
  setTimingRangeDays,
  runTimingScan,
  timingProfile,
  timingOpenDir,
  setTimingOpenDir,
  hasBaseLocation,
  birthDate,
  applyTimingChoice,
  directionPropertyCounts,
  directionRentMedians,
  dayKigaku,
  targetDate,
  filterDirection,
}: Props) {
  return (
    <ArbitrageSidebarSection
      title="引っ越し時期を探す"
      summary={
        timingRanked === null
          ? "未走査"
          : (() => {
              const best = timingRanked.find(
                (s) => s.bestAvailableTier !== null,
              );
              return best
                ? `最良: ${TIER_LABELS[best.bestAvailableTier as DayTier]}`
                : "候補なし";
            })()
      }
    >
      <p className="text-[10px] leading-relaxed text-stone-500">
        選んだ期間の全日を、方位ごとに
        <span className="font-bold">6段階</span>
        で格付けします（三盤吉 → 吉2盤 → 吉1盤 → 凶なし →
        軽い凶のみ）。三盤吉の日が無い期間でも、
        <span className="font-bold">その中で最もマシな日</span>
        を候補に出します。五大凶殺（五黄殺・暗剣殺・破・本命殺・的殺）の日だけは決して候補に出しません。日付を選ぶと、スキャンの日付と方位フィルターがその日に切り替わります。
        <a
          href="/relocation/timing"
          className="ml-1 font-semibold text-indigo-600 underline"
        >
          全期間の詳細分析
        </a>
        では、過去から未来までの全日をカレンダーと分布で見られます。
      </p>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-zinc-200 dark:bg-white p-0.5 rounded-lg select-none">
          {([365, 730] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setTimingRangeDays(d)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                timingRangeDays === d
                  ? "bg-white dark:bg-stone-100 text-gray-900 dark:text-stone-900 shadow-xs"
                  : "text-stone-600 hover:text-gray-700"
              }`}
            >
              {d === 365 ? "1年" : "2年"}
            </button>
          ))}
        </div>
        <button
          onClick={() => runTimingScan()}
          disabled={timingBusy || !hasBaseLocation || !birthDate}
          className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white transition-colors"
        >
          {timingBusy
            ? "走査中…"
            : timingRanked === null
              ? "走査する"
              : "走査し直す"}
        </button>
      </div>
      {/*
        無効になっている理由を必ず書く。以前は出発地の分しか
        無く、生年月日だけ未入力だとボタンが灰色のまま理由が
        読めなかった（#160 で時期分析を直したのと同じ形）。
      */}
      {(!hasBaseLocation || !birthDate) && (
        <p className="text-[10px] text-amber-700">
          {!hasBaseLocation
            ? "出発地が未設定です。方位は出発地から決まるため、先に「出発地座標」を設定してください。"
            : "生年月日が未入力です。本命殺・天中殺は生年月日から決まるため、先に「生年月日」を入れてください。"}
        </p>
      )}
      {timingError && (
        <p className="text-[10px] text-rose-600">{timingError}</p>
      )}
      {timingRanked !== null &&
        (() => {
          const usable = timingRanked.filter(
            (s) => s.bestAvailableTier !== null,
          );
          const totalBlocked = timingRanked.reduce(
            (a, s) => a + s.blockedByTenchusatsuDays,
            0,
          );
          if (usable.length === 0) {
            // 全方位・全日が X か天中殺。段階評価でもここまで
            // 塞がるのは稀で、原因はほぼ天中殺の設定側にある。
            return (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-[10px] leading-relaxed text-stone-600 space-y-1.5">
                <p className="font-bold text-rose-700">
                  この期間、候補に出せる日がありません。
                </p>
                {totalBlocked > 0 ? (
                  <p>
                    重い凶ではない日が{totalBlocked}
                    日ありますが、すべて天中殺で移転不可と判定されています。「天中殺の扱い」を「弱める（禁止しない）」にするか、転勤などの事情があれば「やむを得ない移動」にチェックを入れると候補が現れます。
                  </p>
                ) : (
                  <p>
                    全日が五大凶殺（五黄殺・暗剣殺・破・本命殺・的殺）に当たっています。期間を2年に広げて再走査してください。
                  </p>
                )}
              </div>
            );
          }
          const hasS = usable.some((s) => s.bestAvailableTier === "S");
          const clim = timingProfile
            ? climatologyFor(
                timingProfile.honmeiStar,
                timingProfile.voidZodiacs,
              )
            : null;
          return (
            <div className="space-y-1.5">
              {clim && (
                <p className="text-[9px] leading-relaxed text-stone-600">
                  あなたの命式（本命星{timingProfile!.honmeiStar}
                  ・天中殺{timingProfile!.voidZodiacs.join("")}
                  ）では、どこかの方位が三盤吉になる日は
                  <b className="text-stone-600">
                    年平均{clim.avgAnySPerYear}日
                  </b>
                  （9年平均・天中殺考慮前）。今回の走査結果はこの基準と比べて読んでください。
                </p>
              )}
              {/* 意思決定サマリー。「結局いつ・どっちへ動くのが
                  最速か」を先に一言で答える */}
              {(() => {
                const bestTier = usable[0].bestAvailableTier;
                const sameTier = usable
                  .filter(
                    (u) => u.bestAvailableTier === bestTier && u.firstDate,
                  )
                  .sort((a, b) => a.firstDate!.localeCompare(b.firstDate!));
                const first = sameTier[0];
                const second = sameTier.find(
                  (u) => u.direction !== first?.direction,
                );
                if (!first?.firstDate) return null;
                return (
                  <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-2.5 text-[10px] leading-relaxed text-stone-700">
                    <p>
                      最速の候補:{" "}
                      <button
                        onClick={() =>
                          applyTimingChoice(
                            first.firstDate as string,
                            first.direction,
                          )
                        }
                        className="font-bold text-indigo-700 underline"
                      >
                        {first.firstDate.slice(5).replace("-", "/")} に
                        {first.directionLabel}へ
                      </button>
                      （{TIER_LABELS[bestTier as DayTier]}）
                      {second?.firstDate &&
                        second.firstDate !== first.firstDate && (
                          <>
                            。待てば{" "}
                            <button
                              onClick={() =>
                                applyTimingChoice(
                                  second.firstDate as string,
                                  second.direction,
                                )
                              }
                              className="font-semibold text-indigo-600 underline"
                            >
                              {second.firstDate.slice(5).replace("-", "/")} に
                              {second.directionLabel}
                            </button>
                            も開きます
                          </>
                        )}
                      。
                    </p>
                  </div>
                );
              })()}
              {/* 方位×月マトリクス。どの月にどの方位が開くかの
                  俯瞰。セルはその月の最良段階 */}
              {usable.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-stone-200 bg-white dark:bg-stone-50 p-2">
                  <p className="text-[9px] text-stone-600 mb-1.5 leading-relaxed">
                    方位×月の見取り図。
                    <b className="text-stone-500">月のセル</b>
                    はその月の
                    <b className="text-stone-500">最良</b>
                    段階で、選択日の判定ではありません（クリックでその月の最初の候補日へ）。左端の
                    <b className="text-stone-500">選択日</b>
                    列が地図の扇形と同じ判定です。
                  </p>
                  <table className="text-[10px]">
                    <thead>
                      <tr>
                        <th className="pr-1.5 text-left font-semibold text-stone-600">
                          方位
                        </th>
                        <th className="px-0.5 font-mono font-normal text-indigo-400 border-r border-stone-200">
                          {targetDate
                            ? targetDate.slice(5).replace("-", "/")
                            : "選択日"}
                        </th>
                        {usable[0].months.map((m) => (
                          <th
                            key={m.month}
                            className="px-0.5 font-mono font-normal text-stone-600"
                          >
                            {m.month.slice(5)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {usable.map((u) => (
                        <tr key={u.direction}>
                          <td className="pr-1.5 font-bold text-stone-600 whitespace-nowrap">
                            {u.directionLabel}
                          </td>
                          {/* 選択日の判定。地図の扇形と同じ値。
                              月セルの「その月の最良」と混同
                              しないよう罫線で区切る */}
                          <td className="px-0.5 py-0.5 border-r border-stone-200">
                            {(() => {
                              const t = dayKigaku?.byDirection[u.direction];
                              if (!t)
                                return (
                                  <span className="block h-5 w-5 rounded border border-stone-100 bg-stone-50 text-center leading-5 text-stone-300">
                                    –
                                  </span>
                                );
                              if (t.blocked)
                                return (
                                  <span
                                    title={`${u.directionLabel}: 天中殺で塞がっています`}
                                    className="block h-5 w-5 rounded border border-stone-300 bg-stone-200 text-center leading-5 text-stone-500"
                                  >
                                    殺
                                  </span>
                                );
                              return (
                                <span
                                  title={`${targetDate} ${u.directionLabel}: ${TIER_LABELS[t.tier as DayTier]}`}
                                  className={`block h-5 w-5 rounded border text-center leading-5 font-bold ${TIER_BADGE_CLASS[t.tier as DayTier]}`}
                                >
                                  {t.tier}
                                </span>
                              );
                            })()}
                          </td>
                          {u.months.map((m) =>
                            m.bestTier && m.firstDate ? (
                              <td key={m.month} className="px-0.5 py-0.5">
                                <button
                                  onClick={() =>
                                    applyTimingChoice(
                                      m.firstDate as string,
                                      u.direction,
                                    )
                                  }
                                  title={`${m.month} ${u.directionLabel}: ${TIER_LABELS[m.bestTier as DayTier]} ${m.bestTierDays}日`}
                                  className={`h-5 w-5 rounded border text-[10px] font-bold ${TIER_BADGE_CLASS[m.bestTier as DayTier]}`}
                                >
                                  {m.bestTier}
                                </button>
                              </td>
                            ) : (
                              <td key={m.month} className="px-0.5 py-0.5">
                                <span className="block h-5 w-5 rounded border border-stone-100 bg-stone-50 text-center leading-5 text-stone-300">
                                  –
                                </span>
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!hasS && (
                <p className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 text-[9px] leading-relaxed text-amber-800">
                  この期間に三盤吉の日はありません。以下は
                  <b>次善の候補</b>
                  です（凶の無い日・吉が重なる日を優先）。急ぎでなければ、期間を広げて三盤吉を待つ選択もあります。
                </p>
              )}
              {usable.map((s) => {
                const tier = s.bestAvailableTier as DayTier;
                const propCount = directionPropertyCounts[s.direction] ?? 0;
                const isOpen = timingOpenDir === s.direction;
                return (
                  <div
                    key={s.direction}
                    className="rounded-xl border border-gray-200 dark:border-stone-200 bg-white dark:bg-stone-50 overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setTimingOpenDir(isOpen ? null : s.direction)
                      }
                      className="w-full flex items-center justify-between px-2.5 py-2 text-left"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-stone-700">
                          {s.directionLabel}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_BADGE_CLASS[tier]}`}
                        >
                          {TIER_LABELS[tier]}
                        </span>
                      </span>
                      <span className="text-[10px] text-stone-500 shrink-0">
                        <b className="text-indigo-600">
                          {s.tierCounts[tier] ?? 0}
                        </b>
                        日・物件{" "}
                        <b
                          className={
                            propCount > 0 ? "text-teal-600" : "text-stone-600"
                          }
                        >
                          {propCount}
                        </b>
                        件
                        {directionRentMedians[s.direction] !== undefined && (
                          <span className="text-stone-600">
                            ・中央値
                            {(
                              directionRentMedians[s.direction] / 10000
                            ).toFixed(1)}
                            万
                          </span>
                        )}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-2.5 pb-2.5 border-t border-gray-100 dark:border-stone-200 pt-2 space-y-2">
                        {s.topDays.length > 0 && (
                          <div>
                            <p className="text-[9px] text-stone-600 mb-1">
                              直近の候補日（日付順。選ぶとスキャンが切り替わる）
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {s.topDays.map((d) => (
                                <button
                                  key={d.date}
                                  onClick={() =>
                                    applyTimingChoice(d.date, s.direction)
                                  }
                                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                                    targetDate === d.date &&
                                    filterDirection === s.direction
                                      ? "bg-indigo-600 border-indigo-600 text-white"
                                      : "bg-gray-50 dark:bg-white border-gray-200 dark:border-stone-200 text-stone-600 hover:border-indigo-400"
                                  }`}
                                  title={`${d.date}（${"日月火水木金土"[d.weekday]}）${d.rokuyo}${d.tags.length ? " / " + d.tags.join("・") : ""}`}
                                >
                                  {d.date.slice(2).replace(/-/g, "/")}
                                  <span className="ml-0.5 text-[10px] opacity-70">
                                    {"日月火水木金土"[d.weekday]}
                                  </span>
                                  {d.tags.includes("天赦日") && (
                                    <span className="ml-0.5 text-[10px]">
                                      ✨
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {s.luckyDays.length > 0 && (
                          <div>
                            <p className="text-[9px] text-stone-600 mb-1">
                              縁起の良い日（天赦日
                              ✨・一粒万倍日。同じ段階の日から抜粋）
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {s.luckyDays.map((d) => (
                                <button
                                  key={`lucky-${d.date}`}
                                  onClick={() =>
                                    applyTimingChoice(d.date, s.direction)
                                  }
                                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                                    targetDate === d.date &&
                                    filterDirection === s.direction
                                      ? "bg-amber-500 border-amber-500 text-white"
                                      : "bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-400"
                                  }`}
                                  title={`${d.date}（${"日月火水木金土"[d.weekday]}）${d.rokuyo} / ${d.tags.join("・")}`}
                                >
                                  {d.date.slice(2).replace(/-/g, "/")}
                                  {d.tags.includes("天赦日") && (
                                    <span className="ml-0.5">✨</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 窓の統計。引っ越しは1日では済まない
                            ので、候補日が何日続くか・逃したら
                            次までどれだけ空くかが判断材料 */}
                        {s.windows && (
                          <p className="text-[9px] text-stone-500">
                            {TIER_LABELS[tier]}の窓は
                            <b>{s.windows.count}回</b>
                            ・平均<b>{s.windows.avgLen}日</b>
                            続く（最長{s.windows.maxLen}日）
                            {s.windows.avgGapDays !== null && (
                              <>
                                。窓の間隔は平均
                                <b>{s.windows.avgGapDays}日</b>—
                                逃すと次までこれだけ待つ
                              </>
                            )}
                          </p>
                        )}
                        {/* 平年値。9年（年盤一巡）平均の基準を
                            添えて「多いのか少ないのか」を読める
                            ようにする */}
                        {timingProfile &&
                          (() => {
                            const clim = climatologyFor(
                              timingProfile.honmeiStar,
                              timingProfile.voidZodiacs,
                            );
                            const d = clim?.directions?.[s.direction]?.perYear;
                            if (!d) return null;
                            return (
                              <p className="text-[9px] text-stone-600">
                                この方位の平年値（9年平均・天中殺考慮前）:
                                三盤吉 {d.S}
                                日/年・吉2盤 {d.A}日/年
                              </p>
                            );
                          })()}
                        {/* 月ごとの見取り図。どの月に窓が開くか */}
                        <div>
                          <p className="text-[9px] text-stone-600 mb-1">
                            月ごとの最良（クリックでその月の最初の候補日へ）
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {s.months.map((m) =>
                              m.bestTier && m.firstDate ? (
                                <button
                                  key={m.month}
                                  onClick={() =>
                                    applyTimingChoice(
                                      m.firstDate as string,
                                      s.direction,
                                    )
                                  }
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${TIER_BADGE_CLASS[m.bestTier as DayTier]}`}
                                  title={`${m.month}: ${TIER_LABELS[m.bestTier as DayTier]} ${m.bestTierDays}日`}
                                >
                                  {m.month.slice(2).replace("-", "/")}
                                  <span className="ml-0.5 opacity-80">
                                    {m.bestTier}×{m.bestTierDays}
                                  </span>
                                </button>
                              ) : (
                                <span
                                  key={m.month}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-semibold border border-stone-200 text-stone-300"
                                  title={`${m.month}: 候補なし`}
                                >
                                  {m.month.slice(2).replace("-", "/")}
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                        {propCount === 0 && (
                          <p className="text-[9px] text-amber-700">
                            この方位には現在の検索範囲に物件がありません。地図を動かすか検索範囲を広げてください。
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {totalBlocked > 0 && (
                <p className="text-[9px] text-stone-600">
                  ほかに延べ{totalBlocked}
                  日が天中殺で候補から外れています（「天中殺の扱い」で変わります）。
                </p>
              )}
            </div>
          );
        })()}
    </ArbitrageSidebarSection>
  );
}
