/**
 * 利用者設定（生年月日・出発地・基準値）の読み書きを 1 か所にまとめる。
 *
 * これまでは保存先が 2 系統に割れていた。
 *   - ホームの時計 → localStorage だけ（DB へは一切送っていない）
 *   - 物件検索・シミュレータ等 → /api/user-config だけ
 * 同じ「出発地」が別の場所に入るため、片方で設定してももう片方では
 * 「設定してください」と出る。実際にその問い合わせを受けた。
 *
 * 方針は匿名優先。ログインしなくても全機能が使え、設定は端末に残る。
 * ログインしている場合だけクラウドにも同期し、別の端末から引き継げるようにする。
 * トップページにログイン画面を置く案は採らない。中核ページを匿名で
 * 見せられなくなると、検索の索引にも広告の審査にも通らなくなる。
 */

export const SETTINGS_KEY = "tactical_config_v1";

/** クラウドにも保存する項目。これ以外は端末だけに残る画面の状態。 */
export const SYNCED_FIELDS = [
  "birth_date",
  "birth_lat",
  "birth_lon",
  "base_lat",
  "base_lon",
  "baseline_hrv_mean",
  "baseline_hrv_std",
  "baseline_gsr_mean",
  "baseline_gsr_std",
  "base_sync_timestamp",
] as const;

export type SyncedField = (typeof SYNCED_FIELDS)[number];
export type Settings = Record<string, any>;

/** 端末側の最終保存時刻。クラウドとどちらが新しいかの判定に使う。 */
const SAVED_AT = "_savedAt";

export function readLocalSettings(): Settings {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 差分だけ書く。丸ごと置き換えると、その画面が扱っていない項目
 * （別画面で保存した出発地など）を巻き添えで消してしまう。
 */
export function writeLocalSettings(patch: Settings): Settings {
  if (typeof window === "undefined") return patch;
  const merged = {
    ...readLocalSettings(),
    ...patch,
    [SAVED_AT]: new Date().toISOString(),
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    // 容量超過やプライベートモード。端末に残らないだけで操作は続行できる。
  }
  return merged;
}

function pickSynced(settings: Settings): Settings {
  const out: Settings = {};
  for (const key of SYNCED_FIELDS) {
    if (settings[key] !== undefined) out[key] = settings[key];
  }
  return out;
}

export type LoadResult = {
  settings: Settings;
  /** クラウドの値を取り込んだか。未ログインなら false。 */
  synced: boolean;
};

/**
 * 端末の値を土台に、ログイン中でクラウドのほうが新しければ上書きする。
 *
 * 「無い項目だけ補完する」方式にすると、別の端末で出発地を変えても
 * 古い値が残り続けて同期にならない。時刻で新しいほうを採る。
 */
export async function loadSettings(): Promise<LoadResult> {
  const local = readLocalSettings();

  try {
    const res = await fetch("/api/user-config");
    if (!res.ok) return { settings: local, synced: false }; // 401 = 未ログイン
    const remote = await res.json();

    const localAt = local[SAVED_AT] ? Date.parse(local[SAVED_AT]) : 0;
    const remoteAt = remote.updated_at ? Date.parse(remote.updated_at) : 0;

    const remoteFields: Settings = {};
    for (const key of SYNCED_FIELDS) {
      if (remote[key] !== null && remote[key] !== undefined) {
        remoteFields[key] = remote[key];
      }
    }

    // クラウドが新しければ上書き、そうでなければ欠けている項目だけ補完する。
    const settings = remoteAt > localAt
      ? { ...local, ...remoteFields }
      : { ...remoteFields, ...local };

    return { settings, synced: true };
  } catch {
    return { settings: local, synced: false };
  }
}

export type SaveResult = {
  settings: Settings;
  /** クラウドにも保存できたか。未ログインなら false。 */
  synced: boolean;
};

/** 端末には必ず保存し、ログイン中ならクラウドにも送る。 */
export async function saveSettings(patch: Settings): Promise<SaveResult> {
  const settings = writeLocalSettings(patch);
  const payload = pickSynced(patch);

  if (Object.keys(payload).length === 0) {
    return { settings, synced: false };
  }

  try {
    const res = await fetch("/api/user-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { settings, synced: res.ok };
  } catch {
    return { settings, synced: false };
  }
}
