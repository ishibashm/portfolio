import {
  ALL_DIRECTIONS,
  type AuspiciousDayParams,
  gradeVerdict,
  judgeDayAllDirections,
} from "@/utils/auspiciousDays";
import {
  getHonmeiStar,
  getPersonalVoidZodiac,
  parseDirectionFilterMode,
} from "@/utils/ephemerisEngine";
import { forecastAnchorMs } from "@/utils/boardInstant";
import {
  DEFAULT_TENCHUSATSU_MODE,
  isTenchusatsuMode,
  type TenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";
import { parseJapanDateTime } from "@/utils/japanDate";
import { DIRECTION_LABELS } from "@/lib/kigakuContent";

/** 生年月日・日付の受け口。YYYY-MM-DD を日本時間の正午に寄せる（4.1 節）。 */
/*
  日付だけ（YYYY-MM-DD）は日本時間の正午。時刻つきは utils/japanDate の
  parseJapanDateTime（時差の指定が無ければ +09:00 を補う）に通す。

  以前は時刻つきを素の new Date に渡していた。時差の指定が無い
  "2026-11-08T20:00" は実行環境の時刻で読まれ、本番（UTC）では日本時間の
  翌 05:00 になって**判定する日が 1 日ずれる**（CLAUDE.md 3 節の罠。
  画面側は #1092〜 で塞いだが、ここだけ残っていた）。
*/
export function parseJstDate(value: string): Date | null {
  const d = value.includes("T")
    ? parseJapanDateTime(value)
    : new Date(`${value}T12:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 生年月日と経度から判定の材料を組む。auspicious-days route と同じ手順。 */
type BuiltBase =
  | { ok: false; error: string }
  | {
      ok: true;
      honmei: ReturnType<typeof getHonmeiStar>;
      voidZodiacs: string[];
      tenchusatsuMode: TenchusatsuMode;
      base: Omit<AuspiciousDayParams, "direction">;
    };

export function buildBase(input: {
  birthDate?: string | undefined;
  lon?: number | undefined;
  tenchusatsuMode?: string | undefined;
  involuntaryMove?: boolean | undefined;
  directionFilterMode?: string | undefined;
}): BuiltBase {
  const birth = input.birthDate ? parseJstDate(input.birthDate) : null;
  if (!birth)
    return { ok: false, error: "birthDate は YYYY-MM-DD で指定してください。" };
  if (typeof input.lon !== "number" || !Number.isFinite(input.lon)) {
    return {
      ok: false,
      error: "lon（出発地の経度）は数値で指定してください。",
    };
  }
  const raw = input.tenchusatsuMode ?? DEFAULT_TENCHUSATSU_MODE;
  const tenchusatsuMode: TenchusatsuMode = isTenchusatsuMode(raw)
    ? raw
    : DEFAULT_TENCHUSATSU_MODE;
  const honmei = getHonmeiStar(birth);
  const voidZodiacs = getPersonalVoidZodiac(birth);
  return {
    ok: true,
    honmei,
    voidZodiacs,
    tenchusatsuMode,
    base: {
      honmeiStar: honmei.classical,
      voidZodiacs,
      lon: input.lon,
      tenchusatsuMode,
      involuntaryMove: input.involuntaryMove === true,
      directionFilterMode: parseDirectionFilterMode(input.directionFilterMode),
    },
  };
}

/** 既存公開MCPの入力解釈と出力をそのまま共有する。個人データの読取はしない。 */
export function calculateMcpDirections(
  input: Parameters<typeof buildBase>[0] & { date?: string },
  requestedAt = new Date(),
) {
  const built = buildBase(input);
  if (!built.ok) return { ok: false as const, error: built.error };
  const day = input.date ? parseJstDate(input.date) : requestedAt;
  if (!day)
    return {
      ok: false as const,
      error: "date は YYYY-MM-DD で指定してください。",
    };
  const all = judgeDayAllDirections(
    new Date(forecastAnchorMs(day)),
    built.base,
  );
  const any = all[ALL_DIRECTIONS[0]];
  const directions = ALL_DIRECTIONS.map((dir) => {
    const v = all[dir];
    return {
      direction: dir,
      label: DIRECTION_LABELS[dir as keyof typeof DIRECTION_LABELS],
      tier: gradeVerdict(v),
      status: v.finalStatus,
      yearLayer: v.yearLayer,
      monthLayer: v.monthLayer,
      dayLayer: v.dayLayer,
      isTripleAuspicious: v.isTripleAuspicious,
      hasTendo: v.hasTendo,
      isDoyouSatsu: v.isDoyouSatsu,
    };
  });
  return {
    ok: true as const,
    payload: {
      date: any.date,
      weekday: any.weekday,
      rokuyo: any.rokuyo,
      tags: any.tags,
      blockedByTenchusatsu: any.blockedByTenchusatsu,
      honmeiStar: built.honmei.classical,
      voidZodiacs: built.voidZodiacs,
      tenchusatsuMode: built.tenchusatsuMode,
      directions,
      tiers:
        "S 三盤吉 / A 吉2盤 / B 吉1盤 / C 平 / D 軽い凶 / X 五大凶殺・天中殺",
    },
  };
}
