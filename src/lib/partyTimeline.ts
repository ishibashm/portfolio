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
import { decodeBlockCause } from "@/lib/blockCause";
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
  /**
   * 方位ごとの「なぜ塞がっているか」の符号（`lib/blockCause`）。
   * 古い応答には無いので任意。無ければ段階の名前だけで出す。
   */
  causes?: Record<string, string>;
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
  /*
    最も重い要因は**凶の名前**で持つ（「年盤の本命的殺」など）。段階の
    名前（「五大凶殺あり」）では、本命殺なのか五黄殺なのかが画面で言えず、
    天中殺が入っているのではと推測させた（利用者報告 2026-09-19）。
    符号が無い古い応答では段階の名前に落ちる。
  */
  const cause = blocked ? "天中殺" : decodeBlockCause(row.causes?.[direction]);
  return {
    memberId: member.id,
    name: member.name,
    direction,
    magneticDirection: null,
    distanceKm: null,
    score: blocked ? 0 : TIER_SCORE[tier],
    status: label,
    isAvoid: isAvoidTier(tier, blocked),
    maxFactor: cause || label,
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
 * 47 県ぶんの候補を出すとき（`destinationCandidates`）は 1 回で済ませる。
 *
 * **効きは大きくない。**730 日 × 47 県を暖機後 7 回の中央値で測ると
 *
 *     1 人  22.3ms → 20.8ms     2 人  32.8ms → 28.9ms
 *     4 人  56.7ms → 46.2ms（約 18%）
 *
 * 費やしているのは詰め直しではなく `combineOutcomes` のほうだった。
 * 最初は「730 日 × 人数 × 47 回の詰め直しになる」と書いていたが、
 * **測る前に書いた誇張**で、桁で効くわけではない。分けたこと自体は
 * 索引と合成の役割が分かれて読みやすいので残す。
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

/** 「最初の 1 日が出るまで」を塞いでいた人と理由。 */
export interface BlockingReason {
  memberId: string;
  name: string;
  direction: EightDirection | null;
  /** その期間でいちばん多かった理由（段階の名前、または「天中殺」）。 */
  status: string;
  /**
   * その期間でいちばん多かった**凶の名前**（「年盤の本命的殺」など。
   * 天中殺なら「天中殺」）。走査の応答に符号が無ければ空。
   */
  cause: string;
  /** 避けるべきと判定された日数。 */
  days: number;
}

export interface BlockingSummary {
  /** 最初に全員で動ける日。無ければ null（走査の最後まで出なかった）。 */
  until: string | null;
  /** 調べた日数（今日から `until` の前日まで。`until` が無ければ最後まで）。 */
  scanned: number;
  /** 塞いでいた人。多い順。 */
  reasons: BlockingReason[];
}

/**
 * **なぜ最初の日がそこまで出ないのか**を人ごとに分けて返す。
 *
 * 利用者の指摘（2026-09-19）。合流できる日が 1 年半先になっていて、
 * **画面がその理由を何も出していなかった。**「天中殺が入っているのでは」
 * と推測させてしまい、実際には別の理由だった、ということが起きる。
 *
 * `summarizeTiming` の `alwaysBlockedBy` は**走査した全日で塞がっていた人**
 * しか出さない。途中で開く場合（2028 年に開く、など）は 1 件も出ないので、
 * いちばん知りたい「それまで何が塞いでいたのか」が空になる。
 *
 * ここでは**今日から最初の 1 日の前日まで**を見て、人ごとにいちばん多かった
 * 理由を返す。理由は既に `MemberOutcome.status` に入っている（段階の名前か
 * 「天中殺」）ので、新しく判定はしない。
 */
export function blockingReasons(
  daily: JointDay[],
  todayIso: string,
): BlockingSummary {
  const future = daily.filter((d) => d.date >= todayIso);
  const firstClear = future.find((d) => d.joint.everyoneSafe) ?? null;
  const until = firstClear?.date ?? null;
  const window = until ? future.filter((d) => d.date < until) : future;

  const counts = new Map<
    string,
    {
      name: string;
      direction: EightDirection | null;
      days: number;
      byStatus: Map<string, number>;
      byCause: Map<string, number>;
    }
  >();
  const bump = (m: Map<string, number>, key: string) =>
    m.set(key, (m.get(key) ?? 0) + 1);
  for (const day of window) {
    for (const m of day.joint.members) {
      if (!m.isAvoid) continue;
      const cur = counts.get(m.memberId) ?? {
        name: m.name,
        direction: m.direction as EightDirection | null,
        days: 0,
        byStatus: new Map<string, number>(),
        byCause: new Map<string, number>(),
      };
      cur.days++;
      bump(cur.byStatus, m.status);
      /* 凶の名前は maxFactor に入る。符号の無い古い応答では段階の名前と
         同じ値に落ちるので、それは「名前なし」として数えない。天中殺は
         段階の名前と同じ字面だが、それ自体が理由の名前なので数える。 */
      if (m.maxFactor === "天中殺" || m.maxFactor !== m.status) {
        bump(cur.byCause, m.maxFactor);
      }
      counts.set(m.memberId, cur);
    }
  }

  const mostCommon = (m: Map<string, number>): string => {
    let best = "";
    let top = 0;
    for (const [key, n] of m) {
      if (n > top) {
        top = n;
        best = key;
      }
    }
    return best;
  };

  const reasons: BlockingReason[] = [];
  for (const [memberId, c] of counts) {
    reasons.push({
      memberId,
      name: c.name,
      direction: c.direction,
      status: mostCommon(c.byStatus),
      cause: mostCommon(c.byCause),
      days: c.days,
    });
  }
  reasons.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, "ja"));
  return { until, scanned: window.length, reasons };
}
