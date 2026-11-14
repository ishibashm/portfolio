import { STAR_NAMES } from "@/lib/kigakuContent";
import { calculateMcpDirections, parseJstDate } from "@/lib/mcpDirections";
import { kanshiAt } from "@/lib/kanshi";
import { plainRokuyo } from "@/lib/rokuyoLabel";
import { TIER_LABELS, type DayTier } from "@/utils/dayTier";
import {
  COMPASS_DIRECTIONS,
  DIRECTION_LABELS,
  type CompassDirection,
} from "@/utils/directionGeo";
import { getHonmeiStar } from "@/utils/ephemerisEngine";
import { toJapanDateString } from "@/utils/japanDate";
import { getLuckyDays, getLunarDate, getRokuyo } from "@/utils/lunar";
import { getZonedDateTimeFields } from "@/utils/solarTime";
import { JUNISHI, tenchusatsuForCivilDate } from "@/utils/tenchusatsuCore";
import { TENCHUSATSU_WEAK_NOTE } from "@/utils/tenchusatsuPolicy";
import { ratingForStatus, type VerdictRating } from "@/lib/verdictRating";

/**
 * 日付と方位を、計算できる観点だけで並べる。
 *
 * 九星は judge_directions と同じ `calculateMcpDirections`（天中殺は
 * weaken。段階は変えず、禁止しない）。六曜・天赦日・一粒万倍日は
 * 既存の getRokuyo / getLuckyDays。干支は `kanshiAt`（年は立春、
 * 月は節入り、日は日本時間の0時。日付だけは正午）。
 *
 * 暦注の表は、サイトに無かったものだけをここに置いた。
 * - 十二直の名 … 国立国会図書館「日本の暦」中段。節月の支と日支の差。
 *   節入りの日に前日と同じ直が残るのは、月支も日支も1つ進むため
 *   この差でそのまま再現される
 * - 天恩日 … 十五干支（甲子〜戊辰、己卯〜癸未、己酉〜癸丑）。
 *   暦林問答集の配当として暦が共有している
 * - 神吉日 … 三十三干支。大明日 … 二十五干支。干支だけで決まり、
 *   年あたり約200日・約152日になる
 * - 不成就日 … 旧暦の月と日。閏月は本月と同じ表
 * - 三隣亡 … 節月を三つに分け、寅巳申亥は亥、卯午酉子は寅、辰未戌丑は午
 * - 母倉日 … 節月と日支（寅卯は亥子、巳午は寅卯、申酉は丑辰未戌、
 *   亥子は申酉、辰未戌丑は巳午）
 *
 * 四柱推命・算命学・宿・八宅・奇門遁甲・西洋占星術・タロット・易は
 * 出さない。入力は保存しない。無い値は推測で埋めない。
 */

export const FORTUNE_COMPARE_DISCLAIMER =
  "言い伝えは目安で、効果の保証はありません。足りない入力は推測で埋めず、未確認とします。";

export const FORTUNE_COMPARE_BASIS =
  "日付だけは日本時間の正午を代表点にします。干支の年は立春、月は節入り、日は日本時間の0時です。九星の方位は既存の judge_directions と同じ関数で、天中殺は段階を変えずに弱めるだけです。出生時刻が無く、その日の0時と23時59分で本命星が変わるときは九星を未確認にします。";

export type FortuneJudgment = "吉" | "凶" | "平" | "弱" | "未確認" | "情報";

export type FortuneConfidence = "high" | "medium" | "low" | "none";

export const FORTUNE_CONFIDENCE_LABEL: Record<FortuneConfidence, string> = {
  high: "高い",
  medium: "中",
  low: "低い",
  none: "未確認",
};

export type FortunePerspective = {
  id: string;
  name: string;
  value: string;
  judgment: FortuneJudgment;
  confidence: FortuneConfidence;
  explanation: string;
};

export type FortuneCandidateInput = {
  date: string;
  direction?: CompassDirection;
};

export type FortuneCompareInput = {
  birthDate?: string;
  birthTime?: string;
  lon?: number;
  candidates: FortuneCandidateInput[];
};

export type FortuneCompareResult = {
  disclaimer: string;
  basis: string;
  birth: {
    date: string | null;
    time: string | null;
    honmeiStar: string | null;
    voidNote: string;
  };
  candidates: {
    date: string;
    direction: CompassDirection | null;
    directionLabel: string | null;
    perspectives: FortunePerspective[];
  }[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const NAYIN = [
  "海中金",
  "炉中火",
  "大林木",
  "路傍土",
  "剣鋒金",
  "山頭火",
  "澗下水",
  "城頭土",
  "白蝋金",
  "楊柳木",
  "泉中水",
  "屋上土",
  "霹靂火",
  "松柏木",
  "長流水",
  "砂中金",
  "山下火",
  "平地木",
  "壁上土",
  "金箔金",
  "覆灯火",
  "天河水",
  "大駅土",
  "釵釧金",
  "桑柘木",
  "大渓水",
  "砂中土",
  "天上火",
  "石榴木",
  "大海水",
] as const;

const TENON = new Set([
  "甲子",
  "乙丑",
  "丙寅",
  "丁卯",
  "戊辰",
  "己卯",
  "庚辰",
  "辛巳",
  "壬午",
  "癸未",
  "己酉",
  "庚戌",
  "辛亥",
  "壬子",
  "癸丑",
]);

const SHINKICHI = new Set([
  "乙丑",
  "丁卯",
  "己巳",
  "庚午",
  "壬申",
  "癸酉",
  "丁丑",
  "己卯",
  "壬午",
  "甲申",
  "乙酉",
  "戊子",
  "辛卯",
  "甲午",
  "丙申",
  "丁酉",
  "己亥",
  "庚子",
  "辛丑",
  "癸卯",
  "乙巳",
  "丙午",
  "丁未",
  "戊申",
  "己酉",
  "辛亥",
  "壬子",
  "乙卯",
  "戊午",
  "己未",
  "庚申",
  "辛酉",
  "癸亥",
]);

const DAIMYO = new Set([
  "己巳",
  "庚午",
  "辛未",
  "壬申",
  "癸酉",
  "丁丑",
  "己卯",
  "壬午",
  "甲申",
  "丁亥",
  "壬辰",
  "乙未",
  "壬寅",
  "甲辰",
  "乙巳",
  "丙午",
  "丁未",
  "己酉",
  "庚戌",
  "辛亥",
  "丙辰",
  "戊午",
  "己未",
  "庚申",
  "辛酉",
]);

const FUSEIJU_DAYS: Record<number, readonly number[]> = {
  1: [3, 11, 19, 27],
  2: [2, 10, 18, 26],
  3: [1, 9, 17, 25],
  4: [4, 12, 20, 28],
  5: [5, 13, 21, 29],
  6: [6, 14, 22, 30],
  7: [3, 11, 19, 27],
  8: [2, 10, 18, 26],
  9: [1, 9, 17, 25],
  10: [4, 12, 20, 28],
  11: [5, 13, 21, 29],
  12: [6, 14, 22, 30],
};

const BOKURA: Record<string, readonly string[]> = {
  寅: ["亥", "子"],
  卯: ["亥", "子"],
  巳: ["寅", "卯"],
  午: ["寅", "卯"],
  申: ["丑", "辰", "未", "戌"],
  酉: ["丑", "辰", "未", "戌"],
  亥: ["申", "酉"],
  子: ["申", "酉"],
  辰: ["巳", "午"],
  未: ["巳", "午"],
  戌: ["巳", "午"],
  丑: ["巳", "午"],
};

const SANRINBO: Record<string, string> = {
  寅: "亥",
  巳: "亥",
  申: "亥",
  亥: "亥",
  卯: "寅",
  午: "寅",
  酉: "寅",
  子: "寅",
  辰: "午",
  未: "午",
  戌: "午",
  丑: "午",
};

const OFFICERS = [
  "建",
  "除",
  "満",
  "平",
  "定",
  "執",
  "破",
  "危",
  "成",
  "納",
  "開",
  "閉",
] as const;

const JUNICHOKU_MOVE: Record<
  (typeof OFFICERS)[number],
  { judgment: FortuneJudgment; reading: string }
> = {
  建: {
    judgment: "平",
    reading: "始めの事に向くとされる一方、土を動かすことには向かないとされる。",
  },
  除: {
    judgment: "平",
    reading: "障害を除く日とされる。婚礼や旅行には向かないともされる。",
  },
  満: { judgment: "吉", reading: "移転・旅行・祝い事に向くとされる。" },
  平: { judgment: "吉", reading: "移転や地固めに向くとされる。" },
  定: { judgment: "吉", reading: "移転や契約に向くとされる。" },
  執: {
    judgment: "平",
    reading: "造作に向くとされ、金銭の出入りには向かないともされる。",
  },
  破: { judgment: "凶", reading: "移転や祝い事には向かないとされる。" },
  危: { judgment: "凶", reading: "新しい事の開始には向かないとされる。" },
  成: { judgment: "吉", reading: "移転や新規の事に向くとされる。" },
  納: {
    judgment: "凶",
    reading: "収納には向くとされ、移転には向かないとされる。収とも書く。",
  },
  開: { judgment: "吉", reading: "移転や建築に向くとされる。" },
  閉: { judgment: "凶", reading: "新しい事の開始には向かないとされる。" },
};

const STEM_ELEMENT: Record<string, string> = {
  甲: "木",
  乙: "木",
  丙: "火",
  丁: "火",
  戊: "土",
  己: "土",
  庚: "金",
  辛: "金",
  壬: "水",
  癸: "水",
};

const BRANCH_ELEMENT: Record<string, string> = {
  子: "水",
  丑: "土",
  寅: "木",
  卯: "木",
  辰: "土",
  巳: "火",
  午: "火",
  未: "土",
  申: "金",
  酉: "金",
  戌: "土",
  亥: "水",
};

const YANG_STEM = new Set(["甲", "丙", "戊", "庚", "壬"]);
const YANG_BRANCH = new Set(["子", "寅", "辰", "午", "申", "戌"]);

const SCOPE_LABEL: Record<string, string> = {
  year: "年",
  month: "月",
  day: "日",
};

export const STAGE1_PERSPECTIVE_IDS = [
  "kyusei_year",
  "kyusei_month",
  "kyusei_day",
  "kyusei_composite",
  "tenchusatsu",
  "tendo",
  "doyou",
  "kanshi",
  "gogyo",
  "inyo",
  "natchin",
  "rokuyo",
  "ichiryumanbai",
  "tensha",
  "tenon",
  "fuseiju",
  "sanrinbo",
  "daimyo",
  "bokura",
  "tora",
  "mi",
  "kishi",
  "shinkichi",
  "junichoku",
  "personal_year",
  "personal_day",
] as const;

type Row = FortunePerspective;

function row(
  id: string,
  name: string,
  value: string,
  judgment: FortuneJudgment,
  confidence: FortuneConfidence,
  explanation: string,
): Row {
  return { id, name, value, judgment, confidence, explanation };
}

function unconfirmed(id: string, name: string, why: string): Row {
  return row(id, name, "未確認", "未確認", "none", why);
}

function reduceNumber(num: number): number {
  if (num === 11 || num === 22 || num === 33) return num;
  let sum = 0;
  let temp = num;
  while (temp > 0) {
    sum += temp % 10;
    temp = Math.floor(temp / 10);
  }
  if (sum > 9 && sum !== 11 && sum !== 22 && sum !== 33)
    return reduceNumber(sum);
  return sum;
}

function parseDay(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  const date = parseJstDate(value);
  if (!date || toJapanDateString(date) !== value) return null;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return null;
  return date;
}

export function parseFortuneDirection(
  value: string,
): CompassDirection | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if ((COMPASS_DIRECTIONS as readonly string[]).includes(trimmed))
    return trimmed as CompassDirection;
  return (
    COMPASS_DIRECTIONS.find((dir) => DIRECTION_LABELS[dir] === trimmed) ?? null
  );
}

function judgmentFromRating(rating: VerdictRating): FortuneJudgment {
  if (rating === "大吉" || rating === "吉") return "吉";
  if (rating === "平穏" || rating === "注意") return "平";
  return "凶";
}

function tierJudgment(tier: DayTier): FortuneJudgment {
  if (tier === "S" || tier === "A" || tier === "B") return "吉";
  if (tier === "C") return "平";
  return "凶";
}

function hit(
  id: string,
  name: string,
  on: boolean,
  onJudgment: FortuneJudgment,
  onText: string,
  offText: string,
): Row {
  return row(
    id,
    name,
    on ? "当たる" : "当たらない",
    on ? onJudgment : "情報",
    "high",
    on ? onText : offText,
  );
}

/*
  旧暦の月日は utils/lunar の getLunarDate（日本時間の朔で月を始める）から
  引く。ここで lunar-javascript を直に読むと中国の暦になり、朔が日本時間の
  0 時台に来る月（2026-10・2027-02・2028-01 など）は 1 日ずれる。不成就日は
  旧暦の日で決まるので、同じ月の判定が六曜と食い違っていた。
*/
function lunarMonthDay(date: Date): { month: number; day: number } {
  const { month, day } = getLunarDate(date);
  return { month: Math.abs(month), day };
}

type BirthResolution =
  | { ok: false; message: string }
  | {
      ok: true;
      date: string | null;
      time: string | null;
      honmeiStar: string | null;
      ambiguous: string | null;
      birthForJudge: string | null;
      voidNote: string;
    };

function resolveBirth(
  birthDate: string | undefined,
  birthTime: string | undefined,
): BirthResolution {
  if (!birthDate && birthTime)
    return {
      ok: false,
      message: "出生時刻だけでは計算できません。生年月日を入れてください。",
    };
  if (!birthDate) {
    return {
      ok: true,
      date: null,
      time: null,
      honmeiStar: null,
      ambiguous: null,
      birthForJudge: null,
      voidNote: "生年月日が無いので、九星と数秘は未確認です。",
    };
  }
  if (!parseDay(birthDate))
    return {
      ok: false,
      message:
        "生年月日は1900〜2100年の実在する YYYY-MM-DD で指定してください。",
    };
  if (birthTime && !TIME_RE.test(birthTime))
    return {
      ok: false,
      message: "出生時刻は HH:mm（日本時間）で指定してください。",
    };
  const start = getHonmeiStar(
    new Date(`${birthDate}T00:00:00+09:00`),
  ).classical;
  const end = getHonmeiStar(new Date(`${birthDate}T23:59:59+09:00`)).classical;
  if (!birthTime && start !== end) {
    return {
      ok: true,
      date: birthDate,
      time: null,
      honmeiStar: null,
      ambiguous: `この日は節入りで、0時は${STAR_NAMES[start]}、23時59分は${STAR_NAMES[end]}です。時刻が無いので九星は未確認です。`,
      birthForJudge: null,
      voidNote: "出生時刻が無いと本命星が一つに定まりません。",
    };
  }
  const birthForJudge = birthTime ? `${birthDate}T${birthTime}:00` : birthDate;
  const instant = birthTime
    ? parseJstDate(birthForJudge)
    : parseJstDate(birthDate);
  if (!instant)
    return { ok: false, message: "生年月日の読み取りに失敗しました。" };
  const star = getHonmeiStar(instant).classical;
  return {
    ok: true,
    date: birthDate,
    time: birthTime ?? null,
    honmeiStar: STAR_NAMES[star],
    ambiguous: null,
    birthForJudge,
    voidNote: birthTime
      ? "出生時刻は日本時間として九星の節入りだけに使います。時柱は出しません。"
      : "出生時刻は無く、この日は正午でも本命星が変わりません。九星は日付だけの既存の扱い（日本時間の正午）です。",
  };
}

function kyuseiRows(
  birth: Extract<BirthResolution, { ok: true }>,
  date: string,
  direction: CompassDirection | undefined,
  lon: number | undefined,
): Row[] {
  const ids = [
    ["kyusei_year", "九星・年盤"],
    ["kyusei_month", "九星・月盤"],
    ["kyusei_day", "九星・日盤"],
    ["kyusei_composite", "九星・三盤"],
    ["tenchusatsu", "天中殺"],
    ["tendo", "天道"],
    ["doyou", "土用殺"],
  ] as const;
  if (birth.ambiguous || !birth.birthForJudge) {
    const why =
      birth.ambiguous ??
      "生年月日が無いので、九星は未確認です。推測で本命星を置きません。";
    return ids.map(([id, name]) => unconfirmed(id, name, why));
  }
  if (typeof lon !== "number") {
    const why =
      "出発地の経度が無いので、九星の方位判定は未確認です。経度を東京などで埋めません。";
    return ids.map(([id, name]) => unconfirmed(id, name, why));
  }
  const calculated = calculateMcpDirections({
    birthDate: birth.birthForJudge,
    lon,
    date,
    tenchusatsuMode: "weaken",
  });
  if (!calculated.ok) {
    return ids.map(([id, name]) => unconfirmed(id, name, calculated.error));
  }
  const payload = calculated.payload;
  const picked = direction
    ? payload.directions.find((item) => item.direction === direction)
    : undefined;
  if (direction && !picked) {
    return ids.map(([id, name]) =>
      unconfirmed(id, name, "方位を既存の八方位に対応させられませんでした。"),
    );
  }
  const board = (id: string, name: string, status: string): Row => {
    const rating = ratingForStatus(status).rating;
    return row(
      id,
      name,
      rating,
      judgmentFromRating(rating),
      "high",
      `既存の judge_directions の${name}です。値は画面と同じ6語で、しきい値は変えていません。天中殺ではこの段階を変えません。`,
    );
  };
  const list = (layer: "yearLayer" | "monthLayer" | "dayLayer") =>
    payload.directions
      .map((item) => `${item.label}${ratingForStatus(item[layer]).rating}`)
      .join("、");
  const year = picked
    ? board("kyusei_year", "九星・年盤", picked.yearLayer)
    : row(
        "kyusei_year",
        "九星・年盤",
        list("yearLayer"),
        "未確認",
        "high",
        "方位が無いので、一つの方位には決めません。八方位の年盤を列挙しています。",
      );
  const month = picked
    ? board("kyusei_month", "九星・月盤", picked.monthLayer)
    : row(
        "kyusei_month",
        "九星・月盤",
        list("monthLayer"),
        "未確認",
        "high",
        "方位が無いので、一つの方位には決めません。八方位の月盤を列挙しています。",
      );
  const day = picked
    ? board("kyusei_day", "九星・日盤", picked.dayLayer)
    : row(
        "kyusei_day",
        "九星・日盤",
        list("dayLayer"),
        "未確認",
        "high",
        "方位が無いので、一つの方位には決めません。八方位の日盤を列挙しています。",
      );
  const composite = picked
    ? row(
        "kyusei_composite",
        "九星・三盤",
        `${picked.tier} ${TIER_LABELS[picked.tier]}`,
        tierJudgment(picked.tier),
        "high",
        "年盤・月盤・日盤を既存の段階（S〜X）に畳んだものです。天中殺はこの段階に混ぜません。",
      )
    : row(
        "kyusei_composite",
        "九星・三盤",
        payload.directions
          .map((item) => `${item.label}${item.tier}`)
          .join("、"),
        "未確認",
        "high",
        "方位が無いので、一つの方位の段階には決めません。",
      );
  const scopes = payload.tenchusatsu.scopes
    .map((scope) => SCOPE_LABEL[scope] ?? scope)
    .join("・");
  const tenchu = row(
    "tenchusatsu",
    "天中殺",
    payload.tenchusatsu.inPeriod ? `${scopes}が重なる` : "期間外",
    payload.tenchusatsu.inPeriod ? "弱" : "情報",
    "high",
    payload.tenchusatsu.inPeriod
      ? `${TENCHUSATSU_WEAK_NOTE}。この日を禁止にはしません。空亡の支は${payload.voidZodiacs.join("・")}です。`
      : `この日は年・月・日の空亡に当たりません。空亡の支は${payload.voidZodiacs.join("・")}です。禁止の扱いにはしていません。`,
  );
  const tendo = picked
    ? row(
        "tendo",
        "天道",
        picked.hasTendo ? "この方位が天道" : "この方位は天道ではない",
        picked.hasTendo ? "吉" : "情報",
        "high",
        "天道はその月に回る大吉の方位です。当たっても五黄殺などの段階は上書きしません。",
      )
    : unconfirmed(
        "tendo",
        "天道",
        "方位が無いので、天道かどうかは未確認です。",
      );
  const doyou = picked
    ? row(
        "doyou",
        "土用殺",
        picked.isDoyouSatsu ? "この方位が土用殺" : "この方位は土用殺ではない",
        picked.isDoyouSatsu ? "凶" : "情報",
        "high",
        "土用殺は既存の最終判定だけに出ます。間日は障りなしとする既存の扱いに従います。",
      )
    : unconfirmed(
        "doyou",
        "土用殺",
        "方位が無いので、土用殺かどうかは未確認です。",
      );
  return [year, month, day, composite, tenchu, tendo, doyou];
}

function calendarRows(date: Date): Row[] {
  const pillar = kanshiAt(date);
  const fields = getZonedDateTimeFields(date, 9);
  const civil = tenchusatsuForCivilDate(fields.year, fields.month, fields.day);
  const dayGanZhi = civil.ganZhi;
  const dayStem = dayGanZhi[0] ?? "";
  const dayBranch = dayGanZhi[1] ?? "";
  const monthBranch = pillar.month.slice(-1);
  const stemElement = STEM_ELEMENT[dayStem] ?? "";
  const branchElement = BRANCH_ELEMENT[dayBranch] ?? "";
  const nayin = NAYIN[Math.floor(civil.ganZhiIndex / 2)] ?? "";
  const officerIndex =
    (JUNISHI.indexOf(dayBranch) - JUNISHI.indexOf(monthBranch) + 12) % 12;
  const officer = OFFICERS[officerIndex] ?? "建";
  const move = JUNICHOKU_MOVE[officer];
  const lunar = lunarMonthDay(date);
  const fuseiju = FUSEIJU_DAYS[lunar.month]?.includes(lunar.day) ?? false;
  const sanrinbo = SANRINBO[monthBranch] === dayBranch;
  const bokura = BOKURA[monthBranch]?.includes(dayBranch) ?? false;
  const lucky = getLuckyDays(date);
  const rokuyo = plainRokuyo(getRokuyo(date));
  const rokuyoJudgment: FortuneJudgment =
    rokuyo === "大安"
      ? "吉"
      : rokuyo === "仏滅" || rokuyo === "赤口"
        ? "凶"
        : "平";
  return [
    row(
      "kanshi",
      "干支",
      `年${pillar.year}・月${pillar.month}・日${pillar.day}`,
      "情報",
      "high",
      "その日の年月日時の干支です。年は立春、月は節入り、日は日本時間の0時。出生の命式ではありません。",
    ),
    row(
      "gogyo",
      "五行",
      `日干${stemElement}・日支${branchElement}`,
      "情報",
      "high",
      "日の干支から出す五行です。相生相剋で日を禁止する計算はしていません。",
    ),
    row(
      "inyo",
      "陰陽",
      `日干${YANG_STEM.has(dayStem) ? "陽" : "陰"}・日支${YANG_BRANCH.has(dayBranch) ? "陽" : "陰"}`,
      "情報",
      "high",
      "甲丙戊庚壬と子寅辰午申戌を陽、残りを陰とします。吉凶には畳みません。",
    ),
    row(
      "natchin",
      "納音",
      nayin,
      "情報",
      "high",
      "日干支の六十納音です。音の名であって、その日の成否は保証しません。",
    ),
    row(
      "rokuyo",
      "六曜",
      rokuyo,
      rokuyoJudgment,
      "high",
      "既存の六曜です。大安を吉、仏滅と赤口を凶、ほかを平としました。目安で、方位の段階には混ぜません。",
    ),
    hit(
      "ichiryumanbai",
      "一粒万倍日",
      lucky.isIchiryumanbai,
      "吉",
      "既存の一粒万倍日に当たります。事始めに吉とされます。借りることは万倍になるともいわれます。",
      "既存の一粒万倍日には当たりません。",
    ),
    hit(
      "tensha",
      "天赦日",
      lucky.isTensho,
      "吉",
      "既存の天赦日に当たります。万事に吉とされる日です。効果の保証はありません。",
      "既存の天赦日には当たりません。",
    ),
    hit(
      "tenon",
      "天恩日",
      TENON.has(dayGanZhi),
      "吉",
      "十五干支の天恩日に当たります。慶事に吉とされ、凶事には向かないともされます。",
      "天恩日の十五干支には当たりません。",
    ),
    hit(
      "fuseiju",
      "不成就日",
      fuseiju,
      "凶",
      `旧暦${lunar.month}月${lunar.day}日で、不成就日の表に当たります。事を起こすのに向かないとされる日です。閏月は本月と同じ表です。`,
      `旧暦${lunar.month}月${lunar.day}日で、不成就日の表には当たりません。`,
    ),
    hit(
      "sanrinbo",
      "三隣亡",
      sanrinbo,
      "凶",
      `節月の支は${monthBranch}、日の支は${dayBranch}です。建築に向かないとされる日で、移転で土を動かすことにも忌む言い伝えがあります。`,
      `節月の支は${monthBranch}、日の支は${dayBranch}です。三隣亡には当たりません。`,
    ),
    hit(
      "daimyo",
      "大明日",
      DAIMYO.has(dayGanZhi),
      "吉",
      "大明日の干支に当たります。建築・移転・旅行に吉とされる日です。",
      "大明日の干支には当たりません。",
    ),
    hit(
      "bokura",
      "母倉日",
      bokura,
      "吉",
      `節月の支${monthBranch}に対する母倉の支に、日の支${dayBranch}が当たります。造作や婚姻に吉とされる日です。`,
      "母倉日には当たりません。",
    ),
    hit(
      "tora",
      "寅の日",
      dayBranch === "寅",
      "吉",
      "日の支が寅です。金運の縁日とされ、旅行の帰りにも縁起が良いとされます。",
      "日の支は寅ではありません。",
    ),
    hit(
      "mi",
      "巳の日",
      dayBranch === "巳",
      "吉",
      "日の支が巳です。弁財天の縁日として金運に吉とされます。",
      "日の支は巳ではありません。",
    ),
    hit(
      "kishi",
      "己巳の日",
      dayGanZhi === "己巳",
      "吉",
      "干支が己巳です。巳の日のうち、さらに縁起が良いとされる日です。",
      "干支は己巳ではありません。",
    ),
    hit(
      "shinkichi",
      "神吉日",
      SHINKICHI.has(dayGanZhi),
      "吉",
      "神吉日の三十三干支に当たります。神社参拝や祭礼に吉とされます。移転そのものの吉凶ではありません。",
      "神吉日の三十三干支には当たりません。",
    ),
    row(
      "junichoku",
      "十二直",
      officer,
      move.judgment,
      "medium",
      `節月の支${monthBranch}と日の支${dayBranch}から出す十二直です。${move.reading}用事が違えば読みも変わります。`,
    ),
  ];
}

function numerologyRows(birthDate: string | null, target: Date): Row[] {
  if (!birthDate) {
    const why = "生年月日が無いので、個人年と個人日は未確認です。";
    return [
      unconfirmed("personal_year", "数秘・個人年", why),
      unconfirmed("personal_day", "数秘・個人日", why),
    ];
  }
  const birth = getZonedDateTimeFields(parseJstDate(birthDate)!, 9);
  const day = getZonedDateTimeFields(target, 9);
  const personalYear = reduceNumber(
    reduceNumber(birth.month) +
      reduceNumber(birth.day) +
      reduceNumber(day.year),
  );
  const personalDay = reduceNumber(
    personalYear + reduceNumber(day.month) + reduceNumber(day.day),
  );
  const how =
    "誕生月・誕生日・対象の年を、それぞれ一桁（11・22・33は保つ）に畳んでから足します。個人日は個人年に対象の月と日を同じ手順で足します。数の吉凶では日を禁止しません。";
  return [
    row(
      "personal_year",
      "数秘・個人年",
      String(personalYear),
      "情報",
      "high",
      how,
    ),
    row(
      "personal_day",
      "数秘・個人日",
      String(personalDay),
      "情報",
      "high",
      how,
    ),
  ];
}

export function compareFortunePerspectives(
  input: FortuneCompareInput,
): { ok: false; error: string } | { ok: true; result: FortuneCompareResult } {
  if (input.candidates.length < 1 || input.candidates.length > 10)
    return { ok: false, error: "日付と方位の組は1〜10件で指定してください。" };
  if (
    input.lon !== undefined &&
    (typeof input.lon !== "number" ||
      !Number.isFinite(input.lon) ||
      input.lon < 122 ||
      input.lon > 154)
  ) {
    return {
      ok: false,
      error:
        "出発地の経度は122〜154の数値で指定してください。空欄のままなら九星は未確認です。",
    };
  }
  const birth = resolveBirth(input.birthDate, input.birthTime);
  if (!birth.ok) return { ok: false, error: birth.message };
  const candidates = [];
  for (const candidate of input.candidates) {
    const date = parseDay(candidate.date);
    if (!date)
      return {
        ok: false,
        error: `日付 ${candidate.date || "（空）"} は1900〜2100年の実在する YYYY-MM-DD で指定してください。`,
      };
    const perspectives = [
      ...kyuseiRows(birth, candidate.date, candidate.direction, input.lon),
      ...calendarRows(date),
      ...numerologyRows(birth.date, date),
    ];
    candidates.push({
      date: candidate.date,
      direction: candidate.direction ?? null,
      directionLabel: candidate.direction
        ? DIRECTION_LABELS[candidate.direction]
        : null,
      perspectives,
    });
  }
  return {
    ok: true,
    result: {
      disclaimer: FORTUNE_COMPARE_DISCLAIMER,
      basis: FORTUNE_COMPARE_BASIS,
      birth: {
        date: birth.date,
        time: birth.time,
        honmeiStar: birth.honmeiStar,
        voidNote: birth.ambiguous ?? birth.voidNote,
      },
      candidates,
    },
  };
}

export type FortuneQuery = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

export type FortuneFormFields = {
  birthDate: string;
  birthTime: string;
  lon: string;
  candidates: { date: string; direction: string }[];
};

export function readFortuneForm(sp: FortuneQuery): FortuneFormFields {
  const candidates = [];
  for (let i = 1; i <= 10; i++) {
    candidates.push({
      date: firstParam(sp[`c${i}date`]),
      direction: firstParam(sp[`c${i}dir`]),
    });
  }
  return {
    birthDate: firstParam(sp.birthDate),
    birthTime: firstParam(sp.birthTime),
    lon: firstParam(sp.lon),
    candidates,
  };
}

export function fortuneCompareQueryPresent(sp: FortuneQuery): boolean {
  return Object.values(sp).some((value) => firstParam(value) !== "");
}

/** クエリ無しは索引する。クエリ付きだけ noindex。 */
export function fortuneCompareRobots(hasQuery: boolean): {
  index: boolean;
  follow: boolean;
} {
  return hasQuery
    ? { index: false, follow: true }
    : { index: true, follow: true };
}

export function fortuneCompareFromQuery(sp: FortuneQuery):
  | { status: "blank"; fields: FortuneFormFields }
  | { status: "error"; fields: FortuneFormFields; message: string }
  | {
      status: "ok";
      fields: FortuneFormFields;
      result: FortuneCompareResult;
    } {
  const fields = readFortuneForm(sp);
  const touched =
    firstParam(sp.compare) === "1" ||
    fields.birthDate !== "" ||
    fields.birthTime !== "" ||
    fields.lon !== "" ||
    fields.candidates.some((item) => item.date !== "" || item.direction !== "");
  if (!touched) return { status: "blank", fields };
  const candidates: FortuneCandidateInput[] = [];
  for (const item of fields.candidates) {
    if (!item.date && !item.direction) continue;
    if (!item.date)
      return {
        status: "error",
        fields,
        message: "方位だけでは計算できません。日付を入れてください。",
      };
    const direction = parseFortuneDirection(item.direction);
    if (direction === null)
      return {
        status: "error",
        fields,
        message:
          "方位は北・北東・東・南東・南・南西・西・北西のいずれかで指定してください。",
      };
    candidates.push(
      direction ? { date: item.date, direction } : { date: item.date },
    );
  }
  if (candidates.length === 0)
    return {
      status: "error",
      fields,
      message: "日付を1つ以上入れてください。空欄は推測で埋めません。",
    };
  let lon: number | undefined;
  if (fields.lon !== "") {
    const parsed = Number(fields.lon);
    if (!Number.isFinite(parsed))
      return {
        status: "error",
        fields,
        message: "出発地の経度は数値で指定してください。",
      };
    lon = parsed;
  }
  const compared = compareFortunePerspectives({
    birthDate: fields.birthDate || undefined,
    birthTime: fields.birthTime || undefined,
    lon,
    candidates,
  });
  if (!compared.ok) return { status: "error", fields, message: compared.error };
  return { status: "ok", fields, result: compared.result };
}
