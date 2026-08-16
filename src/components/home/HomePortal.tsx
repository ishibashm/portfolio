"use client";

/**
 * ホームの 1 枚目。要点だけを枠に分けて並べる。
 *
 * これまでのホームは 6 つのタブで、1 タブが縦にとても長かった。
 * 「今日はどの方位が良くて、いつ動けるのか」を知るだけでも、タブを
 * 開いて長い画面を下まで見る必要があった。利用者の要望で、開かなくても
 * 要点が見える形（多段の枠）に組み直した。
 *
 * **深い内容は今までのタブに残す。**ここは入口で、各枠の「詳しく」から
 * それぞれのタブへ渡す。機能は 1 つも減らしていない。
 *
 * **新しい取得はしない。**描くのは、SolarTimeClock が既に計算し終えて
 * いる値だけ。props で受けるのはそのため。ここが速さの理由で、枠を
 * 増やしても通信は増えない。
 *
 * 判定は自前で持たない。方位は utils/directionStatus と
 * lib/verdictRating、時間帯は lib/timePhase を通す。同じ判定を
 * 2 か所に書くと、詳細画面と食い違ったときに気付けない。
 */

import React from "react";
import Link from "next/link";
import {
  evaluateTimePhase,
  getGateDescription,
  isVoidTimeHour,
} from "@/lib/timePhase";
import { ratingForStatus } from "@/lib/verdictRating";
import { directionLabelShort } from "@/lib/directionLabels";
import type { KimonScheduleItem } from "@/utils/solarTime";
import type { Direction, getHonmeiStar } from "../../utils/ephemerisEngine";

/** 8 方位。中央は動く先にならないので出さない。 */
const DIRS: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const DIR_JA: Record<string, string> = {
  N: "北",
  NE: "北東",
  E: "東",
  SE: "南東",
  S: "南",
  SW: "南西",
  W: "西",
  NW: "北西",
};

export type PortalTab =
  | "profile"
  | "destination"
  | "timing"
  | "consult"
  | "scorecard"
  | "history";

export interface HomePortalProps {
  /** 各枠の「詳しく」から、対応するタブへ渡す。 */
  onOpenTab: (tab: PortalTab) => void;
  /** 判定に使っている日。今日とは限らない（時間送りができる）。 */
  evalDate: Date;
  /** 8 方位の判定。activeVectors をそのまま受ける。 */
  vectors: Partial<Record<Direction, string>>;
  /** 2 時間ごとの十二支と八門。getDailySolarSchedule の結果。 */
  schedule: KimonScheduleItem[];
  personalVoidZodiac: string[];
  honmeiStar: ReturnType<typeof getHonmeiStar> | null;
  useClassicalBoard: boolean;
  /** 30 日先までの方位別予測。出せない日は null。 */
  forecast: Record<
    string,
    { luckyDays: number; dates: { dateStr: string; status: string }[] }
  > | null;
  kpIndex: number | null;
  pressure: { current: number; drop: number } | null;
  declination: number | null;
  /** 生年月日が未入力なら、個人の判定は出せない。 */
  hasBirthDate: boolean;
}

/** 判定の良し悪しを並べ替えるための点。lib/verdictRating が正。 */
function scoreOf(status: string | undefined): number {
  if (!status) return -999;
  return ratingForStatus(status).score;
}

function Card({
  title,
  accent,
  onDetail,
  detailLabel = "詳しく",
  children,
}: {
  title: string;
  accent: string;
  onDetail?: () => void;
  detailLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-stone-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-stone-100">
        <h2 className="flex items-center gap-1.5 text-[11px] font-bold text-stone-600 tracking-wide">
          <span className={`w-1.5 h-1.5 rounded-full ${accent}`} />
          {title}
        </h2>
        {onDetail && (
          <button
            onClick={onDetail}
            className="text-[10px] text-indigo-500 hover:text-indigo-700 hover:underline shrink-0"
          >
            {detailLabel} →
          </button>
        )}
      </header>
      <div className="p-3 flex-1">{children}</div>
    </section>
  );
}

export default function HomePortal({
  onOpenTab,
  evalDate,
  vectors,
  schedule,
  personalVoidZodiac,
  honmeiStar,
  useClassicalBoard,
  forecast,
  kpIndex,
  pressure,
  declination,
  hasBirthDate,
}: HomePortalProps) {
  /** 良い順に並べた 8 方位。「どこへ動けるか」を先に答える。 */
  const rankedDirections = React.useMemo(() => {
    return DIRS.map((d) => ({
      dir: d,
      ja: DIR_JA[d],
      status: vectors[d],
      rating: vectors[d] ? ratingForStatus(vectors[d]) : null,
    })).sort((a, b) => scoreOf(b.status) - scoreOf(a.status));
  }, [vectors]);

  /**
   * 今の時間帯と、次に動ける時間帯。
   *
   * 判定は詳細画面（SolarTimeTable）と同じ lib/timePhase を通す。
   * 「同じ時間なのに画面によって言うことが違う」を作らないため。
   */
  const timing = React.useMemo(() => {
    if (schedule.length === 0) return null;
    const now = evalDate.getTime();

    const rows = schedule.map((item) => {
      const isVoid = isVoidTimeHour(item, personalVoidZodiac);
      const phase = evaluateTimePhase(item, honmeiStar, useClassicalBoard);
      return { item, isVoid, isOptimal: phase.isOptimal };
    });

    const currentIndex = rows.findIndex(
      (r) =>
        new Date(r.item.startStandard).getTime() <= now &&
        now < new Date(r.item.endStandard).getTime(),
    );
    const current = currentIndex >= 0 ? rows[currentIndex] : null;

    // 次に [GO] になる時間帯。今より後ろだけを見る。
    const next = rows.find(
      (r) =>
        r.isOptimal &&
        !r.isVoid &&
        new Date(r.item.startStandard).getTime() > now,
    );

    return {
      current,
      next,
      goCount: rows.filter((r) => r.isOptimal && !r.isVoid).length,
    };
  }, [schedule, evalDate, personalVoidZodiac, honmeiStar, useClassicalBoard]);

  /** 30 日で吉の日が多い方位。上位 3 つ。 */
  const windows = React.useMemo(() => {
    if (!forecast) return [];
    return DIRS.map((d) => ({
      dir: d,
      ja: DIR_JA[d],
      luckyDays: forecast[d]?.luckyDays ?? 0,
      firstDate: forecast[d]?.dates.find((x) =>
        ["SAFE", "OPTIMAL", "OPTIMAL_REGULAR"].includes(x.status),
      )?.dateStr,
    }))
      .filter((x) => x.luckyDays > 0)
      .sort((a, b) => b.luckyDays - a.luckyDays)
      .slice(0, 3);
  }, [forecast]);

  const hhmm = (value: string | Date) => {
    const d = new Date(value);
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  };

  const best = rankedDirections[0];

  return (
    <div className="w-full flex flex-col gap-3 animate-fade-in">
      {/* 一番上の帯。「今どうなのか」を 1 行で答える */}
      <div className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 shadow-sm">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] text-stone-400">いま良い方位</span>
          {hasBirthDate && best?.rating ? (
            <>
              <strong className="text-xl font-bold text-stone-700">
                {best.ja}
              </strong>
              <span className="text-xs text-emerald-600 font-bold">
                {best.rating.rating}
              </span>
            </>
          ) : (
            <span className="text-xs text-stone-400">
              生年月日を入れると出ます
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] text-stone-400">いまの時間帯</span>
          {timing?.current ? (
            <strong
              className={`text-sm font-bold ${
                timing.current.isVoid
                  ? "text-red-500"
                  : timing.current.isOptimal
                    ? "text-emerald-600"
                    : "text-stone-600"
              }`}
            >
              {timing.current.isVoid
                ? "動かない（天中殺）"
                : timing.current.isOptimal
                  ? "動いてよい"
                  : "ふつう"}
            </strong>
          ) : (
            <span className="text-xs text-stone-400">—</span>
          )}
        </div>
        {timing?.next && (
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] text-stone-400">次に動ける</span>
            <strong className="text-sm font-bold text-emerald-600">
              {hhmm(timing.next.item.startStandard)}
            </strong>
          </div>
        )}
        <div className="ml-auto text-[10px] text-stone-400">
          {evalDate.getFullYear()}/{evalDate.getMonth() + 1}/
          {evalDate.getDate()} 基準
        </div>
      </div>

      {/* 枠を多段に。画面が広いほど列を増やす（CLAUDE.md 3 節） */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <Card
          title="今日の 8 方位"
          accent="bg-emerald-500"
          onDetail={() => onOpenTab("destination")}
          detailLabel="地図で見る"
        >
          {hasBirthDate ? (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {rankedDirections.map((d) => (
                <li
                  key={d.dir}
                  className="flex items-center justify-between text-xs border-b border-stone-100 py-1"
                >
                  <span className="font-bold text-stone-600">{d.ja}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      d.rating?.color ?? "text-stone-400"
                    }`}
                  >
                    {d.status ? directionLabelShort(d.status) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-stone-400 leading-relaxed">
              生年月日を入れると、あなたの本命星から 8 方位の吉凶が出ます。
            </p>
          )}
        </Card>

        <Card
          title="今日の時間帯"
          accent="bg-indigo-500"
          onDetail={() => onOpenTab("timing")}
        >
          {timing ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-stone-500">
                今日は{" "}
                <strong className="text-emerald-600">
                  {timing.goCount} つ
                </strong>{" "}
                の時間帯が「動いてよい」です。
              </p>
              {timing.current && (
                <div className="text-xs bg-stone-50 border border-stone-200 rounded-lg p-2">
                  <div className="text-[10px] text-stone-400">いま</div>
                  <div className="font-bold text-stone-700">
                    {hhmm(timing.current.item.startStandard)}–
                    {hhmm(timing.current.item.endStandard)}{" "}
                    {timing.current.item.japanese}の刻
                  </div>
                  <div className="text-[10px] text-stone-500 mt-0.5">
                    {timing.current.item.hachimon.japanese}:{" "}
                    {getGateDescription(timing.current.item.hachimon.japanese)}
                  </div>
                </div>
              )}
              {timing.next ? (
                <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                  <div className="text-[10px] text-emerald-600">次に動ける</div>
                  <div className="font-bold text-emerald-700">
                    {hhmm(timing.next.item.startStandard)}–
                    {hhmm(timing.next.item.endStandard)}{" "}
                    {timing.next.item.japanese}の刻
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-stone-400">
                  今日はこの先「動いてよい」時間帯がありません。
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-stone-400">時間帯を計算中です。</p>
          )}
        </Card>

        <Card
          title="30 日の窓"
          accent="bg-amber-500"
          onDetail={() => onOpenTab("scorecard")}
        >
          {windows.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {windows.map((w) => (
                <li
                  key={w.dir}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="font-bold text-stone-600">{w.ja}</span>
                  <span className="text-stone-500">
                    <strong className="text-amber-600">{w.luckyDays}</strong> 日
                    {w.firstDate && (
                      <span className="text-[10px] text-stone-400 ml-1.5">
                        最短 {w.firstDate.slice(5)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-stone-400 leading-relaxed">
              {hasBirthDate
                ? "この 30 日に動ける方位がありません。期間を広げて探してください。"
                : "生年月日を入れると、30 日先までの窓が出ます。"}
            </p>
          )}
        </Card>

        <Card
          title="環境"
          accent="bg-sky-500"
          onDetail={() => onOpenTab("consult")}
        >
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[9px] text-stone-400">地磁気 Kp</dt>
              <dd className="text-sm font-bold text-stone-700">
                {kpIndex !== null ? kpIndex.toFixed(1) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[9px] text-stone-400">気圧</dt>
              <dd className="text-sm font-bold text-stone-700">
                {pressure ? `${pressure.current.toFixed(0)}` : "—"}
                <span className="text-[9px] text-stone-400 ml-0.5">hPa</span>
              </dd>
            </div>
            <div>
              <dt className="text-[9px] text-stone-400">偏角</dt>
              <dd className="text-sm font-bold text-stone-700">
                {declination !== null ? `${declination.toFixed(1)}°` : "—"}
              </dd>
            </div>
          </dl>
          {pressure && pressure.drop < -3 && (
            <p className="text-[10px] text-amber-600 mt-2 leading-relaxed">
              3 時間で {pressure.drop.toFixed(1)}
              hPa 下がっています。体調が出やすい人は無理をしないでください。
            </p>
          )}
        </Card>

        <Card
          title="あなたの設定"
          accent="bg-purple-500"
          onDetail={() => onOpenTab("profile")}
          detailLabel="変更する"
        >
          {honmeiStar ? (
            <dl className="flex flex-col gap-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-stone-400">本命星（暦）</dt>
                <dd className="font-bold text-stone-700">
                  {honmeiStar.classical}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-400">本命星（物理）</dt>
                <dd className="font-bold text-stone-700">
                  {honmeiStar.physical}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-400">天中殺</dt>
                <dd className="font-bold text-red-500">
                  {personalVoidZodiac.length > 0
                    ? personalVoidZodiac.join("・")
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-stone-400 leading-relaxed">
              生年月日と出発地を入れると、ここに本命星と天中殺が出ます。
            </p>
          )}
        </Card>

        <Card title="次にすること" accent="bg-stone-400">
          <ul className="flex flex-col gap-1.5 text-xs">
            <li>
              <Link
                href="/relocation/arbitrage"
                className="text-indigo-500 hover:underline"
              >
                物件を方位で探す →
              </Link>
            </li>
            <li>
              {/*
                以前は /relocation/auspicious-days を指していた。**その頁は
                無い**（あるのは同じ名前の API だけ）。ホームから 404 へ
                リンクしていて、Search Console が 404 として拾っていた。
                暦カレンダーの実体は /calendar（siteStructure の定義と同じ）。
              */}
              <Link
                href="/calendar"
                className="text-indigo-500 hover:underline"
              >
                引越しの日取りを選ぶ →
              </Link>
            </li>
            <li>
              <Link href="/houi" className="text-indigo-500 hover:underline">
                方位の読みもの →
              </Link>
            </li>
            <li>
              <button
                onClick={() => onOpenTab("history")}
                className="text-indigo-500 hover:underline"
              >
                過去の引越しを振り返る →
              </button>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
