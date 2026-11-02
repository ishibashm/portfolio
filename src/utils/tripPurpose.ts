/**
 * 用事の種類（purpose）ごとに、どの盤で方位を見るか。
 *
 * 本人の方針（2026-11-02）:
 *
 * - 日帰り（daytrip）      … 日盤
 * - 1〜2 泊（short_stay）  … 月盤＋日盤
 * - 引越し（relocation）   … 年盤＋月盤
 *
 * 従来の判定（purpose を指定しない呼び出し）は年盤・月盤・日盤の三盤を
 * 合成していて、それは**そのまま残す**。purpose はあくまで任意の入力で、
 * 省略時の応答は変わらない（MCP の既存利用者を壊さない）。
 *
 * 天中殺も同じ考え方で、用事に関係する盤の範囲だけを見る（日帰りなら
 * 日の空亡、引越しなら年・月の空亡）。時刻（刻）単位の天中殺はどの用事でも
 * 使わない。
 *
 * このファイルは暦エンジンを引かない葉（noiseSeverity と dayTier だけ）。
 */
import {
  isAuspiciousStatus,
  isFatalNoise,
  isNoise,
} from "@/utils/noiseSeverity";
import type { DayTier } from "@/utils/dayTier";
import type { TenchusatsuScope, VoidScopes } from "@/utils/tenchusatsuPolicy";

export type TripPurpose = "daytrip" | "short_stay" | "relocation";

export const TRIP_PURPOSES: readonly TripPurpose[] = [
  "daytrip",
  "short_stay",
  "relocation",
];

export type BoardName = "year" | "month" | "day";

/** purpose ごとに見る盤。天中殺の範囲もこれと同じにする。 */
export const PURPOSE_BOARDS: Record<TripPurpose, readonly BoardName[]> = {
  daytrip: ["day"],
  short_stay: ["month", "day"],
  relocation: ["year", "month"],
};

export const PURPOSE_LABELS: Record<TripPurpose, string> = {
  daytrip: "日帰り（日盤）",
  short_stay: "1〜2泊（月盤＋日盤）",
  relocation: "引越し（年盤＋月盤）",
};

/** purpose を省略したときに使う盤（従来どおり三盤）。 */
export const DEFAULT_BOARDS: readonly BoardName[] = ["year", "month", "day"];

export function isTripPurpose(value: unknown): value is TripPurpose {
  return (
    typeof value === "string" &&
    (TRIP_PURPOSES as readonly string[]).includes(value)
  );
}

export function boardsForPurpose(
  purpose: TripPurpose | undefined,
): readonly BoardName[] {
  return purpose ? PURPOSE_BOARDS[purpose] : DEFAULT_BOARDS;
}

/** 用事に関係しない盤の空亡を外す。purpose 省略時はそのまま。 */
export function voidScopesForPurpose(
  scopes: VoidScopes,
  purpose: TripPurpose | undefined,
): VoidScopes {
  if (!purpose) return scopes;
  const boards = PURPOSE_BOARDS[purpose];
  return {
    year: scopes.year && boards.includes("year"),
    month: scopes.month && boards.includes("month"),
    day: scopes.day && boards.includes("day"),
  };
}

export function activeVoidScopes(scopes: VoidScopes): TenchusatsuScope[] {
  const out: TenchusatsuScope[] = [];
  if (scopes.year) out.push("year");
  if (scopes.month) out.push("month");
  if (scopes.day) out.push("day");
  return out;
}

export interface LayeredVerdict {
  yearLayer: string;
  monthLayer: string;
  dayLayer: string;
  /** 三盤合成の最終。土用殺（NOISE_DOYOU）は層に出ずここだけに出る。 */
  finalStatus: string;
}

function layersOf(v: LayeredVerdict, boards: readonly BoardName[]): string[] {
  return boards.map((b) =>
    b === "year" ? v.yearLayer : b === "month" ? v.monthLayer : v.dayLayer,
  );
}

/**
 * 用事の盤だけで段階を出す。意味は gradeVerdict と同じ並び:
 *
 *   S 使う盤がすべて吉 / A 吉2盤・凶なし / B 吉1盤・凶なし / C 凶なし（平）
 *   D 軽い凶のみ / X 五大凶殺あり
 *
 * 土用殺は盤を問わず方位の禁忌なので、どの用事でも凶として数える。
 */
export function gradeForPurpose(
  v: LayeredVerdict,
  purpose: TripPurpose,
): DayTier {
  const layers = layersOf(v, PURPOSE_BOARDS[purpose]);
  const doyou = v.finalStatus === "NOISE_DOYOU";
  const noises = layers.filter((s) => isNoise(s));
  if (noises.some((s) => isFatalNoise(s))) return "X";
  if (noises.length > 0 || doyou) return "D";
  const good = layers.filter((s) => isAuspiciousStatus(s)).length;
  if (good === layers.length) return "S";
  if (good >= 2) return "A";
  if (good === 1) return "B";
  return "C";
}

/** 用事の盤だけで見た状態。凶があれば最も重い凶、無ければ吉、無ければ SAFE。 */
export function statusForPurpose(
  v: LayeredVerdict,
  purpose: TripPurpose,
): string {
  const layers = layersOf(v, PURPOSE_BOARDS[purpose]);
  const fatal = layers.find((s) => isFatalNoise(s));
  if (fatal) return fatal;
  if (v.finalStatus === "NOISE_DOYOU") return v.finalStatus;
  const noise = layers.find((s) => isNoise(s));
  if (noise) return noise;
  return layers.find((s) => isAuspiciousStatus(s)) ?? "SAFE";
}

/** 凶の無い段階。吉方位として返す範囲（C の「平」は含めない）。 */
export const AUSPICIOUS_TIERS: ReadonlySet<DayTier> = new Set(["S", "A", "B"]);
