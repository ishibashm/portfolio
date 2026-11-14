import { z } from "zod";
import { chainDateSchema } from "@/lib/mcpChain";
import { currentYearInJapan } from "@/lib/kigakuContent";

/** 質問の種類。 */
export const GUIDE_KINDS = ["honmei", "move", "today", "read"] as const;
export type GuideKind = (typeof GUIDE_KINDS)[number];

export const GUIDE_KIND_INFO: Record<
  GuideKind,
  { title: string; description: string }
> = {
  honmei: {
    title: "本命星を知る",
    description: "生まれ年から九星気学の本命星と関連記事を調べます。",
  },
  move: {
    title: "引越しの方位と日取り",
    description:
      "生年月日と出発地の市区町村から、方位の段階・吉日・近くの街を調べます。",
  },
  today: {
    title: "今日の吉方位",
    description: "生まれ年から本命星を求め、今日の日盤の吉凶方位を調べます。",
  },
  read: {
    title: "記事で調べる",
    description: "本命星・吉方位・天中殺・六曜などの話題から記事を探します。",
  },
};

/** 立春前後の区分。 */
export const GUIDE_SETSUBUN_VALUES = ["after", "before", "unknown"] as const;
export type GuideSetsubun = (typeof GUIDE_SETSUBUN_VALUES)[number];

export const GUIDE_SETSUBUN_LABELS: Record<GuideSetsubun, string> = {
  after: "2月4日以降生まれ",
  before: "1月1日〜2月3日生まれ",
  unknown: "わからない（両候補を見る）",
};

/** 記事で調べる話題の表（表示名と検索語）。 */
export const GUIDE_TOPICS = {
  honmei: { label: "本命星", query: "本命星" },
  kippou: { label: "吉方位", query: "吉方位" },
  tenchusatsu: { label: "天中殺", query: "天中殺" },
  hidori: { label: "引越しの日取り", query: "引越しの日取り" },
  rokuyo: { label: "六曜", query: "六曜" },
  hinoeuma: { label: "丙午", query: "丙午" },
  toukei: { label: "統計的な裏づけ", query: "統計的な裏づけ" },
} as const;

export const GUIDE_TOPIC_KEYS = [
  "honmei",
  "kippou",
  "tenchusatsu",
  "hidori",
  "rokuyo",
  "hinoeuma",
  "toukei",
] as const;
export type GuideTopicKey = (typeof GUIDE_TOPIC_KEYS)[number];

export const guideKindSchema = z.enum(GUIDE_KINDS);
export const guideSetsubunSchema = z.enum(GUIDE_SETSUBUN_VALUES);
export const guideTopicSchema = z.enum(GUIDE_TOPIC_KEYS);
export const guideCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/);
export const guideMunicipalitySchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .refine((value) => !/[\u0000-\u001f\u007f<>"']/.test(value), {
    message: "使用できない文字が含まれています。",
  });
export const guidePeriodSchema = z
  .enum(["30", "90"])
  .transform((v): 30 | 90 => (v === "90" ? 90 : 30));

export function createBirthYearSchema(now = new Date()) {
  const maxYear = currentYearInJapan(now);
  return z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1900).max(maxYear));
}

export type GuideQueryStep1 = {
  step: 1;
  kind?: undefined;
};

export type GuideQueryStep2 =
  | {
      step: 2;
      kind: "honmei" | "today";
      y?: number;
      s?: GuideSetsubun;
    }
  | {
      step: 2;
      kind: "move";
      b?: string;
      m?: string;
      c?: string;
      p: 30 | 90;
    }
  | {
      step: 2;
      kind: "read";
      t?: GuideTopicKey;
    };

export type GuideQueryStep3 =
  | {
      step: 3;
      kind: "honmei" | "today";
      y: number;
      s: GuideSetsubun;
    }
  | {
      step: 3;
      kind: "move";
      b: string;
      m: string;
      c?: string;
      p: 30 | 90;
    }
  | {
      step: 3;
      kind: "read";
      t: GuideTopicKey;
    };

export type GuideQuery = GuideQueryStep1 | GuideQueryStep2 | GuideQueryStep3;

export type RawSearchParams =
  | URLSearchParams
  | Record<string, string | string[] | number | undefined>
  | undefined;

function readParam(sp: RawSearchParams, key: string): string | undefined {
  if (!sp) return undefined;
  if (sp instanceof URLSearchParams) {
    const val = sp.get(key);
    return val === null ? undefined : val;
  }
  const raw = sp[key];
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (Array.isArray(raw)) {
    return typeof raw[0] === "string" ? raw[0] : undefined;
  }
  return undefined;
}

/**
 * URL の searchParams を zod で厳格に検証し、案内役の段（1〜3）を決める。
 * 未知や不正な値は無視して前の段に戻す。
 */
export function parseGuideQuery(
  sp: RawSearchParams,
  now = new Date(),
): GuideQuery {
  const rawKind = readParam(sp, "kind");
  const parsedKind = guideKindSchema.safeParse(rawKind);
  if (!parsedKind.success) {
    return { step: 1 };
  }
  const kind = parsedKind.data;

  if (kind === "honmei" || kind === "today") {
    const rawY = readParam(sp, "y");
    const rawS = readParam(sp, "s");
    const yearResult = createBirthYearSchema(now).safeParse(rawY);
    const setsubunResult =
      rawS === undefined || rawS === ""
        ? { success: true as const, data: "after" as GuideSetsubun }
        : guideSetsubunSchema.safeParse(rawS);

    const y = yearResult.success ? yearResult.data : undefined;
    const s = setsubunResult.success ? setsubunResult.data : undefined;

    if (y !== undefined && s !== undefined) {
      return { step: 3, kind, y, s };
    }
    return {
      step: 2,
      kind,
      ...(y !== undefined ? { y } : {}),
      ...(s !== undefined ? { s } : {}),
    };
  }

  if (kind === "move") {
    const rawB = readParam(sp, "b");
    const rawM = readParam(sp, "m");
    const rawC = readParam(sp, "c");
    const rawP = readParam(sp, "p");

    const birthResult = chainDateSchema.safeParse(rawB?.trim());
    const muniResult = guideMunicipalitySchema.safeParse(rawM);
    const codeResult =
      rawC === undefined || rawC === ""
        ? { success: true as const, data: undefined }
        : guideCodeSchema.safeParse(rawC);
    const periodResult =
      rawP === undefined || rawP === ""
        ? { success: true as const, data: 30 as const }
        : guidePeriodSchema.safeParse(rawP.trim());

    const b = birthResult.success ? birthResult.data : undefined;
    const m = muniResult.success ? muniResult.data : undefined;
    const c = codeResult.success ? codeResult.data : undefined;
    const p: 30 | 90 = periodResult.success ? periodResult.data : 30;

    // p や c に明示的な不正値が入っていた場合は前の段（step 2）へ戻す
    if (
      b !== undefined &&
      m !== undefined &&
      codeResult.success &&
      periodResult.success
    ) {
      return {
        step: 3,
        kind: "move",
        b,
        m,
        ...(c ? { c } : {}),
        p,
      };
    }
    return {
      step: 2,
      kind: "move",
      ...(b ? { b } : {}),
      ...(m ? { m } : {}),
      ...(c ? { c } : {}),
      p,
    };
  }

  // kind === "read"
  const rawT = readParam(sp, "t");
  const topicResult = guideTopicSchema.safeParse(rawT);
  if (topicResult.success) {
    return { step: 3, kind: "read", t: topicResult.data };
  }
  return { step: 2, kind: "read" };
}
