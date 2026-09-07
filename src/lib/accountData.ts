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
 *   profile_presets_cloud_ids_v1 … クラウドにあると最後に確かめた id
 *   presets_initialized … クラウドが空だと分かっている印
 *   arb_* / wealth_* … 画面ごとの写し（下記）
 *   relocation_simulator_draft … シミュレータの下書き（出発地の名前が入る）
 *
 * ## 画面ごとの写しが消えていなかった（2026-09-07）
 *
 * 生年月日と座標は `tactical_config_v1` のほかに、**画面ごとの鍵にも
 * 写されている。**物件検索は `arb_birthDate` / `arb_baseLat` /
 * `arb_baseLon`、資産マップとホームの時計は `wealth_birthDate` /
 * `wealth_birthLat` / `wealth_birthLon` / `wealth_baseLat` /
 * `wealth_baseLon` を直に読み書きする（`userSettings` を通さない）。
 *
 * ここに入れていなかったので、**「すべて消す」を押しても生年月日が
 * 端末に残り**、九星の診断（`HonmeiLookup`）やシミュレータの入口
 * （`SimulatorStart`）が次に開いたときそれを拾って入力欄を埋めていた。
 * 画面には「アカウントからもこの端末からも消します」と書いてある。
 *
 * **同じ値を別の鍵にも書く画面を足したら、ここに足すこと。**下の
 * 検査が、src の中の鍵を数え上げて突き合わせる。
 *
 * ## 消さないもの
 *
 * - **地図に自分で置いた地点（user_spots_v1）**。サーバーに送っていない
 *   別系統の控えで、「登録した内容」に含めていない
 * - **お気に入り物件（favorite_properties_v1）**。同上
 * - **計測の停止（cp:metrics-opt-out）**。これは登録内容ではなく
 *   「集めないでほしい」という意思表示で、**消すと黙って計測が
 *   再開する**。消してはいけない側
 * - 地図の見え方（下地・重ねる層・タブ）と検索の絞り込み。個人の値では
 *   なく画面の状態
 */
export const ACCOUNT_LOCAL_KEYS = [
  "tactical_config_v1",
  "profile_presets_v1",
  "wealth_presets",
  "profile_presets_cloud_ids_v1",
  "presets_initialized",
  /* 物件検索が直に持つ写し */
  "arb_birthDate",
  "arb_baseLat",
  "arb_baseLon",
  /* 資産マップ・ホームの時計が直に持つ写し */
  "wealth_birthDate",
  "wealth_birthLat",
  "wealth_birthLon",
  "wealth_baseLat",
  "wealth_baseLon",
  /* シミュレータの下書き（出発地の名前が入る） */
  "relocation_simulator_draft",
  /*
    目的地。**いまは tactical_config_v1 の中の項目**なので、上の 1 行目で
    既に消えている（destinationSetting は writeLocalSettings 経由で書く）。
    ここに残すのは、独立した鍵に移した日に消し忘れないための保険。
  */
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
