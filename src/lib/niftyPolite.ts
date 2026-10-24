/**
 * nifty 不動産（myhome.nifty.com）を読む取り込みが**共通で守るもの**。
 *
 * 賃貸（nifty_extractor.ts）と売地（nifty_land_extractor.ts）は同じ
 * ホストに要求する。相手から見た作法（間隔・名乗り・掲載期限の読み方）
 * は 1 か所に置き、両方から読む（CLAUDE.md 3 節「同じことを 2 か所に
 * 書かない」）。ここに置くのは**相手に対する振る舞い**だけで、保存先や
 * 欄の型は各取り込みが持つ。
 */

/**
 * **1 ページあたりの最低間隔。**取得を始めてからここまでは、次のページへ
 * 行かない。
 *
 * ## なぜ「待つ」と書くようになったか（2026-08-30 の事故）
 *
 * 以前の待機は「polite delay 2〜4 秒」だけだった。ところが**保存が
 * 1 件ずつで 15〜30 秒かかっており、それが実質のスロットルとして
 * 働いていた。**#767 で保存をまとめたら 1 ページの間隔が 34.3 秒 →
 * 6.0 秒（中央値）になり、相手への要求レートが 3〜5 倍になった。
 * 8 ジョブ並列なので全体ではさらに効く。
 *
 * その晩の巡回は、再開した大都市を抜けた直後から**ほぼ全ての市区町村で
 * 「0 件」**を返すようになった（江東区・品川区が 0 件ということはない）。
 * 8/26 の富山（間隔 14.5 秒）は 14 市町村すべてで取れていたので、
 * レートを上げたことが原因とみている。
 *
 * **速さを保存待ちの副作用に頼らない。**必要な間隔はここに数字で書く。
 * 事故前の実測（14.5〜34.3 秒）の下寄りに置いた。**短くしないこと。**
 *
 * 売地の取り込みも同じ値を守る。系統が増えるぶん相手から見た総量は
 * 増えるので、売地はワークフローの側で時間帯と予算を分けて重ねない
 * （docs/improvement-backlog.md 25 節）。
 */
export const MIN_PAGE_INTERVAL_MS = 20000;

/** 取得開始から MIN_PAGE_INTERVAL_MS 経つまで待つ。既に過ぎていれば待たない。 */
export async function waitForMinimumPageInterval(
  startedAt: number,
): Promise<void> {
  /* 一定間隔だと相手から見て機械的すぎるので、以前と同じ幅で散らす */
  const jitter = Math.floor(Math.random() * 2000);
  const waitMs = MIN_PAGE_INTERVAL_MS + jitter - (Date.now() - startedAt);
  if (waitMs <= 0) return;
  console.log(
    `Polite delay: Waiting for ${Math.round(waitMs / 1000)} seconds...`,
  );
  await new Promise((res) => setTimeout(res, waitMs));
}

/** Playwright の context に渡す名乗り。賃貸と売地で同じにする。 */
export const NIFTY_CONTEXT_OPTIONS = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
};

/**
 * nifty の掲載期限は "20260810000000" (YYYYMMDDHHMMSS) 形式。
 * 掲載が終わった物件の詳細ページは 404 になるため、これを保存して
 * 期限切れを画面から外す。実測では 7 日以上再確認できていない行の
 * 半数が既に 404 だった。
 */
export function parseExpireDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(`${y}-${mo}-${d}T23:59:59+09:00`);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * 県の索引ページのリンクから、市区町村のローマ字（`{city}_ct/` の
 * city）を重複なく取り出す。`section` は `rent`（賃貸）か `tochi`（売地）。
 *
 *     https://myhome.nifty.com/rent/tokyo/minatoku_ct/  → minatoku
 */
export function cityAliasesFromHrefs(
  hrefs: readonly string[],
  section: "rent" | "tochi",
): string[] {
  const re = new RegExp(`/${section}/[^/]+/([a-z0-9]+)_ct/`);
  const out = new Set<string>();
  for (const h of hrefs) {
    if (!h.includes("_ct/") || h.includes("detail_")) continue;
    const m = h.match(re);
    if (m) out.add(m[1]);
  }
  return Array.from(out);
}
