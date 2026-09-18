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
import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
} from "@/utils/directionGeo";
import { isDirectionUnstable } from "@/lib/directionDistance";
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
  return jointFromIndex(indexMembers(members), destination, policy);
}

/**
 * 日付で引ける形に組み直したもの。**合流先が変わっても作り直さない部分。**
 *
 * 合流先ごとに変わるのは方位だけで、各人の「日 → 行」の対応は変わらない。
 * 47 県ぶんの候補を出すとき（`destinationCandidates`）にここを作り直すと、
 * 730 日 × 人数 × 47 回の詰め直しになる。1 回で済ませる。
 */
interface MemberIndex {
  members: MemberTimeline[];
  movers: MemberTimeline[];
  rowsByDate: Map<string, Map<string, TimelineRow>>;
  weights: Record<string, number>;
}

function indexMembers(members: MemberTimeline[]): MemberIndex {
  const rowsByDate = new Map<string, Map<string, TimelineRow>>();
  for (const m of members) {
    rowsByDate.set(m.id, new Map(m.days.map((d) => [d.date, d])));
  }
  return {
    members,
    movers: members.filter((m) => !m.stationary && m.days.length > 0),
    rowsByDate,
    weights: weightsOf(members),
  };
}

function jointFromIndex(
  idx: MemberIndex,
  destination: Destination,
  policy: PartyPolicy,
): JointDay[] {
  if (idx.movers.length === 0) return [];
  const directions = new Map<string, EightDirection>();
  for (const m of idx.members) {
    directions.set(m.id, memberDirection(m, destination));
  }
  const out: JointDay[] = [];
  for (const anchor of idx.movers[0].days) {
    const outcomes = idx.members.map((m) =>
      outcomeFor(
        m,
        idx.rowsByDate.get(m.id)?.get(anchor.date),
        directions.get(m.id) ?? "N",
      ),
    );
    const joint = combineOutcomes(outcomes, policy, idx.weights);
    out.push({
      date: anchor.date,
      tier: tierFromScore(joint.score),
      blocked: idx.movers.some(
        (m) => idx.rowsByDate.get(m.id)?.get(anchor.date)?.blocked === true,
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

/** 候補 1 件ぶんの、人ごとの向き。誰がどちらへ動くかを画面に出すため。 */
export interface CandidateLeg {
  memberId: string;
  name: string;
  /** その人の出発地から見た合流先の方位。移動しない人は null。 */
  direction: EightDirection | null;
  distanceKm: number | null;
  /** 近すぎて方位が定まらない距離か（`DIRECTION_UNSTABLE_KM` 未満）。 */
  unstable: boolean;
}

/** 合流先の候補 1 件。 */
export interface DestinationCandidate extends PartyTimingReport {
  /** 合流先の呼び名（県名）。 */
  name: string;
  /** 今日以降で届く最良の段階。 */
  bestTier: DayTier;
  legs: CandidateLeg[];
  /** 移動する人の誰かが近すぎて、方位が定まらない。 */
  hasUnstableLeg: boolean;
}

/**
 * **どこで合流できるかを、選ばせずに出す。**
 *
 * 合流先を選ばせる作りだと、利用者は 47 回選び直さないと「どこなら
 * 全員で動けるのか」が分からない。人ごとに出発地が違うので、
 * 同じ合流先でも方位が違い、答えは選んでみるまで予想できない。
 * 候補の側から出す。
 *
 * 走査（日 × 方位の段階）は既に人ごとに持っているので、合流先が
 * 増えても暦は引き直さない。変わるのは「その人の出発地からその県への
 * 方位」だけで、あとは同じ段階表を別の列で引くだけ。
 *
 * 並びは**今日以降で全員が動ける日数**の多い順。同数なら最良の段階、
 * さらに同じなら最も早い日で決める。日数が 0 の県も返す（「どこも
 * 0 日」を隠すと、期間を延ばすか人を減らすかの判断ができない）。
 *
 * @param centers 合流先の候補。県の代表点（`PREFECTURE_CENTERS`）を想定。
 * @param todayIso 今日（YYYY-MM-DD）。これより前の日は数えない。
 */
export function destinationCandidates(
  members: MemberTimeline[],
  centers: Record<string, Destination>,
  policy: PartyPolicy,
  todayIso: string,
): DestinationCandidate[] {
  const idx = indexMembers(members);
  if (idx.movers.length === 0) return [];
  const out: DestinationCandidate[] = [];
  for (const [name, center] of Object.entries(centers)) {
    const daily = jointFromIndex(idx, center, policy);
    if (daily.length === 0) continue;
    const report = partyTimingReport(daily, todayIso);
    const legs = idx.members.map((m) => legFor(m, center));
    out.push({
      ...report,
      name,
      bestTier: report.bestDate ? tierFromScore(report.bestScore) : "X",
      legs,
      hasUnstableLeg: legs.some((l) => l.unstable),
    });
  }
  out.sort(
    (a, b) =>
      b.allClearDays - a.allClearDays ||
      TIER_ORDER.indexOf(a.bestTier) - TIER_ORDER.indexOf(b.bestTier) ||
      compareFirstDate(a.nextAllClearDate, b.nextAllClearDate) ||
      a.name.localeCompare(b.name, "ja"),
  );
  return out;
}

/** 早い日が先。無い側は後ろへ。 */
function compareFirstDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function legFor(
  member: MemberTimeline,
  destination: Destination,
): CandidateLeg {
  if (member.stationary) {
    return {
      memberId: member.id,
      name: member.name,
      direction: null,
      distanceKm: null,
      unstable: false,
    };
  }
  const distanceKm = distanceKmBetween(
    member.baseLat,
    member.baseLon,
    destination.lat,
    destination.lon,
  );
  return {
    memberId: member.id,
    name: member.name,
    direction: memberDirection(member, destination),
    distanceKm,
    /* 近すぎる移動では方位がピンの置き方で決まる（lib/directionDistance）。
       判定は変えず、当てにならないことだけを画面へ渡す。県の代表点は
       県庁所在地あたりなので、同じ県に住んでいる人で実際に起きる。 */
    unstable: isDirectionUnstable(distanceKm),
  };
}
