/**
 * 引っ越し時期の全期間分析（/relocation/timing）の**見え方**と**直近の走査**を
 * 端末に残す（利用者の指摘、2026-09-24）。
 *
 *     全期間分析をフィルタリングして、その後またページに戻ると
 *     フィルタリングが消えてまた始めから設定し直す
 *
 * 画面の state にしか持っていなかったので、頁を離れると全部消えていた。
 * 走査はボタンで始める作り（#80）なので、戻るたびに押し直しも要った。
 *
 * ## 何をどこに置くか
 *
 * - **見え方**（走査の範囲・方位・段階の絞り込み・吉日だけ）… localStorage。
 *   数か月後に開いても同じ見方で始まってよい
 * - **直近の走査の結果** … localStorage。ただし**今日を起点にした**結果
 *   なので、日が変わったら使わずに消す
 *
 * どちらも端末の中だけで、サーバーには送らない。走査の結果は生年月日から
 * 出た段階を含むので、「すべて消す」の対象（`ACCOUNT_LOCAL_KEYS`）に
 * 入れてある。見え方は画面の状態なので残す側。
 *
 * ## 読むときは必ず検証する
 *
 * 保存の形が変わった・手で書き換えられた・別の版の値が残っている、の
 * どれでも画面が壊れないように、知らない値は捨てて既定に戻す。
 */

import {
  COMPASS_DIRECTIONS,
  type CompassDirection,
} from "@/utils/directionGeo";
import {
  DAY_CATEGORIES,
  allCategories,
  type DayCategory,
} from "@/lib/timingFilter";

export const TIMING_VIEW_KEY = "timing_view_v1";
export const TIMING_SCAN_KEY = "timing_scan_v1";

/** 画面の選択肢と同じ値だけを受ける。 */
export const PAST_MONTH_OPTIONS = [0, 3, 6, 12] as const;
export const FUTURE_MONTH_OPTIONS = [6, 12, 18, 24] as const;

export interface TimingView {
  pastMonths: number;
  futureMonths: number;
  /**
   * 見ている方位。null は「いちばん良い方位」を画面が選ぶ。画面の state が
   * string なので型も string にし、読むときに八方位だけを通す
   */
  focusDir: string | null;
  tierFilter: Set<DayCategory>;
  luckyOnly: boolean;
}

export const DEFAULT_TIMING_VIEW: TimingView = {
  pastMonths: 6,
  futureMonths: 18,
  focusDir: null,
  tierFilter: allCategories(),
  luckyOnly: false,
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function pick<T extends number>(
  v: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return typeof v === "number" && (options as readonly number[]).includes(v)
    ? (v as T)
    : fallback;
}

/** 保存された見え方を読む。壊れていれば既定。 */
export function readTimingView(storage: StorageLike): TimingView {
  let raw: string | null = null;
  try {
    raw = storage.getItem(TIMING_VIEW_KEY);
  } catch {
    return { ...DEFAULT_TIMING_VIEW, tierFilter: allCategories() };
  }
  const o = parseJson(raw);
  if (!o) return { ...DEFAULT_TIMING_VIEW, tierFilter: allCategories() };

  const tiers = Array.isArray(o.tierFilter)
    ? o.tierFilter.filter((t): t is DayCategory =>
        (DAY_CATEGORIES as readonly unknown[]).includes(t),
      )
    : null;
  return {
    pastMonths: pick(
      o.pastMonths,
      PAST_MONTH_OPTIONS,
      DEFAULT_TIMING_VIEW.pastMonths as 6,
    ),
    futureMonths: pick(
      o.futureMonths,
      FUTURE_MONTH_OPTIONS,
      DEFAULT_TIMING_VIEW.futureMonths as 18,
    ),
    focusDir:
      typeof o.focusDir === "string" &&
      (COMPASS_DIRECTIONS as readonly string[]).includes(o.focusDir)
        ? (o.focusDir as CompassDirection)
        : null,
    /* 1 つも残らなければ全選択に戻す（何も出ない絞り込みで始めない） */
    tierFilter: tiers && tiers.length > 0 ? new Set(tiers) : allCategories(),
    luckyOnly: o.luckyOnly === true,
  };
}

export function writeTimingView(storage: StorageLike, view: TimingView): void {
  try {
    storage.setItem(
      TIMING_VIEW_KEY,
      JSON.stringify({
        pastMonths: view.pastMonths,
        futureMonths: view.futureMonths,
        focusDir: view.focusDir,
        tierFilter: [...view.tierFilter],
        luckyOnly: view.luckyOnly,
      }),
    );
  } catch {
    /* プライベートモード・容量切れ。残せないだけで動作は変わらない */
  }
}

/**
 * 直近の走査。`key` は走らせたときの入力（判定の設定と範囲）、`party` は
 * 同行者。画面は今の入力と比べて「設定が変わりました」を出す（食い違って
 * いても結果は出す。走査を押し直すかは本人が決める）。
 */
export interface TimingScanCache<Day, Member> {
  key: string;
  party: string;
  /** 走らせた日（日本時間の YYYY-MM-DD）。日が変われば捨てる */
  day: string;
  days: Day[];
  members: Member[];
  profile: { honmeiStar: number; voidZodiacs: string[] } | null;
  pastClippedDays: number | null;
}

export function readTimingScan<Day, Member>(
  storage: StorageLike,
  today: string,
): TimingScanCache<Day, Member> | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(TIMING_SCAN_KEY);
  } catch {
    return null;
  }
  const o = parseJson(raw);
  if (!o) return null;
  if (typeof o.key !== "string" || typeof o.party !== "string") return null;
  /* 今日を起点にした結果なので、日が変わったら使わずに消す */
  if (o.day !== today) {
    try {
      storage.removeItem(TIMING_SCAN_KEY);
    } catch {
      /* 消せなくても使わないだけ */
    }
    return null;
  }
  if (!Array.isArray(o.days) || !Array.isArray(o.members)) return null;
  const p = o.profile as Record<string, unknown> | null;
  const profile =
    p &&
    typeof p.honmeiStar === "number" &&
    Array.isArray(p.voidZodiacs) &&
    p.voidZodiacs.every((z) => typeof z === "string")
      ? { honmeiStar: p.honmeiStar, voidZodiacs: p.voidZodiacs as string[] }
      : null;
  return {
    key: o.key,
    party: o.party,
    day: today,
    days: o.days as Day[],
    members: o.members as Member[],
    profile,
    pastClippedDays:
      typeof o.pastClippedDays === "number" ? o.pastClippedDays : null,
  };
}

export function writeTimingScan<Day, Member>(
  storage: StorageLike,
  cache: TimingScanCache<Day, Member>,
): void {
  try {
    storage.setItem(TIMING_SCAN_KEY, JSON.stringify(cache));
  } catch {
    /* 容量切れなど。残せなければ次は押し直すだけ */
  }
}
