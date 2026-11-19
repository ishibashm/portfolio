/**
 * 案内役（/annai）の AI 要約だけに掛ける追加の照合。
 *
 * verifySentences は「値が道具結果のどこかにあるか」しか見ないため、
 * 道具結果に9星分の行があると、別の星の吉方位を書いても通ってしまう
 * （六白の利用者に一白の吉方位を答えた事例）。ここでは
 *
 * 1. AI に渡す道具結果を、利用者本人の本命星の行だけに絞る
 * 2. 方位と状態（吉・本命殺・暗剣殺など）の組を本人の行と照合する
 * 3. 照合を通った文が定型文・一般論だけなら失敗として扱う
 *
 * を行う。どれかに引っかかったら呼び出し側は定型文の要約へ戻す。
 */

import {
  directionLabelName,
  isKnownDirectionStatus,
} from "@/lib/directionLabels";
import { DIRECTION_LABELS } from "@/utils/directionGeo";
import { isAuspiciousStatus } from "@/utils/noiseSeverity";
import type { GuideFacts } from "./guideRun";
import { GUIDE_ALLOWLIST_SENTENCES, extractClaims } from "./guideVerify";

const DIRECTION_NAMES = [
  "北東",
  "南東",
  "南西",
  "北西",
  "北",
  "東",
  "南",
  "西",
] as const;
const DIRECTION_NAME_SET: ReadonlySet<string> = new Set(DIRECTION_NAMES);
const PAREN_PAIR_RE = /(北東|南東|南西|北西|北|東|南|西)（([^（）]+)）/g;

// ---------------------------------------------------------------------------
// 1. 道具結果を本人の行に絞る

type StarRow = { star?: unknown; name?: unknown; today?: unknown };

function isStarsOutput(
  value: unknown,
): value is { date?: unknown; stars: StarRow[] } {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as { stars?: unknown }).stars)
  );
}

/** 本人の本命星（今日の吉方位で参照した星を優先）。 */
export function guideUserStar(
  facts: GuideFacts | undefined,
): number | undefined {
  return facts?.todayDirections?.star ?? facts?.honmeiStar;
}

/**
 * get_today_directions のような9星分の表から、本人の星の「今日」の行だけを残す。
 * 本人の星が分からないときは表ごと渡さない（他の星の値を根拠にさせない）。
 * 明日・時間帯の表も要約には使わないので落とす。
 */
export function narrowGuideOutputs(
  outputs: readonly unknown[],
  facts: GuideFacts | undefined,
): unknown[] {
  const star = guideUserStar(facts);
  const result: unknown[] = [];
  for (const out of outputs) {
    if (!isStarsOutput(out)) {
      result.push(out);
      continue;
    }
    const row =
      star !== undefined ? out.stars.find((s) => s?.star === star) : undefined;
    if (!row) continue;
    result.push({
      ...(out.date !== undefined ? { date: out.date } : {}),
      stars: [{ star: row.star, name: row.name, today: row.today }],
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 2. 方位と状態の組の照合

type DirectionRow = {
  lucky: boolean;
  unlucky: boolean;
  neutral: boolean;
  names: Set<string>;
};

export type GuideUserRows = {
  directions: Map<string, DirectionRow>;
  /** 吉日の候補がある方位。 */
  dayDirections: Set<string>;
  /** 文中で名指ししてよい本命星（数値）。 */
  stars: Set<number>;
};

function toDirectionName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (DIRECTION_NAME_SET.has(v)) return v;
  const mapped = (DIRECTION_LABELS as Record<string, string>)[v];
  return mapped && DIRECTION_NAME_SET.has(mapped) ? mapped : undefined;
}

function rowFor(map: Map<string, DirectionRow>, dir: string): DirectionRow {
  let row = map.get(dir);
  if (!row) {
    row = { lucky: false, unlucky: false, neutral: false, names: new Set() };
    map.set(dir, row);
  }
  return row;
}

function addReasonNames(row: DirectionRow, reason: string): void {
  for (const part of reason.split(/[・/、,，\s]+/)) {
    const p = part.trim();
    if (p) row.names.add(p);
  }
}

/** facts（本人の行から作られた値）から、方位ごとの状態表を作る。 */
export function buildGuideUserRows(
  facts: GuideFacts | undefined,
): GuideUserRows {
  const directions = new Map<string, DirectionRow>();
  const dayDirections = new Set<string>();
  const stars = new Set<number>();
  if (!facts) return { directions, dayDirections, stars };

  const userStar = guideUserStar(facts);
  if (userStar !== undefined) stars.add(userStar);
  if (facts.honmeiCandidates) {
    stars.add(facts.honmeiCandidates.beforeSetsubun);
    stars.add(facts.honmeiCandidates.afterSetsubun);
  }

  const td = facts.todayDirections;
  if (td) {
    for (const label of td.lucky) {
      const dir = toDirectionName(label);
      if (dir) rowFor(directions, dir).lucky = true;
    }
    for (const item of td.unlucky) {
      const m = /^(北東|南東|南西|北西|北|東|南|西)（(.+)）$/.exec(item.trim());
      const dir = toDirectionName(m ? m[1] : item);
      if (!dir) continue;
      const row = rowFor(directions, dir);
      row.unlucky = true;
      if (m) addReasonNames(row, m[2]);
    }
    for (const label of td.neutral) {
      const dir = toDirectionName(label);
      if (dir) rowFor(directions, dir).neutral = true;
    }
  } else {
    for (const d of facts.directions) {
      const dir = toDirectionName(d.label) ?? toDirectionName(d.direction);
      if (!dir) continue;
      const row = rowFor(directions, dir);
      const status = d.status;
      if (isAuspiciousStatus(status)) {
        row.lucky = true;
      } else if (status.startsWith("NOISE_")) {
        row.unlucky = true;
      } else if (status === "SAFE" || status === "平穏") {
        row.neutral = true;
      } else if (status === "吉") {
        row.lucky = true;
      }
      if (isKnownDirectionStatus(status)) {
        addReasonNames(row, directionLabelName(status));
        if (status === "NOISE_HA") row.names.add("破");
      } else {
        addReasonNames(row, status);
      }
    }
  }

  for (const day of facts.auspiciousDays) {
    const dir = toDirectionName(day.label) ?? toDirectionName(day.direction);
    if (dir) dayDirections.add(dir);
  }

  return { directions, dayDirections, stars };
}

/** 状態を表す語。長いものから一致させる。 */
const STATUS_TOKEN_RE =
  /五大凶殺|五黄殺|暗剣殺|本命的殺|本命殺|月命的殺|月命殺|土用殺|天中殺方位|天中殺|歳破|月破|日破|凶方位|大凶|三盤吉|大吉|吉方位|吉日|平穏|注意|破|凶|吉|平/;
const DIRECTION_TOKEN_RE = /北東|南東|南西|北西|北|東|南|西/;
const TOKEN_RE = new RegExp(
  `${STATUS_TOKEN_RE.source}|${DIRECTION_TOKEN_RE.source}`,
  "g",
);

/** 方位の字を含むが方位ではない語。 */
const NON_DIRECTION_WORDS_RE =
  /東京|関東|関西|東海|東北|北海道|北陸|東日本|西日本|九星|吉凶/g;
const URL_RE = /https?:\/\/\S+|\/(?:blog|guide|houi|relocation|calendar)\S*/g;
const QUOTED_RE = /「[^「」]*」/g;
/** 星の名前（五黄殺の「五黄」とは区別する）。 */
const STAR_MENTION_RE =
  /(一白|二黒|三碧|四緑|五黄(?!殺)|六白|七赤|八白|九紫)|本命星[はがの：:]?\s*([1-9])(?![0-9])/g;
const STAR_PREFIX: Record<string, number> = {
  一白: 1,
  二黒: 2,
  三碧: 3,
  四緑: 4,
  五黄: 5,
  六白: 6,
  七赤: 7,
  八白: 8,
  九紫: 9,
};

function statusMatches(
  rows: GuideUserRows,
  dir: string,
  status: string,
): boolean {
  if (status === "吉日") return rows.dayDirections.has(dir);
  const row = rows.directions.get(dir);
  if (!row) return false;
  switch (status) {
    case "吉":
    case "吉方位":
      return row.lucky;
    case "大吉":
    case "三盤吉":
      return row.lucky && row.names.has(status);
    case "凶":
    case "凶方位":
    case "大凶":
    case "五大凶殺":
      return row.unlucky;
    case "平":
    case "平穏":
      return row.neutral;
    case "破":
      return (
        row.unlucky &&
        (row.names.has("破") ||
          row.names.has("歳破") ||
          row.names.has("月破") ||
          row.names.has("日破"))
      );
    case "天中殺方位":
    case "天中殺":
      return row.names.has("天中殺方位") || row.names.has("天中殺");
    default:
      return row.names.has(status);
  }
}

export type PairCheck = {
  /** 本人の行と食い違う組（1つでもあれば失敗）。 */
  mismatches: string[];
  /** 本人の行と一致した組。 */
  pairs: string[];
  /** 状態と結びつけられなかった方位（その文は根拠不明として落とす）。 */
  unpaired: string[];
  /** 本人以外の星への言及。 */
  wrongStars: string[];
};

type Tok = { kind: "dir" | "status"; value: string };

function tokenize(clause: string): Tok[] {
  const toks: Tok[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(clause)) !== null) {
    const v = m[0];
    toks.push({ kind: DIRECTION_NAME_SET.has(v) ? "dir" : "status", value: v });
  }
  return toks;
}

/**
 * 1文に含まれる「方位と状態の組」を取り出し、本人の行と照合する。
 *
 * - 「北（暗剣殺）」のような括弧書きはそのまま組にする。
 * - それ以外は読点で区切った節ごとに、先頭が状態なら「状態→後ろの方位」
 *   （吉方位は北東・南）、先頭が方位なら「方位→後ろの状態」（北東が吉）で結ぶ。
 * - 状態の無い節の方位は、直前の節の状態を引き継ぐ（吉方位は北東、南です）。
 */
export function checkDirectionStatusPairs(
  sentence: string,
  rows: GuideUserRows,
): PairCheck {
  const result: PairCheck = {
    mismatches: [],
    pairs: [],
    unpaired: [],
    wrongStars: [],
  };
  const record = (dir: string, status: string) => {
    const label = `${dir}:${status}`;
    if (statusMatches(rows, dir, status)) result.pairs.push(label);
    else result.mismatches.push(label);
  };

  let work = sentence.replace(URL_RE, " ");

  STAR_MENTION_RE.lastIndex = 0;
  let sm: RegExpExecArray | null;
  while ((sm = STAR_MENTION_RE.exec(work)) !== null) {
    const star = sm[1] ? STAR_PREFIX[sm[1]] : Number(sm[2]);
    if (!rows.stars.has(star)) {
      result.wrongStars.push(sm[1] ?? `本命星${sm[2]}`);
    }
  }
  // 星の名前は照合済み。「五黄」などの字を方位・状態として読まないよう消す
  work = work.replace(
    /(一白|二黒|三碧|四緑|五黄(?!殺)|六白|七赤|八白|九紫)(水星|土星|木星|金星|火星)?/g,
    " ",
  );

  PAREN_PAIR_RE.lastIndex = 0;
  work = work.replace(PAREN_PAIR_RE, (_all, dir: string, inner: string) => {
    const statuses = inner
      .split(/[・/、,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    let any = false;
    for (const s of statuses) {
      const t = tokenize(s).filter((x) => x.kind === "status");
      for (const tok of t) {
        any = true;
        record(dir, tok.value);
      }
    }
    if (!any) result.unpaired.push(dir);
    return " ";
  });
  work = work.replace(QUOTED_RE, " ").replace(NON_DIRECTION_WORDS_RE, " ");

  let carried: string | undefined;
  for (const clause of work.split(/[、，,；;。\n]/)) {
    const toks = tokenize(clause);
    if (toks.length === 0) continue;
    const hasStatus = toks.some((t) => t.kind === "status");
    if (!hasStatus) {
      for (const t of toks) {
        if (carried) record(t.value, carried);
        else result.unpaired.push(t.value);
      }
      continue;
    }
    if (toks[0].kind === "status") {
      let current: string | undefined;
      for (const t of toks) {
        if (t.kind === "status") current = t.value;
        else if (current) record(t.value, current);
      }
      carried = current;
    } else {
      let pending: string[] = [];
      let last: string | undefined;
      for (const t of toks) {
        if (t.kind === "dir") {
          pending.push(t.value);
        } else {
          for (const d of pending) record(d, t.value);
          pending = [];
          last = t.value;
        }
      }
      result.unpaired.push(...pending);
      carried = last;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 3. 定型文・一般論だけの出力を失敗にする

/** 数値・名称など、日付以外の主張を1つでも含むか。 */
function hasNonDateClaim(sentence: string): boolean {
  return extractClaims(sentence).some(
    (c) =>
      !/^\d{4}-\d{2}-\d{2}$/.test(c) &&
      !/^\d{1,2}月\d{1,2}日$/.test(c) &&
      !/^(北東|南東|南西|北西|北|東|南|西)$/.test(c),
  );
}

export type GuideAiCheckResult = {
  kept: string[];
  dropped: string[];
  /** 失敗の理由（無ければ成功）。 */
  failure?: "mismatch" | "wrong_star" | "boilerplate_only";
};

/**
 * verifySentences を通った文に、組の照合と「中身があるか」の判定を掛ける。
 * - 本人の行と食い違う組・本人以外の星があれば全体を失敗にする。
 * - 方位を状態と結べない文は落とす。
 * - 残りが定型文（allowlist）や日付だけの一般論なら失敗にする。
 * - facts が無いときは組と星の照合はできないので、中身の有無だけを見る。
 *   本人の方位表があるときは、本人の行と一致した組を1つ以上含む文が必要。
 */
export function checkGuideAiSentences(
  sentences: readonly string[],
  facts: GuideFacts | undefined,
  allowlist: ReadonlySet<string> = GUIDE_ALLOWLIST_SENTENCES,
): GuideAiCheckResult {
  const rows = buildGuideUserRows(facts);
  const kept: string[] = [];
  const dropped: string[] = [];
  let substantive = 0;
  const hasUserRows = rows.directions.size > 0;

  for (const sentence of sentences) {
    if (!facts) {
      // 本人の行が渡されない呼び出し（従来の単体利用）は中身の有無だけを見る。
      kept.push(sentence);
      if (!allowlist.has(sentence) && hasNonDateClaim(sentence)) substantive++;
      continue;
    }
    const check = checkDirectionStatusPairs(sentence, rows);
    if (check.wrongStars.length > 0) {
      return { kept: [], dropped: [...sentences], failure: "wrong_star" };
    }
    if (check.mismatches.length > 0) {
      return { kept: [], dropped: [...sentences], failure: "mismatch" };
    }
    if (check.unpaired.length > 0) {
      dropped.push(sentence);
      continue;
    }
    kept.push(sentence);
    if (allowlist.has(sentence)) continue;
    if (hasUserRows ? check.pairs.length > 0 : hasNonDateClaim(sentence)) {
      substantive++;
    }
  }

  if (substantive === 0) {
    return { kept: [], dropped: [...sentences], failure: "boilerplate_only" };
  }
  return { kept, dropped };
}
