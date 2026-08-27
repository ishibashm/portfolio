/**
 * 生年月日（年月日）から本命星を引く。/houi の早見に使う。
 *
 * 生まれ**年**だけの表は「1月1日〜立春前は前年」という断りを利用者に
 * 読ませる必要があり、読み飛ばすと 1 年ずれた本命星を見る
 * （`FengShuiLookup` がプロフィール自動入力を採らなかった理由）。
 * 年月日まで受け取れば立春の判定はこちらで済むので、その罠が消える。
 *
 * ephemerisEngine（→ lunar-javascript）は重く、値として import すると
 * 暦計算が丸ごと /houi の client バンドルに乗る（#177〜#179 で外した。
 * #553 の `import type` の注意と同じ）。ここでは**調べるときだけ**
 * 動的 import で読み込む。型だけは `import type` で借りる。
 */
import type { StarFrequency } from "@/utils/ephemerisEngine";

export type HonmeiStars = {
  classical: StarFrequency;
  physical: StarFrequency;
};

export type HonmeiLookupResult = {
  /** その日の始まり（日本時間 0 時）時点の本命星 */
  dayStart: HonmeiStars;
  /** その日の終わり（日本時間 23:59:59）時点の本命星 */
  dayEnd: HonmeiStars;
  /** 立春当日など、その日のうちに一般的な九星気学の本命星が変わるか */
  classicalChanges: boolean;
  /** 独自モデル（木星黄経）の本命星がその日のうちに変わるか */
  physicalChanges: boolean;
};

/** 生年月日として受け付ける年の範囲。`FengShuiLookup` と同じ。 */
export const MIN_BIRTH_YEAR = 1900;
export const MAX_BIRTH_YEAR = 2050;

/**
 * `<input type="date">` の値（YYYY-MM-DD）として妥当か。
 * 2月30日のような存在しない日付は Date が Invalid Date になるので弾ける。
 */
export function isValidBirthDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < MIN_BIRTH_YEAR || year > MAX_BIRTH_YEAR) return false;
  const d = new Date(`${value}T12:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return false;
  // "2026-02-30" は ISO としては弾かれないエンジンがあるため、
  // 読み戻して同じ日付になることまで確かめる。
  const jst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return jst === value;
}

/**
 * 生年月日から本命星を引く。妥当でない入力は null。
 *
 * 九星気学の一年は立春の**瞬間**で切り替わる（時刻は年ごとに違う）。
 * 立春当日の生まれは時刻で本命星が変わるため、日の始まりと終わりの
 * 両方を計算し、違ったら**片方に決めずに両方を返す**。表示側は
 * 「生まれた時刻で分かれます」と添えて両方を出すこと。
 */
export async function lookupHonmei(
  value: string,
): Promise<HonmeiLookupResult | null> {
  if (!isValidBirthDateInput(value)) return null;
  const { getHonmeiStar } = await import("@/utils/ephemerisEngine");
  const dayStart = getHonmeiStar(new Date(`${value}T00:00:00+09:00`));
  const dayEnd = getHonmeiStar(new Date(`${value}T23:59:59+09:00`));
  return {
    dayStart,
    dayEnd,
    classicalChanges: dayStart.classical !== dayEnd.classical,
    physicalChanges: dayStart.physical !== dayEnd.physical,
  };
}
