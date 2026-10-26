/**
 * 生年月日 → 天中殺グループの軽量版（client で使える。暦エンジンを引かない）。
 *
 * 正は `utils/tenchusatsu.calculateTenchusatsu`（lunar-javascript の日柱）。
 * 日柱は 60 日周期で暦日ごとに 1 つ進むだけなので、基準日からの日数で
 * 求められる。2024-01-01 は甲子（index 0）。`__tests__/tenchusatsuLite.test.ts`
 * が正の実装と多数の日付で突き合わせる。
 */
export const TENCHUSATSU_GROUP_NAMES = [
  "戌亥",
  "申酉",
  "午未",
  "辰巳",
  "寅卯",
  "子丑",
] as const;
export type TenchusatsuGroupName = (typeof TENCHUSATSU_GROUP_NAMES)[number];

const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";

/** YYYY-MM-DD → 日柱の 60 干支 index（0 = 甲子）。読めなければ null。 */
export function dayCycleIndex(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  if (
    d.getUTCFullYear() !== Number(m[1]) ||
    d.getUTCMonth() + 1 !== Number(m[2]) ||
    d.getUTCDate() !== Number(m[3])
  )
    return null;
  const days = Math.round((t - Date.UTC(2024, 0, 1)) / 86_400_000);
  return ((days % 60) + 60) % 60;
}

export function tenchusatsuForBirthDate(ymd: string): {
  ganZhi: string;
  group: TenchusatsuGroupName;
  voidBranches: [string, string];
} | null {
  const i = dayCycleIndex(ymd);
  if (i === null) return null;
  const group = TENCHUSATSU_GROUP_NAMES[Math.floor(i / 10)];
  return {
    ganZhi: `${STEMS[i % 10]}${BRANCHES[i % 12]}`,
    group,
    voidBranches: [group[0], group[1]],
  };
}

/** 西暦年の十二支（立春の前後は考慮しない。表示用の目安） */
export function yearBranch(year: number): string {
  return BRANCHES[(((year - 2008) % 12) + 12) % 12];
}

/** そのグループの、指定年以降で最初の天中殺の年（2 年続く） */
export function nextVoidYears(
  group: TenchusatsuGroupName,
  fromYear: number,
): [number, number] {
  for (let y = fromYear - 1; y < fromYear + 12; y++) {
    if (yearBranch(y) === group[0]) {
      if (y + 1 >= fromYear) return [y, y + 1];
    }
  }
  return [fromYear, fromYear + 1];
}
