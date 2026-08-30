import {
  gradeVerdict,
  isAuspicious,
  type DayTier,
} from "@/utils/auspiciousDays";

/**
 * シミュレータのステップ判定（方位×出発日）を、サイト共通の段階
 * （S〜X）に写す。
 *
 * ## なぜ要るか
 *
 * シミュレータは出発日の良し悪しを nbaEngine の Q 値で出していた。
 * Q 値は他のどの画面にも出てこない孤立した指標で、「評価はサイト共通の
 * 段階 1 系統」という方針（#698。利用者の指摘が発端）に反していた。
 *
 * ステップの判定には段階の材料——最終判定と年・月・日の 3 盤の層——が
 * すべて入っている。**段階の割り当てはここで書かない。**カレンダー・
 * 時期分析と同じ gradeVerdict にそのまま渡す。だからシミュレータの
 * 「出発日の段階」とカレンダーのマスの色は必ず同じ規則で決まる。
 *
 * isTripleAuspicious の組み立ても auspiciousDays.verdict と同じ式
 * （最終と 3 層のすべてが吉）を使う。
 */

export interface StepEvaluationLayers {
  status: string;
  details: {
    yearLayer: string;
    monthLayer: string;
    dayLayer: string;
  };
}

export function stepDayTier(ev: StepEvaluationLayers): DayTier {
  const { yearLayer, monthLayer, dayLayer } = ev.details;
  const finalStatus = ev.status;
  return gradeVerdict({
    yearLayer,
    monthLayer,
    dayLayer,
    finalStatus,
    isTripleAuspicious:
      isAuspicious(finalStatus) &&
      isAuspicious(yearLayer) &&
      isAuspicious(monthLayer) &&
      isAuspicious(dayLayer),
  });
}
