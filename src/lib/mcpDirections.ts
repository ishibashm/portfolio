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
  TENCHUSATSU_WEAK_NOTE,
  evaluateTenchusatsu,
  filterModeUsesTenchusatsu,
  isTenchusatsuMode,
  type TenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";
import {
  AUSPICIOUS_TIERS,
  PURPOSE_LABELS,
  activeVoidScopes,
  boardsForPurpose,
  gradeForPurpose,
  statusForPurpose,
  voidScopesForPurpose,
  type TripPurpose,
} from "@/utils/tripPurpose";
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

/** 天中殺の日に、禁止しない設定のとき添える注記を組む。 */
export function tenchusatsuNoteFor(verdict: {
  inVoidPeriod: boolean;
  blocks: boolean;
}): string | null {
  if (!verdict.inVoidPeriod) return null;
  if (verdict.blocks)
    return "天中殺の扱いが禁止する設定のため、この日は移転不可として扱っています。auspiciousDirections は天中殺を除いた判定の参考です。";
  return TENCHUSATSU_WEAK_NOTE;
}

export const PURPOSE_TIERS_LEGEND =
  "S 使う盤すべて吉 / A 吉2盤 / B 吉1盤 / C 平 / D 軽い凶 / X 五大凶殺";

/**
 * 既存公開MCPの入力解釈と出力をそのまま共有する。個人データの読取はしない。
 *
 * purpose（用事の種類）を省略すると従来どおり三盤（年・月・日）の判定。
 * 指定すると tier / status はその用事の盤だけで出し、三盤の値は
 * threeBoardTier / threeBoardStatus に残す。天中殺は禁止の有無に
 * かかわらず方位の段階を変えない（期間の扱いは tenchusatsu 欄で返す）。
 */
export function calculateMcpDirections(
  input: Parameters<typeof buildBase>[0] & {
    date?: string;
    purpose?: TripPurpose | undefined;
  },
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
  const purpose = input.purpose;
  const all = judgeDayAllDirections(
    new Date(forecastAnchorMs(day)),
    built.base,
  );
  const any = all[ALL_DIRECTIONS[0]];
  const directions = ALL_DIRECTIONS.map((dir) => {
    const v = all[dir];
    const threeBoard = {
      tier: gradeVerdict(v),
      status: v.finalStatus,
    };
    return {
      direction: dir,
      label: DIRECTION_LABELS[dir as keyof typeof DIRECTION_LABELS],
      ...(purpose
        ? {
            tier: gradeForPurpose(v, purpose),
            status: statusForPurpose(v, purpose),
            threeBoardTier: threeBoard.tier,
            threeBoardStatus: threeBoard.status,
          }
        : threeBoard),
      yearLayer: v.yearLayer,
      monthLayer: v.monthLayer,
      dayLayer: v.dayLayer,
      isTripleAuspicious: v.isTripleAuspicious,
      hasTendo: v.hasTendo,
      isDoyouSatsu: v.isDoyouSatsu,
    };
  });

  // 期間の天中殺。purpose があれば用事の盤の範囲だけで評価し直す。
  // 省略時は judgeDay と同じ評価（従来の blockedByTenchusatsu と一致）。
  const scopes = voidScopesForPurpose(any.voidScopes, purpose);
  const effectiveMode = filterModeUsesTenchusatsu(
    built.base.directionFilterMode ?? "composite",
  )
    ? built.tenchusatsuMode
    : "off";
  const verdict = evaluateTenchusatsu(
    scopes,
    effectiveMode,
    built.base.involuntaryMove ?? false,
  );
  const blocked = purpose ? verdict.blocks : any.blockedByTenchusatsu;

  return {
    ok: true as const,
    payload: {
      date: any.date,
      weekday: any.weekday,
      rokuyo: any.rokuyo,
      tags: any.tags,
      blockedByTenchusatsu: blocked,
      honmeiStar: built.honmei.classical,
      voidZodiacs: built.voidZodiacs,
      tenchusatsuMode: built.tenchusatsuMode,
      purpose: purpose ?? null,
      boardsUsed: [...boardsForPurpose(purpose)],
      purposeLabel: purpose ? PURPOSE_LABELS[purpose] : "三盤（年盤・月盤・日盤）",
      tenchusatsu: {
        inPeriod: verdict.inVoidPeriod,
        scopes: activeVoidScopes(scopes),
        blocks: blocked,
        attenuation: verdict.attenuation,
        note: tenchusatsuNoteFor({
          inVoidPeriod: verdict.inVoidPeriod,
          blocks: blocked,
        }),
      },
      // 天中殺（期間）を除いた判定の吉方位。天中殺の日でも空にしない。
      auspiciousDirections: directions
        .filter((d) => AUSPICIOUS_TIERS.has(d.tier))
        .map((d) => d.direction),
      // 暦注は目安。判定（tier / status / blocked）には使っていない。
      almanac: {
        rokuyo: any.rokuyo,
        ichiryumanbai: any.isIchiryumanbai,
        tensha: any.isTensho,
        note: "六曜・一粒万倍日・天赦日は目安の情報で、方位の判定には使っていません。",
      },
      directions,
      tiers: purpose
        ? PURPOSE_TIERS_LEGEND
        : "S 三盤吉 / A 吉2盤 / B 吉1盤 / C 平 / D 軽い凶 / X 五大凶殺・天中殺",
    },
  };
}
