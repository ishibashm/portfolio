/**
 * 生まれ年（年だけ）から本命星を引く。/houi/today の「今日の天気」用。
 * 年だけでは立春前の生まれを区別できないので、前年の星もあわせて返し、
 * 画面で「1月1日〜節分（2月3日ごろ）生まれの方は前年の星」と断る。
 * 星の計算は既存の getClassicalYearStar（一般的な九星気学の年の星）に任せる。
 */
import { MAX_BIRTH_YEAR, MIN_BIRTH_YEAR } from "@/lib/birthDateInput";
import {
  getClassicalYearStar,
  type StarFrequency,
} from "@/utils/ephemerisEngine";

export function parseBirthYearParam(
  value: string | string[] | undefined,
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  // 全角数字も受け付ける
  const text = raw
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!/^\d{4}$/.test(text)) return null;
  const year = Number(text);
  // 立春前の生まれのために前年も引くので、下限は 1 年上げる
  if (year < MIN_BIRTH_YEAR + 1 || year > MAX_BIRTH_YEAR) return null;
  return year;
}

/** その年の立春以後に生まれた人の本命星と、立春前（前年扱い）の本命星 */
export function honmeiForBirthYear(year: number): {
  main: StarFrequency;
  beforeRisshun: StarFrequency;
} {
  const midYear = (y: number) => new Date(`${y}-06-15T12:00:00+09:00`);
  return {
    main: getClassicalYearStar(midYear(year)),
    beforeRisshun: getClassicalYearStar(midYear(year - 1)),
  };
}
