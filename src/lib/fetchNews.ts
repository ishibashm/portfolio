import { decodeFeedBytes, parseFeed, type NewsItem } from "@/lib/rssParse";
import { NEWS_FEEDS, type FeedSource } from "@/data/newsSources";

/**
 * /news のフィード取得。サーバ側でだけ動く。
 *
 * ## 負荷の設計
 *
 * Next の fetch キャッシュに 6 時間（21600 秒）で持たせる。ページを
 * 何人が開いても、相手のサーバへは 1 フィードあたり 1 日 4 回しか
 * 行かない。**revalidate を短くしないこと**（3 節「相手サーバーの
 * 負荷」と同じ考え方。ニュースの鮮度に 6 時間は十分）。
 *
 * ## 失敗の設計
 *
 * 台帳の URL は本番でしか生存確認できない（開発環境は外に出られない）。
 * だから**失敗はこのページの正常系**として扱う。
 *
 * - フィードごとに独立して取得し、落ちたものは黙って飛ばす
 * - 5 秒で諦める。遅い 1 本にページ全体を待たせない
 * - CI のビルドにも外へ出る経路は無いが、そこでも同じ道
 *   （全滅 → 空で描画）を通るだけで、ビルドは落ちない
 */

export interface FeedResult {
  source: FeedSource;
  /** 取得できたか。false のときも items は空配列で返る。 */
  ok: boolean;
  items: NewsItem[];
}

/** 1 フィードあたりの取得上限（表示側でさらに絞ってよい）。 */
const ITEMS_PER_FEED = 20;
/** 取得を諦めるまでの時間。 */
const TIMEOUT_MS = 5000;
/** キャッシュの寿命。1 日 4 回まで。 */
export const REVALIDATE_SECONDS = 21600;

async function fetchOne(source: FeedSource): Promise<FeedResult> {
  try {
    const res = await fetch(source.feedUrl, {
      headers: {
        /* 誰が取りに来ているかを名乗る。行儀と、先方が絞りたく
           なったときに識別できるようにする目的 */
        "User-Agent":
          "cloud-palette.com news reader (+https://cloud-palette.com/news)",
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { source, ok: false, items: [] };
    /*
      res.text() は使わない。常に UTF-8 として読むので、Shift_JIS /
      EUC-JP の配信（官公庁系に残っている）が文字化けする。実際に
      /news で化けた（利用者報告）。バイト列で受けて宣言から復号する。
    */
    const xml = decodeFeedBytes(
      await res.arrayBuffer(),
      res.headers.get("content-type"),
    );
    const items = parseFeed(xml, ITEMS_PER_FEED);
    /* 200 でも中身がフィードでない（メンテ画面など）ことはある。
       0 件は「取得失敗」として扱い、出典の行ごと隠す */
    return { source, ok: items.length > 0, items };
  } catch {
    return { source, ok: false, items: [] };
  }
}

/** 台帳の全フィードを並行に取得する。順序は台帳のまま。 */
export async function fetchAllFeeds(): Promise<FeedResult[]> {
  return Promise.all(NEWS_FEEDS.map(fetchOne));
}
