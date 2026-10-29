import { STAR_NAMES, STARS, getYearDirections } from "@/lib/kigakuContent";
import { fourLuckyForStar, originOptions } from "@/lib/relocationStepNavigator";
import {
  RelocationStepNavigatorClient,
  type StarStep,
} from "@/components/houi/RelocationStepNavigatorClient";

/** 年盤の判定から、ステップ 1・3 の表示データを作る（サーバー側のみ）。 */
export function buildStarStep(year: number, star: number): StarStep {
  const { verdicts } = getYearDirections(year, star);
  return {
    star,
    name: STAR_NAMES[star],
    good: verdicts.filter((v) => v.kind === "good").map((v) => v.direction),
    bad: verdicts
      .filter((v) => v.kind === "bad")
      .map((v) => ({ direction: v.direction, label: v.label })),
    fourLucky: fourLuckyForStar(star),
  };
}

/**
 * 方位 → 街と家賃 → 部屋の向き、の 3 ステップ導線。
 * star を渡すとその本命星に固定、渡さなければ利用者が選ぶ。
 */
export function RelocationStepNavigator({
  year,
  star,
}: {
  year: number;
  star?: number;
}) {
  const stars = star ? [star] : STARS;
  return (
    <RelocationStepNavigatorClient
      year={year}
      initialStar={star ?? null}
      steps={stars.map((s) => buildStarStep(year, s))}
      origins={originOptions()}
    />
  );
}
