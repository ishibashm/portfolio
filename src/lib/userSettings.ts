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

import { legacyProfilePatch } from "@/lib/legacyProfileKeys";

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

/**
 * 設定の 1 項目に入る値。localStorage の JSON に入るスカラーだけを許す。
 * オブジェクトや配列を入れたくなったら、それは別のキーに分けるべき状態。
 */
export type SettingValue = string | number | boolean | null | undefined;
export type Settings = Record<string, SettingValue>;

/** 端末側の最終保存時刻。クラウドとどちらが新しいかの判定に使う。 */
const SAVED_AT = "_savedAt";

/**
 * 型が合う値だけ返す取り出し。壊れた保存値（数値のはずが文字列、null など）は
 * 「無かった」ことにする。以前は any 経由でそのまま画面の state に入っており、
 * 数値の state に文字列が入り得た。
 */
export function settingString(s: Settings, key: string): string | undefined {
  const v = s[key];
  return typeof v === "string" ? v : undefined;
}

export function settingNumber(s: Settings, key: string): number | undefined {
  const v = s[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function settingBoolean(s: Settings, key: string): boolean | undefined {
  const v = s[key];
  return typeof v === "boolean" ? v : undefined;
}

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
export function writeLocalSettings(
  patch: Settings,
  /**
   * `_savedAt`（クラウドと比べるための時刻）を進めるか。
   *
   * **利用者が保存したときだけ true。**端末に元からあった値を拾い直す
   * だけのとき（旧い鍵からの引き上げ）や、クラウドの状態を端末に写す
   * だけのときは false にする。進めると「クラウドより新しい保存」と
   * 見なされ、**別の端末で消した項目を追い越して復活させる**
   * （2026-09-19 に再現。引き上げの側の穴）。
   */
  touchSavedAt = true,
): Settings {
  if (typeof window === "undefined") return patch;
  /*
    _savedAt は「クラウドと比べるための時刻」なので、**同期する項目を
    書いたときだけ**進める。目的地（destinationSetting）や八宅の性別
    （fengShuiSettings）は端末だけの項目で、クラウドには送らない。それで
    _savedAt を進めると、別の端末で新しく保存した出発地がクラウドに
    あっても「端末のほうが新しい」と見なして永久に取り込まなかった。
  */
  const touchesSynced =
    touchSavedAt && Object.keys(pickSynced(patch)).length > 0;
  const merged = {
    ...readLocalSettings(),
    ...patch,
    ...(touchesSynced ? { [SAVED_AT]: new Date().toISOString() } : {}),
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    // 容量超過やプライベートモード。端末に残らないだけで操作は続行できる。
  }
  return merged;
}

/**
 * 旧い画面ごとの写しを、正の設定へ 1 回だけ引き上げる。
 *
 * **引き上げるだけで、旧い鍵は消さない。**まだ読んでいる画面があるため
 * （消すのは読み手を寄せ切ってから）。正の設定に既にある欄は触らないので、
 * 何度走らせても同じ。
 */
export function migrateLegacyProfileKeys(): Settings {
  if (typeof window === "undefined") return {};
  const current = readLocalSettings();
  let patch: Settings;
  try {
    patch = legacyProfilePatch(localStorage, current);
  } catch {
    return current; /* 読めない端末では何もしない */
  }
  if (Object.keys(patch).length === 0) return current;
  /*
    **引き上げは「新しい保存」ではない。**`_savedAt` を進めると、別の
    端末で消した生年月日を追い越して復活させる（1 回目の読み込みで
    そうなっていた。2026-09-19 に再現）。旧い鍵の写しがいつ書かれたかは
    分からないので、いちばん古いものとして扱う — クラウドに言い分が
    あれば必ずそちらが勝つ。
  */
  return writeLocalSettings(patch, false);
}

/**
 * 端末の設定を**同期的に**読む。最初の描画で使う入口。
 *
 * `readLocalSettings` との違いは、旧い画面の写し（`arb_*` / `wealth_*`）を
 * 正の設定へ引き上げてから返すこと。**画面が旧い鍵の名前を知らずに済む。**
 * 直に読んでいる画面は、別の端末で消した値を自分だけ拾い直してしまう。
 *
 * クラウドの値は `loadSettings`（非同期）が後から重ねる。
 */
export function readSettingsSync(): Settings {
  return migrateLegacyProfileKeys();
}

function pickSynced(settings: Settings): Settings {
  const out: Settings = {};
  for (const key of SYNCED_FIELDS) {
    if (settings[key] !== undefined) out[key] = settings[key];
  }
  return out;
}

/**
 * 「消した跡」（null）を落として返す。
 *
 * クラウドで消された項目は**端末には null で残す** — 鍵ごと消すと旧い鍵
 * からの引き上げが「まだ埋めていない欄」と見なして拾い直すため。ただし
 * 読み手にとっては「無い」と同じなので、返り値では欄ごと落として揃える。
 */
function withoutTombstones(settings: Settings): Settings {
  const out: Settings = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value !== null) out[key] = value;
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
  /*
    **旧い写しを先に引き上げる**（2026-09-19。lib/legacyProfileKeys）。
    生年月日と座標は画面ごとの鍵（arb_* / wealth_*）にも入っていて、
    正の設定に無い人がいる。読む前に引き上げておくと、以後の画面は
    正の設定だけを見れば済む。

    **クラウドと突き合わせる前に置く。**別の端末で出発地を消した人は
    クラウド側が null で降りてくる。あとから引き上げると、消したはずの
    値が旧い鍵から復活する。
  */
  migrateLegacyProfileKeys();
  const local = readLocalSettings();

  try {
    const res = await fetch("/api/user-config");
    if (!res.ok) return { settings: withoutTombstones(local), synced: false }; // 401 = 未ログイン
    const remote = await res.json();

    const savedAt = settingString(local, SAVED_AT);
    const localAt = savedAt ? Date.parse(savedAt) : 0;
    const remoteAt = remote.updated_at ? Date.parse(remote.updated_at) : 0;

    const remoteFields: Settings = {};
    /* クラウドで**消した**項目（null）。別の端末で出発地を消しても、
       null を読み飛ばすと古い値が端末に残り、次の保存で復活していた。
       クラウドが新しいときだけ、消えた項目を端末からも外す。 */
    const remoteCleared: string[] = [];
    for (const key of SYNCED_FIELDS) {
      if (remote[key] === null) {
        remoteCleared.push(key);
      } else if (remote[key] !== undefined) {
        remoteFields[key] = remote[key];
      }
    }

    // クラウドが新しければ上書き、そうでなければ欠けている項目だけ補完する。
    let settings: Settings;
    if (remoteAt > localAt) {
      settings = { ...local, ...remoteFields };
      for (const key of remoteCleared) delete settings[key];
      /*
        **消えた項目は端末にも書く。**以前は返り値から消すだけで
        localStorage には残っており、その端末で何か保存して _savedAt が
        クラウドを追い越した瞬間に、消したはずの値が戻っていた
        （2026-09-19 に再現。上のコメントの「端末からも外す」と実装が
        食い違っていた）。

        鍵ごと消さずに null を置く。「消した跡」を残しておかないと、
        旧い画面の写し（legacyProfileKeys）が「まだ引き上げていない欄」
        と見なして拾い直す。
      */
      const stale = remoteCleared.filter((key) => local[key] != null);
      if (stale.length > 0) {
        const tombstones: Settings = {};
        for (const key of stale) tombstones[key] = null;
        writeLocalSettings(tombstones, false);
      }
    } else {
      settings = { ...remoteFields, ...local };
    }

    return { settings: withoutTombstones(settings), synced: true };
  } catch {
    return { settings: withoutTombstones(local), synced: false };
  }
}

/**
 * クラウドへ保存できなかった理由。**画面の文言はこれで分ける。**
 *
 * 以前は `synced: false` の 1 つしか無く、次の 4 つが同じ
 * 「この端末に保存しました。ログインすると、ほかの端末でも同じ設定が
 * 使えます。」になっていた。
 *
 *   - 未ログイン（そのとおりの案内）
 *   - ログインしているのにサーバが 401（ログインし直せば直る）
 *   - サーバが別の理由で断った（4xx/5xx。利用者には直せない）
 *   - 送る項目が 1 つも無かった（そもそも通信していない）
 *
 * 2026-09-12 に「/profile で保存すると『この端末に保存しました』と出て
 * プロフィールに保存できない」という報告を受けたが、**画面もログも
 * どれなのかを言えなかった。**ログインしている人に「ログインすると」と
 * 案内するのは、それ自体が間違った案内でもある。
 */
export type SaveFailure =
  /** 401。未ログイン、またはログインの状態が切れている。 */
  | "unauthenticated"
  /** 401 以外の応答。status に実際のコードが入る。 */
  | "rejected"
  /** 応答が返らなかった（通信断・遮断）。 */
  | "offline"
  /** クラウドへ送る項目が 1 つも無かった（端末だけの項目を保存した）。 */
  | "nothing-to-sync";

export type SaveResult = {
  settings: Settings;
  /** クラウドにも保存できたか。未ログインなら false。 */
  synced: boolean;
  /** synced が false のときだけ入る。なぜ送れなかったか。 */
  reason?: SaveFailure;
  /** reason が "rejected" のときの HTTP のコード。 */
  status?: number;
};

/** 端末には必ず保存し、ログイン中ならクラウドにも送る。 */
export async function saveSettings(patch: Settings): Promise<SaveResult> {
  const settings = writeLocalSettings(patch);
  const payload = pickSynced(patch);

  if (Object.keys(payload).length === 0) {
    return { settings, synced: false, reason: "nothing-to-sync" };
  }

  try {
    const res = await fetch("/api/user-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { settings, synced: true };
    return {
      settings,
      synced: false,
      reason: res.status === 401 ? "unauthenticated" : "rejected",
      status: res.status,
    };
  } catch {
    return { settings, synced: false, reason: "offline" };
  }
}
