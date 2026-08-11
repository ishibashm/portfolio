/**
 * 鑑定士の掲載の、検証と表示用の整形。
 *
 * 自己申告をそのまま公開しないのが前提。ここで弾くのは形の不備だけで、
 * 内容の妥当性（本当に鑑定士か）は管理者の承認で見る。
 */

export const PRACTITIONER_LIMITS = {
  displayName: 40,
  headline: 60,
  profileMin: 50,
  profileMax: 1200,
  specialtiesMax: 5,
  specialtyLength: 20,
} as const;

/** 対応地域の選択肢。都道府県かオンライン。 */
export const PRACTITIONER_AREAS = [
  "オンライン",
  "北海道",
  "東北",
  "関東",
  "北陸・甲信越",
  "東海",
  "近畿",
  "中国",
  "四国",
  "九州・沖縄",
] as const;

export type PractitionerStatus = "pending" | "approved" | "hidden";

export interface PractitionerInput {
  displayName: unknown;
  headline: unknown;
  area: unknown;
  specialties: unknown;
  profile: unknown;
  websiteUrl: unknown;
}

export interface FieldError {
  field: string;
  message: string;
}

/**
 * 連絡先の URL。
 *
 * http/https 以外を通さない。javascript: を入れられると、掲載を踏んだ人の
 * ブラウザで任意のコードが動く。data: も同じ理由で通さない。
 */
export function normalizeWebsiteUrl(value: unknown): string | null | false {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return false;
  const raw = value.trim();
  if (raw === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (raw.length > 300) return false;
  return parsed.toString();
}

function textField(
  value: unknown,
  field: string,
  label: string,
  max: number,
  min = 1,
): FieldError | string {
  if (typeof value !== "string") {
    return { field, message: `${label}を入力してください。` };
  }
  const t = value.trim();
  if (t.length < min) {
    return {
      field,
      message:
        min > 1
          ? `${label}は${min}文字以上で入力してください。`
          : `${label}を入力してください。`,
    };
  }
  if (t.length > max) {
    return { field, message: `${label}は${max}文字までです。` };
  }
  return t;
}

export interface ValidPractitioner {
  displayName: string;
  headline: string;
  area: string;
  specialties: string[];
  profile: string;
  websiteUrl: string | null;
}

export function validatePractitioner(
  input: PractitionerInput,
): FieldError | ValidPractitioner {
  const L = PRACTITIONER_LIMITS;

  const displayName = textField(
    input.displayName,
    "displayName",
    "掲載名",
    L.displayName,
  );
  if (typeof displayName !== "string") return displayName;

  const headline = textField(input.headline, "headline", "紹介文", L.headline);
  if (typeof headline !== "string") return headline;

  const profile = textField(
    input.profile,
    "profile",
    "本文",
    L.profileMax,
    L.profileMin,
  );
  if (typeof profile !== "string") return profile;

  if (
    typeof input.area !== "string" ||
    !PRACTITIONER_AREAS.includes(input.area as (typeof PRACTITIONER_AREAS)[number])
  ) {
    return { field: "area", message: "対応地域を選んでください。" };
  }

  if (!Array.isArray(input.specialties)) {
    return { field: "specialties", message: "得意分野を選んでください。" };
  }
  const specialties = input.specialties
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter(Boolean);
  if (specialties.length === 0) {
    return { field: "specialties", message: "得意分野を1つ以上選んでください。" };
  }
  if (specialties.length > L.specialtiesMax) {
    return {
      field: "specialties",
      message: `得意分野は${L.specialtiesMax}つまでです。`,
    };
  }
  if (specialties.some((s) => s.length > L.specialtyLength)) {
    return {
      field: "specialties",
      message: `得意分野は1つあたり${L.specialtyLength}文字までです。`,
    };
  }

  const websiteUrl = normalizeWebsiteUrl(input.websiteUrl);
  if (websiteUrl === false) {
    return {
      field: "websiteUrl",
      message: "URL は http:// か https:// で始まるものを入れてください。",
    };
  }

  return { displayName, headline, area: input.area, specialties, profile, websiteUrl };
}

/** 公開する形。email と user_id は出さない。 */
export interface PublicPractitioner {
  id: string;
  displayName: string;
  headline: string;
  area: string;
  specialties: string[];
  profile: string;
  websiteUrl: string | null;
}
