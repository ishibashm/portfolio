/**
 * 「使用中のプロフィール」を 1 か所で決める。
 *
 * ## なぜ要るか（利用者の指摘、2026-09-12）
 *
 * これまで「登録内容（設定 = user_configs）」と「保存済みプロフィール
 * （名前つきの控え）」が別の概念だった。/profile で登録しても一覧には
 * 出ず、名前も付けられず、物件検索や時期の分析が**どのプロフィールで
 * 判定しているのか**画面のどこにも出ていなかった。
 *
 * 決め事はこう。
 *
 *   - プロフィール = 名前 + 生年月日 + 出生地（任意）+ 出発地
 *   - 複数持てる。**1 件だけが使用中。**
 *   - 使用中の 1 件の値が、設定（user_configs）そのもの。全ての道具は
 *     設定を読むので、使用中のプロフィールで判定していることになる
 *
 * 書く側はここの 2 つだけを使う。
 *
 *   applyProfile        … 一覧の 1 件を使用中にして、設定に書く
 *   upsertActiveProfile … 入力した値を名前つきで一覧に入れ、使用中にする
 *
 * 同じことを 4 画面（ホームの入力欄・設定バー・時計の個人設定・移住先
 * 比較）がそれぞれ書いていた。1 つにする（CLAUDE.md「同じことを
 * 2 か所に書かない」）。
 */

import {
  loadProfilePresets,
  saveProfilePresets,
  type ProfilePreset,
} from "./profilePresetSync";
import {
  saveSettings,
  settingNumber,
  settingString,
  type SaveResult,
  type Settings,
} from "./userSettings";
import { formatCoords } from "./profileCompletion";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/** 初回に付ける名前。家族ぶんを足すときに区別が付く程度でよい。 */
export const DEFAULT_PROFILE_NAME = "自分";

/** 画面で入れる値。控えの他の項目（基準値・鍵など）はここに無い。 */
export interface ProfileValues {
  birthDate: string;
  /** 出生地は任意。両方あるか、両方無いか。 */
  birthLat?: number;
  birthLon?: number;
  baseLat: number;
  baseLon: number;
}

/** 座標の一致。保存の往復で末尾の桁が動くことがあるので幅を持つ。 */
function near(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return Math.abs(a - b) < 1e-6;
}

/**
 * 控えの値が設定と同じか。旗を立てる前に作った控えを使用中と見なす
 * ための照合。生年月日は文字列のまま比べる（時刻まで持つことがある）。
 */
export function sameValues(preset: ProfilePreset, settings: Settings): boolean {
  return (
    preset.birthDate === (settingString(settings, "birth_date") ?? "") &&
    near(preset.baseLat, settingNumber(settings, "base_lat")) &&
    near(preset.baseLon, settingNumber(settings, "base_lon")) &&
    near(preset.birthLat, settingNumber(settings, "birth_lat")) &&
    near(preset.birthLon, settingNumber(settings, "birth_lon"))
  );
}

/**
 * 使用中の 1 件。旗が立っているものを優先し、無ければ設定と同じ値の
 * 控え、それも無ければ null（一覧に無いまま設定だけがある状態。
 * /profile で保存すれば一覧に入る）。
 */
export function findActiveProfile(
  presets: readonly ProfilePreset[],
  settings: Settings,
): ProfilePreset | null {
  const flagged = presets.find((p) => p.active === true);
  if (flagged) return flagged;
  return presets.find((p) => sameValues(p, settings)) ?? null;
}

/** 一覧の中で id の 1 件だけを使用中にした一覧を返す（純粋関数）。 */
export function markActive(
  presets: readonly ProfilePreset[],
  id: string,
): ProfilePreset[] {
  return presets.map((p) => {
    if (p.id === id) return { ...p, active: true };
    if (p.active === undefined) return p;
    const { active: _drop, ...rest } = p;
    void _drop;
    return rest;
  });
}

/**
 * 控えの値を設定の patch にする。
 *
 * **出生地が無い控えを当てるときは、設定の出生地も消す。**残すと、前の
 * プロフィールの出生地で天体ラインの加点が付き続ける（別人の判定に
 * 別人の出生地が混ざる）。null を送ると API は列を NULL にする。
 */
export function settingsPatchFor(values: ProfileValues): Settings {
  const hasBirthPlace =
    values.birthLat !== undefined && values.birthLon !== undefined;
  return {
    birth_date: values.birthDate,
    base_lat: values.baseLat,
    base_lon: values.baseLon,
    birth_lat: hasBirthPlace ? values.birthLat : null,
    birth_lon: hasBirthPlace ? values.birthLon : null,
  };
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `preset_${Date.now()}`;
}

/** 同じ頁の他の部品（設定バー・ダッシュボード）に読み直させる。 */
function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("metaphysical-config-updated"));
  }
}

export interface ApplyResult {
  /** 設定への保存の結果（クラウドに届いたかと、届かなかった理由）。 */
  save: SaveResult;
  presets: ProfilePreset[];
  cloudSynced: boolean;
}

/** 一覧の 1 件を使用中にして、その値を設定に書く。 */
export async function applyProfile(
  preset: ProfilePreset,
  fetcher: Fetcher,
  storage: Storage,
): Promise<ApplyResult> {
  const save = await saveSettings(settingsPatchFor(preset));
  const { presets: latest } = await loadProfilePresets(fetcher, storage);
  const known = latest.some((p) => p.id === preset.id)
    ? latest
    : [...latest, preset];
  const result = await saveProfilePresets(
    markActive(known, preset.id),
    fetcher,
    storage,
  );
  notifyChanged();
  return { save, presets: result.presets, cloudSynced: result.cloudSynced };
}

export interface UpsertInput {
  /** 既存の控えを上書きするときの id。無ければ新規。 */
  id?: string;
  name: string;
  values: ProfileValues;
}

export interface UpsertResult {
  profile: ProfilePreset;
  presets: ProfilePreset[];
  cloudSynced: boolean;
}

/**
 * 入力した値を名前つきで一覧に入れ、使用中にする。**設定には書かない**
 * （/profile は自分で設定を書く。二重に POST しない）。
 *
 * 既存を上書きするときは、画面に出ていない項目（基準値・鍵・評価の
 * 選択）を残す。出生地を空にして保存したなら控えの出生地も落とす。
 */
export async function upsertActiveProfile(
  input: UpsertInput,
  fetcher: Fetcher,
  storage: Storage,
): Promise<UpsertResult> {
  const { presets: latest } = await loadProfilePresets(fetcher, storage);
  const existing = input.id ? latest.find((p) => p.id === input.id) : undefined;
  const name = input.name.trim() || DEFAULT_PROFILE_NAME;
  const hasBirthPlace =
    input.values.birthLat !== undefined && input.values.birthLon !== undefined;

  const merged: ProfilePreset = {
    ...(existing ?? {
      id: input.id ?? newId(),
      createdAt: new Date().toISOString(),
    }),
    name,
    birthDate: input.values.birthDate,
    baseLat: input.values.baseLat,
    baseLon: input.values.baseLon,
    ...(hasBirthPlace
      ? { birthLat: input.values.birthLat, birthLon: input.values.birthLon }
      : {}),
    active: true,
  };
  if (!hasBirthPlace) {
    delete merged.birthLat;
    delete merged.birthLon;
  }

  const others = latest.filter((p) => p.id !== merged.id);
  const result = await saveProfilePresets(
    markActive([...others, merged], merged.id),
    fetcher,
    storage,
  );
  notifyChanged();
  return {
    profile: merged,
    presets: result.presets,
    cloudSynced: result.cloudSynced,
  };
}

/**
 * 表示用の 1 行。各道具の「使用中のプロフィール」の札と /account の
 * 一覧が同じ書き方になるよう、ここだけで組む。
 */
export function describeProfile(p: {
  name: string;
  birthDate: string;
  baseLat?: number | null;
  baseLon?: number | null;
}): string {
  const birth = p.birthDate ? p.birthDate.slice(0, 10) : "生年月日 未設定";
  return `${p.name}（${birth} 生・出発地 ${formatCoords(p.baseLat, p.baseLon)}）`;
}
