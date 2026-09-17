/**
 * 同行者・合流する人の暦を、合流先 1 つに向けて 1 本にまとめる。
 *
 * 時期ツール（/relocation/timing）は 1 人の「日 × 方位」の段階を
 * 2 年ぶん持っている。合流する人が増えると、人ごとに出発地が違うので
 * 同じ合流先でも方位が違い、片方に吉でももう片方に凶、ということが
 * 普通に起きる。ここでは
 *
 *   1. 各人の出発地から合流先への方位を出し（`memberDirection`）
 *   2. その方位のその日の段階を人ごとに引き
 *   3. 物件検索と同じまとめ方（`combineOutcomes`）で 1 日 1 つの判定にする
 *
 * 判定の答え（段階）はエンジンが出したものをそのまま使い、ここは
 * 合成だけを担う。物件検索の「同行者」と規則を分けないため、点数化
 * （`TIER_SCORE`）と「避けるべき」の境目もここに 1 つだけ置く。
 *
 * 暦エンジンを引かない葉。合流先ごとに 47 県 × 730 日を画面側で
 * 回しても軽いよう、依存は方位の計算と合成の 2 つだけにしてある。
 */
import { TIER_LABELS, TIER_ORDER, type DayTier } from "@/utils/dayTier";
import { bearingBetween, directionFromBearing } from "@/utils/directionGeo";
import {
  combineOutcomes,
  summarizeTiming,
  type JointOutcome,
  type MemberOutcome,
  type PartyPolicy,
  type TimingSummary,
} from "@/utils/arbitrageParty";
import type { EightDirection } from "@/utils/ephemerisEngine";

/** API（mode=timeline）が返す 1 日ぶんの行。 */
export interface TimelineRow {
  date: string;
  weekday: number;
  rokuyo: string;
  tags: string[];
  blocked: boolean;
  tiers: Record<string, string>;
}

/** 1 人ぶんの走査結果。API の `members[]` と本人の `days` を同じ形で受ける。 */
export interface MemberTimeline {
  id: string;
  name: string;
  stationary: boolean;
  weight: number;
  baseLat: number;
  baseLon: number;
  days: TimelineRow[];
}

export interface Destination {
  lat: number;
  lon: number;
}

/**
 * 段階 → 点数。
 *
 * `combineOutcomes` は点数で平均を取るので、順序しか持たない段階に
 * 等間隔の点を当てる。「平均」「重み付き」の答えはこの間隔の取り方で
 * 変わる（全員一致は最低点＝最悪の段階なので影響しない）。
 */
export const TIER_SCORE: Record<DayTier, number> = {
  S: 100,
  A: 80,
  B: 60,
  C: 40,
  D: 20,
  X: 0,
};

/**
 * 点数 → 段階。最も近い段階に丸め、ちょうど中間なら悪いほうに倒す。
 *
 * 平均で 70 点（S と C の平均）を A に丸めると「吉 2 盤」と読めて
 * しまう。間に落ちたものは慎重側に倒す。
 */
export function tierFromScore(score: number): DayTier {
  let best: DayTier = "X";
  let bestDist = Infinity;
  // TIER_ORDER は良い順。同じ距離なら後（悪いほう）で上書きする。
  for (const tier of TIER_ORDER) {
    const dist = Math.abs(TIER_SCORE[tier] - score);
    if (dist <= bestDist) {
      bestDist = dist;
      best = tier;
    }
  }
  return best;
}

/** 段階として読めない文字列（古い応答など）は C（凶なし・平）に倒さず X にする。 */
function asTier(raw: string | undefined): DayTier {
  return TIER_ORDER.includes(raw as DayTier) ? (raw as DayTier) : "X";
}

/**
 * その人の出発地から合流先への方位。県塗り（`prefectureDirections`）と
 * 同じ伝統区分で切る。同じ合流先を見ても、人ごとにここが違う。
 */
export function memberDirection(
  member: Pick<MemberTimeline, "baseLat" | "baseLon">,
  destination: Destination,
): EightDirection {
  return directionFromBearing(
    bearingBetween(
      member.baseLat,
      member.baseLon,
      destination.lat,
      destination.lon,
    ),
    "traditional",
  );
}

/**
 * 「避けるべき」の境目。物件検索の `isAvoidStatus` は方位の凶
 * （五黄殺など）と天中殺・空亡を避けるべきに倒す。段階で言えば
 * X（五大凶殺）と D（軽い凶のみ）が方位の凶、`blocked` が天中殺。
 */
function isAvoidTier(tier: DayTier, blocked: boolean): boolean {
  return blocked || tier === "X" || tier === "D";
}

export interface JointDay {
  date: string;
  /** まとめ方に従った総合の段階。 */
  tier: DayTier;
  /** 移動する誰かが天中殺で塞がっているか。 */
  blocked: boolean;
  joint: JointOutcome;
}

function outcomeFor(
  member: MemberTimeline,
  row: TimelineRow | undefined,
  direction: EightDirection,
): MemberOutcome {
  if (member.stationary || !row) {
    return {
      memberId: member.id,
      name: member.name,
      direction: null,
      magneticDirection: null,
      distanceKm: null,
      score: 0,
      status: "",
      isAvoid: false,
      maxFactor: "",
    };
  }
  const tier = asTier(row.tiers[direction]);
  const blocked = row.blocked;
  const label = blocked ? "天中殺" : TIER_LABELS[tier];
  return {
    memberId: member.id,
    name: member.name,
    direction,
    magneticDirection: null,
    distanceKm: null,
    score: blocked ? 0 : TIER_SCORE[tier],
    status: label,
    isAvoid: isAvoidTier(tier, blocked),
    maxFactor: label,
  };
}

function weightsOf(members: MemberTimeline[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const m of members) weights[m.id] = m.weight;
  return weights;
}

/**
 * 全員ぶんを合流先に向けて 1 日ずつまとめる。
 *
 * 日付の並びは「移動する人のうち最初の人」の走査に合わせる。API は
 * 全員に同じ範囲を返すが、日付で突き合わせるので欠けがあっても
 * ずれない（その人はその日の判定に入らない＝移動しない扱い）。
 * 移動する人がいなければ空。
 */
export function jointTimeline(
  members: MemberTimeline[],
  destination: Destination,
  policy: PartyPolicy,
): JointDay[] {
  const movers = members.filter((m) => !m.stationary && m.days.length > 0);
  if (movers.length === 0) return [];
  const directions = new Map<string, EightDirection>();
  const rowsByDate = new Map<string, Map<string, TimelineRow>>();
  for (const m of members) {
    directions.set(m.id, memberDirection(m, destination));
    rowsByDate.set(m.id, new Map(m.days.map((d) => [d.date, d])));
  }
  const weights = weightsOf(members);
  const out: JointDay[] = [];
  for (const anchor of movers[0].days) {
    const outcomes = members.map((m) =>
      outcomeFor(
        m,
        rowsByDate.get(m.id)?.get(anchor.date),
        directions.get(m.id) ?? "N",
      ),
    );
    const joint = combineOutcomes(outcomes, policy, weights);
    out.push({
      date: anchor.date,
      tier: tierFromScore(joint.score),
      blocked: movers.some(
        (m) => rowsByDate.get(m.id)?.get(anchor.date)?.blocked === true,
      ),
      joint,
    });
  }
  return out;
}

/** 1 日だけ。選択日の県塗り（47 県 × 1 日）が使う。 */
export function jointDay(
  members: MemberTimeline[],
  date: string,
  destination: Destination,
  policy: PartyPolicy,
): JointDay | null {
  const narrowed = members.map((m) => ({
    ...m,
    days: m.days.filter((d) => d.date === date),
  }));
  return jointTimeline(narrowed, destination, policy)[0] ?? null;
}

export interface PartyTimingReport extends TimingSummary {
  /** 今日以降で、移動する全員が避けるべき判定に当たらない日（昇順）。 */
  clearDates: string[];
}

/**
 * 「いつなら全員で動けるか」。今日より前の日は数えない（過去の評価は
 * カレンダー側に残るが、これから動ける日の話に混ぜない）。
 */
export function partyTimingReport(
  daily: JointDay[],
  todayIso: string,
): PartyTimingReport {
  const future = daily.filter((d) => d.date >= todayIso);
  const summary = summarizeTiming(
    future.map((d) => ({ date: d.date, joint: d.joint })),
  );
  return {
    ...summary,
    clearDates: future.filter((d) => d.joint.everyoneSafe).map((d) => d.date),
  };
}
