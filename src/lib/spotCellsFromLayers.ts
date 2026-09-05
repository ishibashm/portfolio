import { stepDayTier } from "@/lib/stepTier";
import { COMPASS_DIRECTIONS, DIRECTION_LABELS } from "@/utils/directionGeo";
import type { DirectionCell } from "@/components/relocation/SpotVerdict";

/**
 * 年盤・月盤・日盤・最終の 4 層（MagneticMapInner の `layers`）から、
 * 名所・登録地点の吹き出しが読む 8 方位のセル（`DirectionCell`）を組む。
 *
 * ## なぜ別ファイルか
 *
 * 段階は `stepDayTier`（＝ `gradeVerdict`。段階はサイト全体で 1 系統）で
 * 出す。これは暦エンジン（`utils/auspiciousDays`）を値で引くので、
 * **物件検索の地図が読む `lib/powerSpots` には置かない**（backlog 17 節。
 * 物件検索が重いのは暦エンジンが client に乗るため）。ダッシュボードは
 * もともとエンジンを積んでいるので、そこで読む分には増えない。
 *
 * ## 土用殺
 *
 * 最終だけを NOISE_GOU で上書きするので、段階は NOISE_GOU のまま
 * （X）。理由の 1 行のために `doyouSatsu` を立てるだけ（SpotVerdict の
 * `DirectionCell.doyouSatsu` と同じ扱い）。
 */
export interface BoardLayers {
  yearLayer: Partial<Record<string, string>>;
  monthLayer: Partial<Record<string, string>>;
  dayLayer: Partial<Record<string, string>>;
  finalVectors: Record<string, string>;
}

export function spotCellsFromLayers(
  layers: BoardLayers | null | undefined,
  doyouSatsuDirection: string | null | undefined,
): Record<string, DirectionCell> | undefined {
  if (!layers) return undefined;
  const out: Record<string, DirectionCell> = {};
  for (const dir of COMPASS_DIRECTIONS) {
    const status = layers.finalVectors[dir];
    if (!status) continue;
    out[dir] = {
      direction: dir,
      directionLabel: DIRECTION_LABELS[dir],
      tier: stepDayTier({
        status,
        details: {
          yearLayer: layers.yearLayer[dir] ?? "SAFE",
          monthLayer: layers.monthLayer[dir] ?? "SAFE",
          dayLayer: layers.dayLayer[dir] ?? "SAFE",
        },
      }),
      blocked: false,
      doyouSatsu: dir === doyouSatsuDirection,
    };
  }
  return out;
}
