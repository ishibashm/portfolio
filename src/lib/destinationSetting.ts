import {
  readLocalSettings,
  writeLocalSettings,
  SYNCED_FIELDS,
  settingNumber,
  settingString,
  type Settings,
} from "@/lib/userSettings";

/**
 * 引越し先の候補（目的地）。**端末にだけ置く。**
 *
 * ## クラウドに送らない
 *
 * 「どこへ引越すつもりか」は、生年月日や出発地よりさらに踏み込んだ
 * 情報になる。`userSettings` の `SYNCED_FIELDS` に**入れない**。
 * 保存先は同じ localStorage だが、同期は `SYNCED_FIELDS` だけを拾う
 * 作りなので、ここに書いた値はクラウドへ出ていかない。
 * 風水の性別（`fengShuiSettings`）と同じ扱いで、理由も同じ。
 *
 * **あとから同期対象に足さないこと。**列は消せても、集めてしまった
 * データは revert では消えない。
 *
 * ## なぜ覚えるのか
 *
 * 出発地は 1 つだが、目的地は道具ごとに入れ直していた（シミュレータ・
 * 物件検索・時期の分析）。同じ場所を 3 回打つことになるので、入力の
 * 頁で 1 度入れたら持ち回れるようにする。
 *
 * ## 地名も持つ
 *
 * 座標だけだと、次に開いたとき自分が何を入れたのか読めない。表示用の
 * 地名を一緒に置く。**判定には使わない**（判定は座標だけで決まる）。
 */

export const DEST_LAT = "dest_lat";
export const DEST_LON = "dest_lon";
export const DEST_LABEL = "dest_label";

/** この 3 つは同期しない。検査がこの表を見て検算する。 */
export const DEVICE_ONLY_DESTINATION_KEYS = [
  DEST_LAT,
  DEST_LON,
  DEST_LABEL,
] as const;

export interface DestinationSetting {
  lat: number | null;
  lon: number | null;
  /** 表示用の地名。判定には使わない。 */
  label: string;
}

/** 緯度経度として受け付ける範囲。外れた値は「未設定」に倒す。 */
function validCoord(lat: number | undefined, lon: number | undefined): boolean {
  if (lat === undefined || lon === undefined) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function readDestination(): DestinationSetting {
  const s = readLocalSettings();
  const lat = settingNumber(s, DEST_LAT);
  const lon = settingNumber(s, DEST_LON);
  const ok = validCoord(lat, lon);
  return {
    lat: ok ? lat! : null,
    lon: ok ? lon! : null,
    label: settingString(s, DEST_LABEL) ?? "",
  };
}

/**
 * 変えたぶんだけ書く。丸ごと置き換えると、同じ localStorage に載っている
 * 生年月日や出発地を巻き添えで消す（`writeLocalSettings` が差分書き）。
 */
export function writeDestination(patch: Partial<DestinationSetting>): void {
  const next: Settings = {};
  if (patch.lat !== undefined) next[DEST_LAT] = patch.lat;
  if (patch.lon !== undefined) next[DEST_LON] = patch.lon;
  if (patch.label !== undefined) next[DEST_LABEL] = patch.label;
  if (Object.keys(next).length === 0) return;
  writeLocalSettings(next);
  for (const listener of listeners) listener();
}

/** 同期対象に紛れ込んでいないか。検査と、開発時の取り違え防止に使う。 */
export function isDeviceOnlyDestinationKey(key: string): boolean {
  return !(SYNCED_FIELDS as readonly string[]).includes(key);
}

/*
  localStorage は React の外にある状態なので、useEffect の中で setState
  して読むのではなく useSyncExternalStore で購読する（fengShuiSettings と
  同じ形）。覚えを返す関数は毎回同じ値を返さないと再描画が止まらないので、
  オブジェクトではなく文字列を返す。
*/
const listeners = new Set<() => void>();

export function subscribeDestination(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function destinationSnapshot(): string {
  const d = readDestination();
  return `${d.lat ?? ""}|${d.lon ?? ""}|${d.label}`;
}

/** サーバ側。localStorage が無いので「未設定」に倒す。 */
export const DESTINATION_SERVER_SNAPSHOT = "||";

export function parseDestinationSnapshot(snapshot: string): DestinationSetting {
  const [lat, lon, ...rest] = snapshot.split("|");
  const label = rest.join("|");
  const nLat = lat === "" ? undefined : Number(lat);
  const nLon = lon === "" ? undefined : Number(lon);
  const ok = validCoord(nLat, nLon);
  return { lat: ok ? nLat! : null, lon: ok ? nLon! : null, label };
}
