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

/**
 * 覚え書きから落とす制御文字。**改行だけ残す**（`\u000A` を範囲から外す）。
 */
const MEMO_CONTROL_CHARS =
  /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\uFEFF]/g;

/** URL の長さの上限。ポータルの URL は長いので余裕を取る。 */
export const MAX_SPOT_URL_LENGTH = 2000;
/** 覚え書きの長さの上限。 */
export const MAX_SPOT_MEMO_LENGTH = 500;

/**
 * 物件ページへの印にしてよい URL か。**https だけ。**
 *
 * ## なぜ綴りを絞るか
 *
 * この値は画面でリンクとして描く。javascript: や data: を通すと、保存した
 * 本人の画面で任意のコードが走る。**入口で落とす**（描く側でも落とすが、
 * そもそも保存しないほうが確実）。
 *
 * http: も落とす。物件のポータルはどこも https で、平文で開く理由が無い。
 *
 * ## ここでは取りに行かない
 *
 * 検証は**綴りを見るだけ**。URL の中身は取得しない。取りに行けば
 * スクレイピングで、nifty の特約が名指しで禁じている（backlog 29 節。
 * 見張りは `__tests__/userSpotUrlNeverFetched.test.ts`）。
 *
 * @returns 正規化した URL。印にしてよくないものは null。
 */
export function normalizeSpotUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_SPOT_URL_LENGTH) return null;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  /* ホストの無い https を弾く */
  if (!u.hostname) return null;
  const out = u.toString();
  return out.length > MAX_SPOT_URL_LENGTH ? null : out;
}

/**
 * 覚え書きを保存してよい形に整える。名前と同じ扱いで制御文字を落とす。
 *
 * **改行だけは残す。**間取りや家賃を数行で書くのが自然なので、名前のように
 * 1 行へ潰さない。
 */
export function normalizeSpotMemo(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(MEMO_CONTROL_CHARS, "")
    .trim()
    .slice(0, MAX_SPOT_MEMO_LENGTH);
  return cleaned || null;
}
