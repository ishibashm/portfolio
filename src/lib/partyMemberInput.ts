/**
 * 同行者・合流する人の**入力途中**の形と、端末への保存。
 *
 * 物件検索（/relocation/arbitrage）が同行者を持っていたが、型も保存も
 * 頁の中に閉じていた。時期ツール（/relocation/timing）にも同じ人を
 * 出したい（「合流する人を選んで 2 年ぶん」。利用者の要望 2026-09-17）
 * ので、形と保存の口をここに 1 つ置く。
 *
 * 保存先は頁ごとに別（物件検索は `arb_axis_prefs_v1`、時期ツールは
 * `timing_party_v1`）。当初は共有していたが、走査の範囲が違う
 * （90 日 / 2 年）ので分けた（利用者の依頼 2026-09-19）。
 *
 * 座標や日付は入力途中の文字列で持ち、送信時に数値へ直す
 * （`partyPayload`）。API 側の `normalizeParty` が最終の検査をする。
 */
import type { ProfilePreset } from "@/lib/profilePresetSync";
import {
  DEFAULT_PARTY_POLICY,
  isPartyPolicy,
  type PartyPolicy,
} from "@/utils/arbitrageParty";

export interface PartyMemberInput {
  id: string;
  name: string;
  birthDate: string;
  birthLat: string;
  birthLon: string;
  baseLat: string;
  baseLon: string;
  weight: number;
  stationary: boolean;
}

/** 保存済みプロフィールから 1 人を起こす。無ければ空の手入力。 */
export function partyMemberFromPreset(
  preset: ProfilePreset | undefined,
  index: number,
): PartyMemberInput {
  return {
    id: preset?.id || `member-${Date.now()}`,
    name: preset?.name || `同行者${index + 1}`,
    birthDate: preset?.birthDate || "",
    birthLat: preset?.birthLat != null ? String(preset.birthLat) : "",
    birthLon: preset?.birthLon != null ? String(preset.birthLon) : "",
    baseLat: preset?.baseLat != null ? String(preset.baseLat) : "",
    baseLon: preset?.baseLon != null ? String(preset.baseLon) : "",
    weight: 1,
    stationary: false,
  };
}

/** API に渡す 1 人ぶん。座標は数値、無ければ null。 */
export interface PartyPayloadEntry {
  id: string;
  name: string;
  birthDate: string;
  birthLat: number | null;
  birthLon: number | null;
  baseLat: number | null;
  baseLon: number | null;
  weight: number;
  stationary: boolean;
}

/**
 * 送れる人だけを API の形に直す。生年月日が無い人と、移動するのに
 * 出発地が無い人は送らない（方位が決まらないため）。
 */
export function partyPayload(members: PartyMemberInput[]): PartyPayloadEntry[] {
  return members
    .filter((m) => m.birthDate && (m.stationary || (m.baseLat && m.baseLon)))
    .map((m) => ({
      id: m.id,
      name: m.name,
      birthDate: m.birthDate,
      birthLat: m.birthLat === "" ? null : Number(m.birthLat),
      birthLon: m.birthLon === "" ? null : Number(m.birthLon),
      baseLat: m.baseLat === "" ? null : Number(m.baseLat),
      baseLon: m.baseLon === "" ? null : Number(m.baseLon),
      weight: m.weight,
      stationary: m.stationary,
    }));
}

/** クエリに載せる JSON。送れる人がいなければ空文字。 */
export function partyParam(members: PartyMemberInput[]): string {
  const payload = partyPayload(members);
  return payload.length > 0 ? JSON.stringify(payload) : "";
}

/**
 * 物件検索と共有する保存の鍵。**名前を変えない。**物件検索は同じ鍵に
 * 候補の切り出し方や天中殺の扱いも入れており、変えると巻き添えで
 * 初期化される。
 */
export const PARTY_PREFS_KEY = "arb_axis_prefs_v1";

export interface SharedParty {
  members: PartyMemberInput[];
  policy: PartyPolicy;
}

function isMemberInput(value: unknown): value is PartyMemberInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string";
}

/** 端末に保存してある同行者とまとめ方。無ければ空。 */
export function readSharedParty(storage: Storage): SharedParty {
  const empty: SharedParty = { members: [], policy: DEFAULT_PARTY_POLICY };
  try {
    const raw = storage.getItem(PARTY_PREFS_KEY);
    if (!raw) return empty;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return empty;
    const members = Array.isArray(saved.partyMembers)
      ? saved.partyMembers.filter(isMemberInput)
      : [];
    const policy =
      typeof saved.partyPolicy === "string" && isPartyPolicy(saved.partyPolicy)
        ? saved.partyPolicy
        : DEFAULT_PARTY_POLICY;
    return { members, policy };
  } catch {
    return empty;
  }
}

/**
 * **時期ツール専用**の同行者の鍵。物件検索とは共有しない。
 *
 * 当初は「同じ人を 2 つの頁で二重に登録させない」ために物件検索の鍵を
 * 読んでいたが、あちらの時期の走査は 90 日まで・こちらは本人と同じ
 * 2 年で、同じ人を載せても条件が揃わない。利用者の依頼（2026-09-19）で
 * 分けた。物件検索で足した人は**最初の 1 回だけ**写す（`readTimingParty`）。
 */
export const TIMING_PARTY_KEY = "timing_party_v1";

/**
 * 時期ツールの同行者。鍵がまだ無い端末では、物件検索の同行者を 1 回だけ
 * 写して返す（写した結果はまだ保存しない — 保存は利用者が触ったとき。
 * 読んだだけで書くと、読み込み前の空の値で上書きする経路と同じ事故に
 * なる）。
 */
export function readTimingParty(storage: Storage): SharedParty {
  const empty: SharedParty = { members: [], policy: DEFAULT_PARTY_POLICY };
  try {
    const raw = storage.getItem(TIMING_PARTY_KEY);
    if (raw === null) return readSharedParty(storage);
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return empty;
    const members = Array.isArray(saved.members)
      ? saved.members.filter(isMemberInput)
      : [];
    const policy =
      typeof saved.policy === "string" && isPartyPolicy(saved.policy)
        ? saved.policy
        : DEFAULT_PARTY_POLICY;
    return { members, policy };
  } catch {
    return empty;
  }
}

/** 時期ツールの同行者とまとめ方を保存する。物件検索の鍵には触らない。 */
export function writeTimingParty(storage: Storage, party: SharedParty): void {
  try {
    storage.setItem(
      TIMING_PARTY_KEY,
      JSON.stringify({ members: party.members, policy: party.policy }),
    );
  } catch {
    // 保存できなくても動作には影響しない。
  }
}

/**
 * 同行者とまとめ方だけを書き戻す。同じ鍵にある他の項目（物件検索の
 * 設定）は読んでそのまま残す。
 */
export function writeSharedParty(storage: Storage, party: SharedParty): void {
  try {
    let current: Record<string, unknown> = {};
    const raw = storage.getItem(PARTY_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") current = parsed;
    }
    storage.setItem(
      PARTY_PREFS_KEY,
      JSON.stringify({
        ...current,
        partyMembers: party.members,
        partyPolicy: party.policy,
      }),
    );
  } catch {
    // 保存できなくても動作には影響しない。
  }
}
