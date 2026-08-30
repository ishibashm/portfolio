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
  /** 実際に読めた URL。全滅なら null。どの候補で通ったかの記録。 */
  usedUrl: string | null;
}

/** 1 フィードあたりの取得上限（表示側でさらに絞ってよい）。 */
const ITEMS_PER_FEED = 20;
/** 取得を諦めるまでの時間。 */
const TIMEOUT_MS = 5000;
/** キャッシュの寿命。1 日 4 回まで。 */
export const REVALIDATE_SECONDS = 21600;

/** 1 本の URL を読んでみる。読めなければ空配列。 */
async function fetchUrl(url: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
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
    if (!res.ok) return [];
    /*
      res.text() は使わない。常に UTF-8 として読むので、Shift_JIS /
      EUC-JP の配信（官公庁系に残っている）が文字化けする。実際に
      /news で化けた（利用者報告）。バイト列で受けて宣言から復号する。
    */
    const xml = decodeFeedBytes(
      await res.arrayBuffer(),
      res.headers.get("content-type"),
    );
    /* 200 でも中身がフィードでない（メンテ画面など）ことはある。
       0 件は「取得失敗」として扱う */
    return parseFeed(xml, ITEMS_PER_FEED);
  } catch {
    return [];
  }
}

/**
 * 1 つの情報源を取る。**成功したらそこで打ち切る**ので、平常時は
 * 1 情報源につき 1 リクエストしか出ない（予備 URL を書いても
 * 相手への頻度は増えない）。予備へ行くのは失敗したときだけ。
 */
async function fetchOne(source: FeedSource): Promise<FeedResult> {
  const candidates = [source.feedUrl, ...(source.altFeedUrls ?? [])];
  for (const url of candidates) {
    const items = await fetchUrl(url);
    if (items.length > 0) return { source, ok: true, items, usedUrl: url };
  }
  return { source, ok: false, items: [], usedUrl: null };
}

/** 台帳の全フィードを並行に取得する。順序は台帳のまま。 */
export async function fetchAllFeeds(): Promise<FeedResult[]> {
  return Promise.all(NEWS_FEEDS.map(fetchOne));
}

/** 新着一覧の 1 行。どの配信元から来たかを持ち歩く。 */
export interface MergedNewsItem {
  item: NewsItem;
  source: FeedSource;
}

/**
 * 取得できた配信元の見出しを 1 本の新着順にまとめる。
 *
 * 配信元が 8 つになって、媒体ごとの札を上から順に見ていくと
 * 「今日は何が動いたか」が分からなくなった。まず全媒体の新着を
 * 日付順で見せ、媒体ごとの並びはその下に残す。
 *
 * - 日付が読めない見出しは**最後**に回す（台帳の順のまま）
 * - 同じ URL は 1 回だけ（配信元をまたいだ重複を畳む。先に載って
 *   いる配信元が勝つ＝台帳の順）
 */
export function mergeLatest(
  feeds: readonly FeedResult[],
  limit: number,
): MergedNewsItem[] {
  const seen = new Set<string>();
  const merged: MergedNewsItem[] = [];

  for (const feed of feeds) {
    if (!feed.ok) continue;
    for (const item of feed.items) {
      if (seen.has(item.link)) continue;
      seen.add(item.link);
      merged.push({ item, source: feed.source });
    }
  }

  /* 日付の無いものを最後へ。あるものどうしは新しい順。
     Array.prototype.sort は安定なので、日付が同じ／両方無いときは
     台帳の順が残る */
  merged.sort((a, b) => {
    const ta = a.item.publishedAt ? Date.parse(a.item.publishedAt) : NaN;
    const tb = b.item.publishedAt ? Date.parse(b.item.publishedAt) : NaN;
    const va = Number.isNaN(ta);
    const vb = Number.isNaN(tb);
    if (va && vb) return 0;
    if (va) return 1;
    if (vb) return -1;
    return tb - ta;
  });

  return merged.slice(0, limit);
}
