/**
 * 「登録した内容をすべて消す」の中身。
 *
 * 消す先は 2 か所ある。**どちらか片方だけだと、消したはずのものが
 * 戻ってくる。**
 *
 *   クラウド … user_configs の行（生年月日・場所・保存済みプロフィール・
 *              設定バーの好み）。DELETE /api/user-config
 *   この端末 … localStorage。設定・保存済みプロフィール・目的地
 *
 * クラウドだけ消して端末に残すと、次に保存したときに端末の値が
 * 上がっていって元に戻る（`userSettings.loadSettings` は端末の値を
 * 土台にする）。端末だけ消すと、次のログインでクラウドから降ってくる。
 *
 * **消すのはアカウントに紐づく登録内容だけ。**Google のアカウント自体、
 * ログインの記録、送った問い合わせは対象外。画面にもそう書く。
 */

/**
 * 端末から消す鍵。
 *
 * 由来を書いておく（増えたときに、どれを足すべきか分かるように）。
 *   tactical_config_v1 … userSettings.SETTINGS_KEY（生年月日・場所・基準値）
 *   profile_presets_v1 / wealth_presets … profilePresetSync の 2 つ
 *   presets_initialized … クラウドが空だと分かっている印
 *   dest_lat / dest_lon / dest_label … destinationSetting（端末だけ・同期しない）
 *
 * **地図に自分で置いた地点（user_spots_v1）は消さない。**サーバーに
 * 送っていない別系統の控えで、「登録した内容」に含めていない。消す
 * つもりの無いものを巻き込まないほうがよい。
 */
export const ACCOUNT_LOCAL_KEYS = [
  "tactical_config_v1",
  "profile_presets_v1",
  "wealth_presets",
  "presets_initialized",
  "dest_lat",
  "dest_lon",
  "dest_label",
] as const;

/** localStorage のうち、この処理が使う部分だけ。 */
export interface AccountStorage {
  removeItem(key: string): void;
}

export type Fetcher = typeof fetch;

export function clearLocalAccountData(storage: AccountStorage): void {
  for (const key of ACCOUNT_LOCAL_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      /* プライベートモードなどで消せないことがある。残りを続ける */
    }
  }
}

export interface DeleteResult {
  /** クラウドの行も消せたか。未ログインなら false。 */
  cloudCleared: boolean;
  /** 未ログインだった（消すクラウドの行がそもそも無い）。 */
  unauthenticated: boolean;
}

/**
 * クラウドと端末の両方から消す。
 *
 * **端末は必ず消す。**クラウドの削除が失敗しても端末を残すと、利用者に
 * とっては「押したのに何も消えていない」になる。クラウド側は結果を
 * 返して画面に出す（もう一度押せる）。
 */
export async function deleteAccountData(
  fetcher: Fetcher,
  storage: AccountStorage,
): Promise<DeleteResult> {
  let cloudCleared = false;
  let unauthenticated = false;

  try {
    const response = await fetcher("/api/user-config", { method: "DELETE" });
    cloudCleared = response.ok;
    unauthenticated = response.status === 401;
  } catch {
    /* 通信の失敗。端末は下で消す */
  }

  clearLocalAccountData(storage);
  return { cloudCleared, unauthenticated };
}
