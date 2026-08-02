/**
 * 複数人で同じ移転先へ動くときの方位・時期の合成。
 *
 * スキャナーはこれまで「1 人（あなた）＋ 1 つの出発地」しか見ていなかった。
 * 実際の引っ越しは同居する人がいたり、別の場所に住む親族と合流したりする。
 * 出発地が違えば同じ物件でも方位が違うので、片方に吉でももう片方に凶、
 * ということが普通に起きる。1 人分の判定だけでは、その衝突が見えない。
 *
 * ここでは「誰にとっての方位か」を人ごとに持ち、全員ぶんを 1 つの判断へ
 * まとめる。まとめ方（誰か 1 人でも凶なら不可 / 平均で見る / 重み付き）は
 * 呼び出し側が選ぶ。判定そのものは既存の気学エンジンに任せ、この
 * モジュールは合成だけを担う。
 */
import { isAvoidStatus } from "@/utils/arbitrageHelpers";

/**
 * 移転に関わる 1 人。
 *
 * baseLat/baseLon は「その人の現住地」。全員が同じ場所から動くとは限らず、
 * 親族との合流ではむしろ別々の出発地から同じ目的地へ向かう。
 */
export interface PartyMember {
  id: string;
  name: string;
  birthDate: string;
  /** 出生地。天体ライン（太陽・金星・木星）の判定に使う。無ければ方位のみで見る。 */
  birthLat: number | null;
  birthLon: number | null;
  /** 現住地＝方位を測る起点。 */
  baseLat: number;
  baseLon: number;
  /** 重み付き平均で使う比重。既定 1。 */
  weight: number;
  /**
   * 既に移転先の側に住んでいて動かない人。
   *
   * 合流のうち「相手の家の近くへ移る」形では、相手は移動しないので方位が
   * 発生しない。判定から外すが、同居する相手として一覧には残す。
   */
  stationary: boolean;
}

export type PartyPolicy = "everyone" | "average" | "weighted";

export const PARTY_POLICIES: {
  id: PartyPolicy;
  label: string;
  description: string;
}[] = [
  {
    id: "everyone",
    label: "全員一致",
    description:
      "最も評価の低い人に合わせる。誰か 1 人でも避けるべき方位・期間なら、その日・その場所は選ばない。",
  },
  {
    id: "average",
    label: "平均",
    description:
      "全員の点数を等しく平均する。多少の凶を許容してでも折り合いをつけたい場合。",
  },
  {
    id: "weighted",
    label: "重み付き",
    description:
      "人ごとの比重で平均する。世帯主を重く、同行者を軽く、といった配分ができる。",
  },
];

export const DEFAULT_PARTY_POLICY: PartyPolicy = "everyone";

export function isPartyPolicy(value: string): value is PartyPolicy {
  return PARTY_POLICIES.some((p) => p.id === value);
}

/** 1 人・1 日・1 物件ぶんの判定結果。 */
export interface MemberOutcome {
  memberId: string;
  name: string;
  /** 真北基準の方位。移動しない人は null。 */
  direction: string | null;
  /** 磁北基準の方位。 */
  magneticDirection: string | null;
  /** その人の現住地から移転先までの距離 km。 */
  distanceKm: number | null;
  score: number;
  status: string;
  /** 避けるべき方位・期間か。 */
  isAvoid: boolean;
  /** 最大の吉凶要因（「五黄殺」「天道方位」など）。 */
  maxFactor: string;
}

export interface JointOutcome {
  /** まとめ方に従って出した、全員ぶんの総合点。 */
  score: number;
  policy: PartyPolicy;
  /** 移動する全員が「避けるべき」に当たらないか。 */
  everyoneSafe: boolean;
  /** 避けるべき判定になっている人の名前。なぜ不可なのかを画面に出すため。 */
  blockedBy: string[];
  /** 移動する人の中での最高点と最低点の差。大きいほど利害が割れている。 */
  spread: number;
  /**
   * 一致度（0〜100）。spread が小さいほど高い。
   *
   * 「片方に大吉・片方に大凶」を平均で 50 点にすると、全員が 50 点の
   * 場所と区別が付かなくなる。割れているかどうかは別の軸として持つ。
   * 移動する人が 1 人以下なら比較対象が無いので null。
   */
  harmony: number | null;
  /** 判定の足を引っ張っている人。交渉や再検討の起点になる。 */
  bindingMember: MemberOutcome | null;
  /** 移動しない人を含む全員ぶんの内訳。 */
  members: MemberOutcome[];
}

/**
 * 人ごとの判定を 1 つにまとめる。
 *
 * 移動しない人は方位が発生しないので合成から外す。誰も移動しない場合は
 * 判定が成立しないため score 0 / everyoneSafe false を返す。
 */
export function combineOutcomes(
  members: MemberOutcome[],
  policy: PartyPolicy,
  weights?: Record<string, number>,
): JointOutcome {
  const movers = members.filter((m) => m.direction !== null);

  if (movers.length === 0) {
    return {
      score: 0,
      policy,
      everyoneSafe: false,
      blockedBy: [],
      spread: 0,
      harmony: null,
      bindingMember: null,
      members,
    };
  }

  const scores = movers.map((m) => m.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  let score: number;
  if (policy === "everyone") {
    score = min;
  } else if (policy === "weighted") {
    let sum = 0;
    let totalWeight = 0;
    for (const m of movers) {
      const weight = Math.max(0, weights?.[m.memberId] ?? 1);
      sum += m.score * weight;
      totalWeight += weight;
    }
    // 全員の比重が 0 なら重みの情報が無いのと同じなので等分に倒す。
    score = totalWeight > 0 ? sum / totalWeight : min;
  } else {
    score = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const blocked = movers.filter((m) => m.isAvoid);
  const spread = max - min;

  // 最低点の人を「足を引っ張っている人」とする。避けるべき人がいるなら
  // 点数に関係なくそちらを優先する（点だけでは移転不可が伝わらない）。
  const bindingMember =
    blocked.length > 0
      ? blocked.reduce((worst, m) => (m.score < worst.score ? m : worst))
      : movers.reduce((worst, m) => (m.score < worst.score ? m : worst));

  return {
    score: Math.max(0, Math.min(100, score)),
    policy,
    everyoneSafe: blocked.length === 0,
    blockedBy: blocked.map((m) => m.name),
    spread,
    harmony: movers.length >= 2 ? Math.max(0, 100 - spread) : null,
    bindingMember,
    members,
  };
}

/**
 * 数値として信用できる値だけを取り出す。それ以外は null。
 *
 * `Number(null)` は 0 になる。緯度経度でこれをやると、座標を持たない人が
 * 「赤道上（0°, 0°）から動く人」として扱われ、方位も距離も全く別の値に
 * なったまま、画面には普通の判定として出てしまう。空文字・真偽値も同じく
 * 0 や 1 に化けるため、明示的に弾く。
 */
function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * クエリ文字列で渡ってきた同行者定義を、信用できる形にそろえる。
 *
 * 座標や生年月日が壊れているメンバーは黙って捨てる。方位は起点の座標が
 * 無いと決まらないため、欠けたまま通すと「全員 0 点」の意味のない結果に
 * なるより、そのメンバーだけ落として残りで判定するほうが使える。
 */
export function normalizeParty(raw: unknown): PartyMember[] {
  if (!Array.isArray(raw)) return [];
  const members: PartyMember[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const baseLat = finiteNumber(e.baseLat);
    const baseLon = finiteNumber(e.baseLon);
    const stationary = e.stationary === true;
    // 移動しない人は方位を測らないので出発地が無くてもよい。
    if (!stationary && (baseLat === null || baseLon === null)) continue;

    const birthDate = typeof e.birthDate === "string" ? e.birthDate : "";
    if (!birthDate) continue;

    const id = typeof e.id === "string" && e.id ? e.id : `member-${members.length}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const weight = finiteNumber(e.weight);

    members.push({
      id,
      name:
        typeof e.name === "string" && e.name.trim()
          ? e.name.trim().slice(0, 40)
          : `同行者${members.length + 1}`,
      birthDate,
      birthLat: finiteNumber(e.birthLat),
      birthLon: finiteNumber(e.birthLon),
      baseLat: baseLat ?? 0,
      baseLon: baseLon ?? 0,
      weight: weight !== null && weight > 0 ? Math.min(weight, 10) : 1,
      stationary,
    });
  }

  return members;
}

/** クエリ文字列（JSON）から同行者を読む。壊れていれば空扱い。 */
export function parsePartyParam(raw: string | null | undefined): PartyMember[] {
  if (!raw) return [];
  try {
    return normalizeParty(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** 同行者の重みを id 引きの表にする。 */
export function partyWeights(members: PartyMember[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const m of members) weights[m.id] = m.weight;
  return weights;
}

/** 判定用に、既存のステータス文字列から避けるべきかを求める。 */
export function outcomeIsAvoid(status: string): boolean {
  return isAvoidStatus(status);
}

export interface TimingSummary {
  /** 走査した日数。 */
  scannedDays: number;
  /** 走査範囲のうち、移動する全員が避けるべき判定に当たらなかった日数。 */
  allClearDays: number;
  /** 直近で全員が動ける日（YYYY-MM-DD）。無ければ null。 */
  nextAllClearDate: string | null;
  /** 走査範囲で最も点数が高かった日。 */
  bestDate: string | null;
  bestScore: number;
  /**
   * 走査した全ての日で塞がっていた人と、その主な理由。
   *
   * 天中殺は年単位で成立することがあり、その年に当たっている人は
   * どこへ向かっても・いつでも不可になる。これを「0 日」とだけ返すと、
   * 物件が悪いのか時期が悪いのか本人の年回りなのかが区別できない。
   * 期間を延ばせば解決するのか、そもそも年を変えるしかないのかは
   * 判断が変わるので、理由まで返す。
   */
  alwaysBlockedBy: { name: string; status: string }[];
}

/**
 * 「いつなら全員で動けるか」を日ごとの合成結果からまとめる。
 *
 * 物件の良し悪しとは別に、方位と暦は日によって開いたり閉じたりする。
 * 対象日 1 日だけを見ていると「今日は駄目」で終わってしまい、
 * 2 週間後なら全員で動ける、という情報が出てこない。
 */
export function summarizeTiming(
  daily: { date: string; joint: JointOutcome }[],
): TimingSummary {
  let allClearDays = 0;
  let nextAllClearDate: string | null = null;
  let bestDate: string | null = null;
  let bestScore = -1;

  // 人ごとに「塞がっていた日数」と、その理由の出現回数を数える。
  const blockedDays = new Map<string, number>();
  const blockedStatuses = new Map<string, Map<string, number>>();

  for (const entry of daily) {
    if (entry.joint.everyoneSafe) {
      allClearDays++;
      if (nextAllClearDate === null) nextAllClearDate = entry.date;
    }
    if (entry.joint.score > bestScore) {
      bestScore = entry.joint.score;
      bestDate = entry.date;
    }

    for (const member of entry.joint.members) {
      if (member.direction === null || !member.isAvoid) continue;
      blockedDays.set(member.name, (blockedDays.get(member.name) ?? 0) + 1);
      const statuses = blockedStatuses.get(member.name) ?? new Map();
      statuses.set(member.status, (statuses.get(member.status) ?? 0) + 1);
      blockedStatuses.set(member.name, statuses);
    }
  }

  const alwaysBlockedBy: { name: string; status: string }[] = [];
  if (daily.length > 0) {
    for (const [name, count] of blockedDays) {
      if (count < daily.length) continue;
      const statuses = blockedStatuses.get(name);
      let status = "";
      let top = 0;
      for (const [candidate, n] of statuses ?? []) {
        if (n > top) {
          top = n;
          status = candidate;
        }
      }
      alwaysBlockedBy.push({ name, status });
    }
  }

  return {
    scannedDays: daily.length,
    allClearDays,
    nextAllClearDate,
    bestDate,
    bestScore: bestScore < 0 ? 0 : bestScore,
    alwaysBlockedBy,
  };
}
