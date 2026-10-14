import { AstroEngine, getSolarMonthIndex } from "@/utils/ephemerisEngine";
import { honmeiYearFor } from "@/utils/honmeiYear";
import { calculateTenchusatsu, JIKKAN, JUNISHI } from "@/utils/tenchusatsu";
import { parseJapanDateTime, toJapanDateString } from "@/utils/japanDate";
import { getZonedDateTimeFields } from "@/utils/solarTime";

const DAY_MS = 86_400_000;
const mod = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;
const NAMES = [
  "小寒",
  "大寒",
  "立春",
  "雨水",
  "啓蟄",
  "春分",
  "清明",
  "穀雨",
  "立夏",
  "小満",
  "芒種",
  "夏至",
  "小暑",
  "大暑",
  "立秋",
  "処暑",
  "白露",
  "秋分",
  "寒露",
  "霜降",
  "立冬",
  "小雪",
  "大雪",
  "冬至",
];

export type SolarTerm = {
  name: string;
  longitude: number;
  atJst: string;
  changesMonth: boolean;
};
const termCache = new Map<number, readonly SolarTerm[]>();

/** 既存の盤と同じ太陽黄経で15度ごとの通過時刻を求める。公式暦そのものではなく計算値。 */
export function solarTermsForYear(year: number): readonly SolarTerm[] {
  if (!Number.isInteger(year) || year < 1900 || year > 2100)
    throw new RangeError("節気の対応年は1900〜2100年です。");
  const cached = termCache.get(year);
  if (cached) return cached;
  const terms = NAMES.map((name, index) => {
    const longitude = (285 + index * 15) % 360;
    const guess = Date.UTC(year, 0, 5) + index * 15.22 * DAY_MS;
    let lo = guess - 5 * DAY_MS;
    let hi = guess + 5 * DAY_MS;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const delta =
        mod(
          AstroEngine.getSolarLongitude(new Date(mid)) - longitude + 180,
          360,
        ) - 180;
      if (delta >= 0) hi = mid;
      else lo = mid;
    }
    // 秒へ切り上げ、表示時刻がまだ旧節月に属することを避ける。
    const atJst =
      new Date(Math.ceil(hi / 1000) * 1000 + 9 * 3_600_000)
        .toISOString()
        .slice(0, 19) + "+09:00";
    return Object.freeze({
      name,
      longitude,
      atJst,
      changesMonth: index % 2 === 0,
    });
  });
  if (termCache.size >= 12) termCache.delete(termCache.keys().next().value!);
  const result = Object.freeze(terms);
  termCache.set(year, result);
  return result;
}

export const KANSHI_BASIS =
  "日本標準時（JST）。年は立春、月は12の節入りの瞬間、日は0時で切り替えます。日付だけの入力は正午の代表値です。節気時刻は既存の太陽黄経による計算値で、公式暦と数分の差があり得ます。";

/** 九星の境界と揃えた節年・節月。日柱と空亡は既存の日柱計算を共有する。 */
export function kanshiAt(date: Date) {
  const yearNumber = honmeiYearFor(date);
  const yearIndex = mod(yearNumber - 4, 60);
  const monthIndex = getSolarMonthIndex(AstroEngine.getSolarLongitude(date));
  const monthStem = mod(((yearIndex % 10) % 5) * 2 + 2 + monthIndex, 10);
  const day = calculateTenchusatsu(date);
  return {
    year: JIKKAN[yearIndex % 10] + JUNISHI[yearIndex % 12],
    month: JIKKAN[monthStem] + JUNISHI[(monthIndex + 2) % 12],
    day: day.ganZhi,
    yearNumber,
    voidBranches: [...day.tenchusatsu.voidBranches],
  };
}

/** YYYY-MM-DD または ISO時刻。存在しない暦日をDateの繰り上がりで受け付けない。 */
export function parseKanshiBirth(value: string): Date | null {
  const match =
    /^(\d{4}-\d{2}-\d{2})(?:T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/.exec(
      value,
    );
  if (!match) return null;
  const day = new Date(`${match[1]}T12:00:00+09:00`);
  if (!Number.isFinite(day.getTime()) || toJapanDateString(day) !== match[1])
    return null;
  const date = match[2] ? parseJapanDateTime(value) : day;
  const year = getZonedDateTimeFields(date, 9).year;
  return Number.isFinite(date.getTime()) && year >= 1900 && year <= 2100
    ? date
    : null;
}

export function kanshiForBirth(value: string) {
  const date = parseKanshiBirth(value);
  if (!date)
    throw new RangeError(
      "birthDateは1900〜2100年の実在する日付または日時で指定してください。",
    );
  const fields = getZonedDateTimeFields(date, 9);
  const day = toJapanDateString(date);
  const pillars = kanshiAt(date);
  const solarTerms = solarTermsForYear(fields.year);
  const timeUnknown = !value.includes("T");
  const start = kanshiAt(new Date(`${day}T00:00:00+09:00`));
  const end = kanshiAt(new Date(`${day}T23:59:59+09:00`));
  const alternatives =
    timeUnknown && (start.year !== end.year || start.month !== end.month)
      ? {
          before: start,
          after: end,
          boundary: solarTerms.find(
            (term) => term.changesMonth && term.atJst.startsWith(day),
          ),
        }
      : null;
  const recurrence = (pillar: string) => {
    const years: number[] = [];
    for (let year = fields.year; year <= fields.year + 120; year++) {
      const index = mod(year - 4, 60);
      if (JIKKAN[index % 10] + JUNISHI[index % 12] === pillar) years.push(year);
    }
    return years;
  };
  const heirin = (p: typeof pillars) => ({
    year: recurrence(p.year),
    month: recurrence(p.month),
    day: recurrence(p.day),
  });
  return {
    birthDate: value,
    kanshi: pillars,
    solarTerms,
    timeUnknown,
    boundaryAlternatives: alternatives,
    kanshiHeirin: heirin(pillars),
    kanshiHeirinAlternatives: alternatives
      ? { before: heirin(start), after: heirin(end) }
      : null,
    heirinRange: { fromYear: fields.year, toYear: fields.year + 120 },
    basis: KANSHI_BASIS,
    note: "空亡は日柱から出す2支。干支併臨は各柱と年干支が一致する節年（立春から翌立春）を出生の暦年〜120年後まで列挙します。吉凶や出来事を予測するものではありません。",
  };
}
