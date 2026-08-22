import {
  readLocalSettings,
  writeLocalSettings,
  SYNCED_FIELDS,
} from "@/lib/userSettings";
import type { Sex } from "@/utils/fengShuiEngine";

/**
 * 風水（八宅）の設定。**端末にだけ置く。**
 *
 * ## クラウドに送らない
 *
 * 八宅の本命卦は生年と**性別**で決まる。性別は増やしたら消せない種類の
 * 情報なので、`userSettings` の `SYNCED_FIELDS` に**入れない**。
 * 保存先は同じ localStorage だが、同期の対象は `SYNCED_FIELDS` だけを
 * 拾う作りになっているので、ここに書いた値はクラウドへ出ていかない
 * （`pickSynced`）。その約束は `__tests__/fengShuiSettings.test.ts` で
 * 固定してある。**あとから同期対象に足さないこと。**
 *
 * 列は消せても、集めてしまったデータは revert では消えない。
 *
 * ## 既定は「使わない」
 *
 * このサイトは長いあいだ「風水は使っていない」と案内してきた。既定で
 * 有効にすると、以前と同じ入力の人に黙って違う答えが出る。利用者が
 * 自分で入れたときだけ出す。
 */

/** 性別。未選択（null）なら本命卦を出さない。 */
export const FENG_SHUI_SEX = "feng_shui_sex";
/** 評価に入れるか。既定は false。 */
export const FENG_SHUI_ENABLED = "feng_shui_enabled";

/** この 2 つは同期しない。テストがこの表を見て検算する。 */
export const DEVICE_ONLY_KEYS = [FENG_SHUI_SEX, FENG_SHUI_ENABLED] as const;

export interface FengShuiSettings {
  sex: Sex | null;
  /** 画面に出すか。性別が無いときは出せないので、実質 `sex && enabled`。 */
  enabled: boolean;
}

function parseSex(value: unknown): Sex | null {
  return value === "male" || value === "female" ? value : null;
}

export function readFengShuiSettings(): FengShuiSettings {
  const s = readLocalSettings();
  return {
    sex: parseSex(s[FENG_SHUI_SEX]),
    enabled: s[FENG_SHUI_ENABLED] === true,
  };
}

/**
 * 変えたぶんだけ書く。丸ごと置き換えると、同じ localStorage に載っている
 * 生年月日や出発地を巻き添えで消す（`writeLocalSettings` が差分書き）。
 */
export function writeFengShuiSettings(patch: Partial<FengShuiSettings>): void {
  const next: Record<string, unknown> = {};
  if (patch.sex !== undefined) next[FENG_SHUI_SEX] = patch.sex;
  if (patch.enabled !== undefined) next[FENG_SHUI_ENABLED] = patch.enabled;
  if (Object.keys(next).length > 0) writeLocalSettings(next);
}

/**
 * 実際に八宅を出せるか。性別が無ければ出せない。
 *
 * 「切り替えは on だが性別が未入力」を画面ごとに書くと必ずどこかで
 * 抜けるので、ここ 1 か所で決める。
 */
export function fengShuiActive(settings: FengShuiSettings): settings is {
  sex: Sex;
  enabled: true;
} {
  return settings.enabled && settings.sex !== null;
}

/** 同期対象に紛れ込んでいないか。テストと、開発時の取り違え防止に使う。 */
export function isDeviceOnly(key: string): boolean {
  return !(SYNCED_FIELDS as readonly string[]).includes(key);
}
