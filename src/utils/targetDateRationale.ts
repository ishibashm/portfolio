import {
  DIRECTION_LABELS,
  TIER_ORDER,
  type DayTier,
} from "@/utils/auspiciousDays";

/**
 * 「その目標日でよいのか」を、選んだ日そのものについて答える。
 *
 * 移住先を比べる画面には目標日の入力欄があるが、**入れた日が良い日なのか
 * どこにも出ていなかった。**利用者からそのまま指摘を受けている——
 * 「目標日は設定できるけど、その目標日が根拠あるものにするのに」。
 *
 * 時期分析（`/relocation/timing`）は全日 × 全方位を一望する画面で、
 * 問いが違う。ここが答えるのは 3 つだけ。
 *
 *   1. 選んだ日は、方位ごとに何段階か
 *   2. もっと良い日が近くにあるか。何日ずらせばよいか
 *   3. この範囲でいちばん良いのはいつか
 *
 * **判定は作らない。**段階は `/api/relocation/auspicious-days?mode=timeline`
 * が返すものをそのまま読む。ここで別に計算すると、同じ日なのに時期分析の
 * ヒートマップと色が食い違う。
 */

/** timeline が返す 1 日ぶん。API の形をそのまま写す。 */
export interface TimelineDay {
  /** YYYY-MM-DD */
  date: string;
  weekday: number;
  rokuyo: string;
  tags: string[];
  /** 天中殺で塞がる日。方位ではなく日で決まる。 */
  blocked: boolean;
  /** 方位 → 段階（S〜X）。 */
  tiers: Record<string, string>;
}

/** 目標日からの距離つきの候補日。 */
export interface DayCandidate {
  date: string;
  tier: DayTier;
  /** 目標日から何日離れているか。前後の向きは `daysFromTarget` が持つ。 */
  daysAway: number;
  /** 負なら目標日より前、正なら後。 */
  daysFromTarget: number;
  tags: string[];
}

export interface DirectionAdvice {
  direction: string;
  directionLabel: string;
  /** 目標日のその方位の段階。目標日が範囲外なら null。 */
  tier: DayTier | null;
  /** 目標日が天中殺で塞がっているか。 */
  blocked: boolean;
  /** 目標日より段階が良い、いちばん近い日。無ければ null。 */
  better: DayCandidate | null;
  /** この範囲でその方位の最良段階の、いちばん近い日。無ければ null。 */
  best: DayCandidate | null;
}

export interface TargetDateRationale {
  /** 目標日が走査範囲に入っていたか。外れていれば助言は出せない。 */
  targetInRange: boolean;
  /** 目標日のその日の情報（六曜・天赦日など）。範囲外なら null。 */
  target: TimelineDay | null;
  /** 8 方位ぶん。段階の良い順に並ぶ。 */
  advice: DirectionAdvice[];
}

/** 段階の強さ。小さいほど良い。表に無い値はいちばん下に落とす。 */
export function tierRank(tier: string): number {
  const i = TIER_ORDER.indexOf(tier as DayTier);
  return i < 0 ? TIER_ORDER.length : i;
}

function isTier(value: string): value is DayTier {
  return TIER_ORDER.includes(value as DayTier);
}

function daysBetween(a: string, b: string): number {
  const ms =
    Date.parse(`${b}T12:00:00+09:00`) - Date.parse(`${a}T12:00:00+09:00`);
  return Math.round(ms / 86_400_000);
}

/**
 * 候補のうち目標日にいちばん近いものを選ぶ。
 *
 * 同じ距離で前後に 1 つずつ来たときは**前を採る**。引越しは後ろへ
 * ずらすほど契約や解約の締切に当たりやすく、前倒しのほうが選びやすい。
 */
function nearest(candidates: DayCandidate[]): DayCandidate | null {
  let best: DayCandidate | null = null;
  for (const c of candidates) {
    if (!best) {
      best = c;
      continue;
    }
    if (c.daysAway < best.daysAway) best = c;
    else if (
      c.daysAway === best.daysAway &&
      c.daysFromTarget < best.daysFromTarget
    )
      best = c;
  }
  return best;
}

/**
 * 目標日について、方位ごとの助言を組み立てる。
 *
 * 天中殺で塞がる日は候補にしない。段階が S でも動けない日なので、
 * 「もっと良い日があります」と出すと嘘になる。
 */
export function adviseTargetDate(
  days: TimelineDay[],
  targetDate: string,
): TargetDateRationale {
  const target = days.find((d) => d.date === targetDate) ?? null;
  const directions = Object.keys(target?.tiers ?? days[0]?.tiers ?? {});

  const advice: DirectionAdvice[] = directions.map((direction) => {
    const raw = target?.tiers[direction];
    const tier = raw && isTier(raw) ? raw : null;
    const blocked = target?.blocked ?? false;

    const candidates: DayCandidate[] = [];
    for (const d of days) {
      if (d.date === targetDate) continue;
      if (d.blocked) continue;
      const t = d.tiers[direction];
      if (!t || !isTier(t)) continue;
      const delta = daysBetween(targetDate, d.date);
      candidates.push({
        date: d.date,
        tier: t,
        daysAway: Math.abs(delta),
        daysFromTarget: delta,
        tags: d.tags,
      });
    }

    /*
      「より良い」は、目標日が塞がっているときは段階に関係なく成り立つ。
      塞がった日はどの段階でも動けないので、動ける日はすべて上になる。
    */
    const betterThanTarget = candidates.filter((c) =>
      blocked || tier === null ? true : tierRank(c.tier) < tierRank(tier),
    );

    const bestRank = candidates.reduce(
      (acc, c) => Math.min(acc, tierRank(c.tier)),
      TIER_ORDER.length,
    );
    const bestOnes = candidates.filter((c) => tierRank(c.tier) === bestRank);

    return {
      direction,
      directionLabel: DIRECTION_LABELS[direction] ?? direction,
      tier,
      blocked,
      better: nearest(betterThanTarget),
      best: nearest(bestOnes),
    };
  });

  advice.sort(
    (a, b) =>
      tierRank(a.tier ?? "X") - tierRank(b.tier ?? "X") ||
      a.direction.localeCompare(b.direction),
  );

  return { targetInRange: !!target, target, advice };
}
