/**
 * 地点の鍵と上限。**画面（localStorage）と API（DB）で同じ規則を使う。**
 *
 * `lib/userSpots` は "use client" なので、サーバー側の route から import すると
 * client 専用のものを引き込む。両方から読む小さな決めだけをここに出す
 * （同じ数字・同じ丸め方を 2 か所に書かない）。
 */

/** 上限。地図に出す数と、保存の大きさの両方の歯止め。 */
export const MAX_USER_SPOTS = 50;

/** 座標を丸めた桁。5 桁でおよそ 1m。 */
export const POINT_KEY_DIGITS = 5;

/**
 * 同じ地点かを決める鍵。`sameSpot`（画面側）と同じ丸め方。
 *
 * DB の一意は `(user_id, point_key)`。**浮動小数の列に一意を張らない**
 * （丸めの差で同じ地点が 2 行になる）。
 */
export function pointKey(lat: number, lon: number): string {
  return `${lat.toFixed(POINT_KEY_DIGITS)},${lon.toFixed(POINT_KEY_DIGITS)}`;
}

/**
 * 利用者が付けた名前を、保存してよい形に整える。
 *
 * 制御文字（改行・タブ・ゼロ幅など）を落としてから前後の空白を取り、
 * 60 文字で切る。**画面と API の両方でこれを通す**ので、片方だけ緩い、
 * という穴ができない。
 */
export function normalizeSpotName(raw: string): string {
  return raw
    .replace(
      /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\uFEFF]/g,
      "",
    )
    .trim()
    .slice(0, 60);
}
