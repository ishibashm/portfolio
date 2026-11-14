/**
 * 案内役（/annai）の文と道具出力の機械照合。
 *
 * 道具の出力と入力に含まれない数値・日付・方位・段階記号・URL・引用語を
 * 1つでも含む文は表示から除外する。主張が1つも無い文も、定型の注意書き
 * （ALLOWLIST_SENTENCES）以外は除外する。
 */

import {
  directionLabelName,
  isKnownDirectionStatus,
} from "@/lib/directionLabels";

/** 主張を含まない文として許可する定型の注意書き一覧。 */
export const GUIDE_ALLOWLIST_SENTENCES: ReadonlySet<string> = new Set([
  "吉凶は九星気学の考え方による参考情報です。",
  "九星気学は参考情報です。",
  "条件に合う候補は見つかりませんでした。",
  "取得した範囲では吉日の候補はありませんでした。",
  "この条件では吉方位がありません。",
  "該当する記事は見つかりませんでした。",
  "出発地の候補が複数あるため、下の候補から選んでください。",
  "出発地が見つかりませんでした。別の市区町村名でお試しください。",
  "立春前後の指定がないため、今日の吉方位は立春後の候補で表示しています。",
  "道具の呼び出しに失敗したため、結果を表示できませんでした。",
]);

const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const DIRECTION_PARENTHESIZED_RE =
  /^(北東|南東|南西|北西|北|東|南|西)（(.+)）$/;

function addDateForms(set: Set<string>, text: string): void {
  ISO_DATE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ISO_DATE_RE.exec(text)) !== null) {
    const [full, yearStr, monthStr, dayStr] = match;
    const month = Number(monthStr);
    const day = Number(dayStr);
    set.add(full);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      set.add(`${month}月${day}日`);
      set.add(`${Number(yearStr)}年${month}月${day}日`);
    }
  }
}

function collectRecursive(value: unknown, set: Set<string>): void {
  if (value === null || value === undefined) return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      set.add(String(value));
    }
    return;
  }
  if (typeof value === "string") {
    set.add(value);
    const trimmed = value.trim();
    if (trimmed) {
      set.add(trimmed);
      addDateForms(set, trimmed);
      // 状態コード（NOISE_ANKEN など）は、画面と同じ呼び名（暗剣殺）も
      // 同じ値として扱う。呼び名は directionLabels の固定表から引くだけで、
      // 道具の結果に無い状態を足すことはない。
      if (isKnownDirectionStatus(trimmed)) {
        const name = directionLabelName(trimmed);
        set.add(name);
        for (const part of name.split("/")) set.add(part);
      }
      const paren = DIRECTION_PARENTHESIZED_RE.exec(trimmed);
      if (paren) {
        set.add(paren[1]);
        set.add(paren[2]);
      }
      if (trimmed.startsWith("https://cloud-palette.com/")) {
        set.add(trimmed.slice("https://cloud-palette.com".length));
      } else if (
        trimmed.startsWith("/blog/") ||
        trimmed.startsWith("/guide/") ||
        trimmed.startsWith("/houi/") ||
        trimmed === "/llms.txt"
      ) {
        set.add(`https://cloud-palette.com${trimmed}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRecursive(item, set);
    }
    return;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectRecursive(entry, set);
    }
  }
}

/**
 * 道具の出力と入力を再帰的にたどり、文字列と数値の葉をすべて集めた Set を返す。
 * 数値は文字列化し、YYYY-MM-DD の日付は「M月D日」の形も併せて登録する。
 */
export function collectEvidence(
  outputs: unknown[],
  inputs?: unknown,
): Set<string> {
  const evidence = new Set<string>();
  collectRecursive(outputs, evidence);
  if (inputs !== undefined) {
    collectRecursive(inputs, evidence);
  }
  return evidence;
}

const URL_CLAIM_RE =
  /https?:\/\/[^\s「」『』（）()、。]+|(?<![0-9A-Za-z_:])\/(?:blog|guide|houi|relocation|calendar|llms\.txt)[^\s「」『』（）()、。]*/g;
const QUOTED_CLAIM_RE = /「([^「」]+)」/g;
const ISO_DATE_CLAIM_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const JP_DATE_CLAIM_RE = /\d{1,2}月\d{1,2}日/g;
const STATUS_CODE_CLAIM_RE =
  /\b(?:OPTIMAL_REGULAR|OPTIMAL_BOOST|OPTIMAL|SAFE|WARNING|NOISE_DOYOU|NOISE_GOU|NOISE_ANKEN|NOISE_HA|NOISE_HONMEI|NOISE_TEKI|NOISE_GETSUMEI|NOISE_GETSUTEKI|NOISE_VOID|NOISE_TENCHU)\b/g;
const TIER_CLAIM_RE = /(?<![A-Za-z0-9_])[SABCDX](?![A-Za-z0-9_])/g;
const STATUS_LABEL_CLAIM_RE =
  /三盤吉|五大凶殺|五黄殺|暗剣殺|本命的殺|本命殺|月命的殺|月命殺|土用殺|天中殺方位|歳破|月破|日破/g;
const DIRECTION_CLAIM_RE = /北東|南東|南西|北西|北|東|南|西/g;
const NUMBER_CLAIM_RE = /\d+(?:\.\d+)?/g;

/**
 * 1つの文から、裏づけが必要な主張（数値・日付・八方位・段階/状態記号・URL・「」内の語）を抽出する。
 */
export function extractClaims(sentence: string): string[] {
  const claims: string[] = [];
  let work = sentence;

  const take = (re: RegExp, group = 0) => {
    re.lastIndex = 0;
    work = work.replace(re, (...args) => {
      const matched =
        group === 0 ? (args[0] as string) : (args[group] as string);
      if (matched) claims.push(matched);
      return " ";
    });
  };

  // 1. URL を先に抜き出し、URL内の数字や文字が別トークンに割れないようにする
  take(URL_CLAIM_RE, 0);
  // 2. 「」で囲まれた語（記事タイトル・市区町村名など）
  take(QUOTED_CLAIM_RE, 1);
  // 3. 日付（YYYY-MM-DD, M月D日）
  take(ISO_DATE_CLAIM_RE, 0);
  take(JP_DATE_CLAIM_RE, 0);
  // 4. 段階記号・状態コード・状態ラベル
  take(STATUS_CODE_CLAIM_RE, 0);
  take(TIER_CLAIM_RE, 0);
  take(STATUS_LABEL_CLAIM_RE, 0);
  // 5. 八方位（北東・南東・南西・北西を先に一致させる）
  take(DIRECTION_CLAIM_RE, 0);
  // 6. 数値
  take(NUMBER_CLAIM_RE, 0);

  return claims;
}

export type VerifySentencesResult = {
  kept: string[];
  dropped: string[];
  matchedValues: string[];
};

/**
 * 文の配列を evidence と照合する。
 * 各文の主張がすべて evidence に含まれていれば kept に入れ、1つでも欠ければ dropped に入れる。
 * 主張が0個の文は allowlist に含まれる定型文のみ kept とし、それ以外は dropped とする。
 */
export function verifySentences(
  sentences: readonly string[],
  evidence: ReadonlySet<string>,
  allowlist: ReadonlySet<string> = GUIDE_ALLOWLIST_SENTENCES,
): VerifySentencesResult {
  const kept: string[] = [];
  const dropped: string[] = [];
  const matchedSet = new Set<string>();

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const claims = extractClaims(sentence);
    if (claims.length === 0) {
      if (allowlist.has(sentence)) {
        kept.push(sentence);
      } else {
        dropped.push(sentence);
      }
      continue;
    }
    if (claims.every((claim) => evidence.has(claim))) {
      kept.push(sentence);
      for (const claim of claims) {
        matchedSet.add(claim);
      }
    } else {
      dropped.push(sentence);
    }
  }

  return {
    kept,
    dropped,
    matchedValues: [...matchedSet],
  };
}
