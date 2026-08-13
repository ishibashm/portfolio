import { createHash } from "node:crypto";

/**
 * ページ閲覧の記録（page_views）の判定と加工。
 *
 * サイトには計測が何も入っておらず、利用者がいるのかどうかすら
 * 分からなかった。ここは「来ているかどうか」を測るための最小限で、
 * 誰が来ているかは扱わない。
 *
 * ここに置くのは純粋な関数だけ。DB への書き込みは API ルートが持つ。
 */

/**
 * 記録してよいパスか。壊れた値・計測に意味の無い値を落とす。
 *
 * 許可制ではなく拒否制にしてある。ページは増減するので、ルートの
 * 一覧をここに写すと必ずずれる（nonCoreRoutes.json を 1 か所に
 * まとめた経緯と同じ）。落とすのは形式がおかしいものだけにする。
 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/")) return null;
  // ビーコンは pathname だけを送るが、壊れたクライアントに備えて
  // クエリとフラグメントはここでも捨てる。
  const path = raw.split(/[?#]/)[0];
  if (path.length > 200) return null;
  // API・内部アセット・拡張子付き（画像や .txt）は「ページ」ではない。
  if (path.startsWith("/api/") || path.startsWith("/_next")) return null;
  if (/\.[a-zA-Z0-9]+$/.test(path)) return null;
  // 認証コールバックなどの一時的なパスに乗る秘密を拾わないよう、
  // 使う文字を絞る。日本語のパスは今のところ無い。
  if (!/^[a-zA-Z0-9\-_/[\]%.]*$/.test(path)) return null;
  return path;
}

/**
 * 検索エンジンや監視のクローラか。
 *
 * 網羅はできないし、しない。主要どころを落とせば「利用者がいるか」の
 * 判断には足りる。UA を偽装する bot はどの解析でも防げない。
 */
export function isBotUserAgent(ua: string): boolean {
  if (!ua) return true;
  return /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|preview|scrape|curl|wget|python-requests|node-fetch|axios/i.test(
    ua,
  );
}

/**
 * 参照元のホスト名だけを取り出す。自サイト内の遷移と不正な URL は null。
 *
 * URL 全体を保存しないのは、検索語や共有トークンなどが載ることが
 * あるため。「どこから来たか」にはホスト名で足りる。
 */
export function referrerHostFrom(
  referrer: unknown,
  ownHost: string,
): string | null {
  if (typeof referrer !== "string" || referrer === "") return null;
  try {
    const host = new URL(referrer).hostname;
    if (!host || host === ownHost) return null;
    return host.slice(0, 100);
  } catch {
    return null;
  }
}

/**
 * User-Agent からデバイスの種別だけを取り出す。
 *
 * 保存するのはこの 3 値（と判定不能の null）だけで、UA そのものは
 * 保存しない。管理ページで「スマホから見られているのか PC なのか」を
 * 読むための粒度で、それ以上に細かくしない（機種・OS・ブラウザ名は
 * 個人の絞り込みに近づくだけで、判断には要らない）。
 *
 * 判定は素朴でよい。iPad は Mobile を名乗らないので先に見る。
 * Android はタブレットだけ Mobile を名乗らない（Chrome の慣習）。
 */
export function deviceTypeFrom(ua: string): "pc" | "mobile" | "tablet" | null {
  if (!ua) return null;
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  return "pc";
}

/**
 * その日の中でだけ同一人物を束ねられる匿名ハッシュ。
 *
 * 日付を混ぜるので、翌日には同じ人を追えない（Plausible と同じ考え方）。
 * IP・UA そのものは保存せず、この値からも復元できない。
 * UV は「その日に何人来たか」以上のことを言わない。
 */
export function visitorHash(ip: string, ua: string, day: string): string {
  return createHash("sha256").update(`${day}\n${ip}\n${ua}`).digest("hex");
}
