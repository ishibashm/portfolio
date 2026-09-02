import {
  ALL_DIRECTIONS,
  DIRECTION_LABELS,
  gradeVerdict,
  judgeDayAllDirections,
} from "@/utils/auspiciousDays";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";
import type { DirectionFilterMode } from "@/utils/directionFilterMode";
import { prefectureDirections } from "@/lib/prefectureDirection";

/**
 * 物件検索の「選択日の盤」。方位別と県別の段階を 1 回で組む。
 *
 * ## なぜ page.tsx から切り出したか
 *
 * この計算は暦エンジン（lunar-javascript・astronomy-engine）を引く。
 * page.tsx の中に useMemo で置いてあった頃は、**判定に要る値が揃って
 * いない人にも**、頁を開いた時点でエンジン一式（gzip 約 135 KB、頁の
 * JS の 4 割）が読み込まれていた（docs/improvement-backlog.md 17 節）。
 *
 * ここに置いて page.tsx から `import()` で遅延読み込みすると、初回の
 * HTML と最初の描画にはエンジンが乗らず、判定は揃った時点で追って出る。
 * **計算そのものは 1 行も変えていない。**中身は以前の useMemo の本体を
 * そのまま写したもので、__tests__/dayKigakuClient.test.ts が旧実装の
 * 写しと突き合わせている。
 *
 * ここが「その日・その方位が動けるか」の唯一の情報源。地図の扇形、
 * 俯瞰の県塗り、時期パネルの「選択日」列がすべてこの結果を読む。
 * 本命星は時期スクリーニングと同じく classical を使う。
 */
export interface DayKigakuCell {
  direction: string;
  directionLabel: string;
  tier: string;
  blocked: boolean;
  /** 段階だけだと「五大凶殺あり」に見えるが、土用殺は五大凶殺ではない。
      理由を落とさずに渡す（SpotVerdict が 1 行で出す）。 */
  doyouSatsu: boolean;
}

export interface DayKigaku {
  byDirection: Record<string, DayKigakuCell>;
  byPrefecture: Record<string, DayKigakuCell>;
}

export interface DayKigakuInput {
  /** YYYY-MM-DD か ISO。空なら判定しない。 */
  birthDate: string;
  /** YYYY-MM-DD */
  targetDate: string;
  baseLat: string;
  baseLon: string;
  tenchusatsuMode: string;
  involuntaryMove: boolean;
  directionFilterMode: DirectionFilterMode;
  useClassical: boolean;
}

export function computeDayKigaku(p: DayKigakuInput): DayKigaku | undefined {
  try {
    const bd = new Date(
      p.birthDate.includes("T") ? p.birthDate : `${p.birthDate}T12:00:00+09:00`,
    );
    if (isNaN(bd.getTime())) return undefined;
    const honmei = getHonmeiStar(bd);
    const all = judgeDayAllDirections(
      new Date(`${p.targetDate}T12:00:00+09:00`),
      {
        honmeiStar: honmei.classical,
        voidZodiacs: getPersonalVoidZodiac(bd),
        lon: Number(p.baseLon),
        tenchusatsuMode: p.tenchusatsuMode as never,
        involuntaryMove: p.involuntaryMove,
        directionFilterMode: p.directionFilterMode,
      },
    );
    const byDirection: Record<string, DayKigakuCell> = {};
    for (const dir of ALL_DIRECTIONS) {
      const v = all[dir];
      if (!v) continue;
      byDirection[dir] = {
        direction: dir,
        directionLabel: DIRECTION_LABELS[dir] ?? dir,
        tier: gradeVerdict(v),
        blocked: v.blockedByTenchusatsu,
        doyouSatsu: v.isDoyouSatsu,
      };
    }
    /* 県の代表点は巡回起点（概ね県庁所在地）ではなく面積重心
       （lib/prefectureDirection）。県庁は県の端にあることが多く、
       兵庫（神戸=南東端）が京都から「南西」に塗られていた
       （利用者報告 2026-08-27。__tests__/prefectureDirection で固定）。 */
    const prefDirs = prefectureDirections(
      Number(p.baseLat),
      Number(p.baseLon),
      p.useClassical ? "traditional" : "physical",
    );
    const byPrefecture: Record<string, DayKigakuCell> = {};
    for (const [name, dir] of Object.entries(prefDirs)) {
      const cell = byDirection[dir];
      if (!cell) continue;
      byPrefecture[name] = cell;
    }
    return { byDirection, byPrefecture };
  } catch {
    return undefined;
  }
}
