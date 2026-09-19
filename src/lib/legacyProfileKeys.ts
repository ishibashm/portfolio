import type { Settings } from "@/lib/userSettings";

/**
 * 画面ごとに散っている**生年月日と座標の写し**を、正の設定
 * （`tactical_config_v1`）へ引き上げる。
 *
 * ## なぜ写しがあるか
 *
 * 物件検索は `arb_*`、資産マップとホームの時計は `wealth_*` へ、同じ
 * 生年月日と座標を**直に**書いてきた（`userSettings` を通さない）。
 * 読む側も同じ鍵を見る。正の設定ができた後も、後方互換として残っている。
 *
 * ## 何が起きていたか
 *
 * **同じ値が 7 か所にある**ので、片方だけ直す事故が繰り返された。
 *
 *   #1100・#1114・#1126 … 画面の初期値が保存に流れ、未登録の人が
 *                          「登録済み」になった（3 回）
 *   2026-09-07         … 「すべて消す」が画面ごとの写しを消し漏らし、
 *                          生年月日が端末に残った
 *   2026-09-17         … 同行者の生年月日が arb_axis_prefs_v1 に隠れて
 *                          いた（鍵の名前に birth が無く、名前で照合する
 *                          見張りをすり抜けた）
 *   2026-09-19         … 手動保存が wealth_base* へ出発地を素通しで書き、
 *                          出発地未設定の人の地図が東京駅基準になっていた
 *
 * どれも「保存したこと」ではなく**写しが増えたこと**が原因なので、
 * 置き場を 1 つに畳む（利用者の依頼。2026-09-19）。
 *
 * ## ここでやること
 *
 * **引き上げるだけ。**正の設定に既に値があれば触らない。旧い鍵も消さない
 * （読み手がまだ残っているため。消すのは読み手を寄せ切ってから）。
 * つまりこの処理は**何度走らせても同じ**で、値を失う経路が無い。
 */

/**
 * 旧い鍵 → 正の設定の欄。
 *
 * **並び順に意味がある。**`birth_date` のように 2 つの鍵が同じ欄を指す
 * ことがあるので、先に来たほうを採る。物件検索（`arb_*`）は出発地を
 * 変えるたびに書き直されるので、こちらを先に置く。
 */
export const LEGACY_PROFILE_KEYS: readonly (readonly [string, string])[] = [
  ["arb_birthDate", "birth_date"],
  ["arb_baseLat", "base_lat"],
  ["arb_baseLon", "base_lon"],
  ["wealth_birthDate", "birth_date"],
  ["wealth_birthLat", "birth_lat"],
  ["wealth_birthLon", "birth_lon"],
  ["wealth_baseLat", "base_lat"],
  ["wealth_baseLon", "base_lon"],
] as const;

/** 座標の欄。旧い鍵は文字列だが、正の設定は数値で持つ。 */
const COORD_FIELDS = new Set([
  "base_lat",
  "base_lon",
  "birth_lat",
  "birth_lon",
]);

/** localStorage のうち、この処理が使う部分だけ。 */
export interface LegacyStorage {
  getItem(key: string): string | null;
}

/**
 * その欄が**決着しているか**（引き上げなくてよいか）。
 *
 * 利用者の値が入っていれば決着。**null も決着**で、これは「クラウドで
 * 消した跡」（`userSettings` が端末に残す）。値は無いが、利用者が消したと
 * 分かっているので拾い直さない。**欄ごと無いとき（undefined）だけ**
 * 引き上げる。
 *
 * null を「無い」と同じに扱っていたころは、別の端末で消した生年月日が
 * 読み込みのたびに旧い鍵から戻ってきた。
 */
function isSettled(settings: Settings, field: string): boolean {
  const v = settings[field];
  if (v === null) return true;
  if (v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

/**
 * 旧い鍵から引き上げるぶんだけを返す。**正の設定に無い欄だけ**を埋める。
 *
 * 壊れた値（座標が数にならない、空文字）は「無かった」ことにする。
 * `userSettings` の型付き取り出しと同じ考え方で、壊れた値を state へ
 * 流さない。
 */
export function legacyProfilePatch(
  storage: LegacyStorage,
  current: Settings,
): Settings {
  const patch: Settings = {};
  for (const [key, field] of LEGACY_PROFILE_KEYS) {
    /* 既に正の設定にあるか、この走査で既に埋めた欄は触らない */
    if (isSettled(current, field) || patch[field] !== undefined) continue;
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      continue; /* プライベートモードなどで読めない。次へ */
    }
    if (!raw || !raw.trim()) continue;
    if (COORD_FIELDS.has(field)) {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      patch[field] = n;
    } else {
      patch[field] = raw;
    }
  }
  return patch;
}
