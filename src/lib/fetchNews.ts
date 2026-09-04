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
 *
 * ## 同じ相手に一度に投げない
 *
 * 台帳のフィードを素直に Promise.all すると、**1 つの発信元が配信を
 * 12 本に分けている場合、そのサーバへ 12 本を同時に投げる**（UR 都市
 * 機構がそう。報道発表・賃貸・入札が別フィード）。1 日 4 回という
 * 総量は変わらないが、瞬間のレートは 12 倍になる。
 *
 * だから**ホストごとに同時数を絞る**（PER_HOST_CONCURRENCY）。
 * ホストをまたぐぶんは今までどおり並行。「速さは待つと書いて決める。
 * 副作用に頼らない」（CLAUDE.md 3 節）と同じ考え方で、レートを
 * 実装の都合で決めない。
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
/**
 * 取得を諦めるまでの時間。
 *
 * **5 秒では足りなかった**（2026-09-04 の実測）。UR 都市機構を 12 本
 * 入れた直後の site-audit で、毎回 2〜3 本が「取得できていない」に
 * 出た。しかも**落ちる本が毎回入れ替わる**（1 回目は honsha・east・
 * saitama、5 分後は tohoku・toshin）。URL が死んでいるなら同じ本が
 * 落ちるので、これは相手の応答の遅さ。
 *
 * probe-news-feeds の実測（run 33816205060）で裏が取れた。1 秒ずつ
 * 空けて 13 本を順に叩いたときの応答は、**ほとんどが 0.33 秒なのに
 * 4 本が 6.4 秒**かかっている（im-reconstruction・east・chiba・
 * kanagawa）。遅くなる本は固定ではなく、3 本に 1 本くらいの割合。
 *
 * 解析が重いのではない。1.73MB の ur_release.xml でも復号 22ms・
 * 解析 6ms（実測）で、事象の説明にならない。
 *
 * 実測の 6.4 秒に余裕を持たせて 12 秒。ホストごとに 4 本ずつなので、
 * 全滅しても 1 ホスト 3 巡 = 36 秒。ページは ISR で古いものを出しながら
 * 裏で作り直すので、利用者を待たせるのはここではない。
 */
export const TIMEOUT_MS = 12000;
/** キャッシュの寿命。1 日 4 回まで。 */
export const REVALIDATE_SECONDS = 21600;
/**
 * 同じホストへ同時に投げる本数の上限。
 *
 * 1 本ずつにすると、12 本ぶんの待ちが直列に積まれて最悪 60 秒
 * （12 × TIMEOUT_MS）ページの再生成が止まる。4 なら最悪 15 秒で、
 * 相手には常に 4 本までしか当たらない。**この数字を大きくしない。**
 */
const PER_HOST_CONCURRENCY = 4;
/**
 * 新着一覧で 1 つの発信元（束）が取れる件数の上限。
 *
 * 一覧は 24 件で、発信元は 9 つ（8 媒体 + UR）。4 なら全部の発信元が
 * 出たうえで枠が余り、日付の新しいものから埋まる。
 */
const PER_GROUP_LIMIT = 4;

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

/** フィード URL のホスト。読めない URL は 1 つの束に落として絞る。 */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * 台帳の全フィードを取得する。**ホストごとに同時 PER_HOST_CONCURRENCY
 * 本まで**で、ホストをまたぐぶんは並行。順序は台帳のまま。
 */
export async function fetchAllFeeds(): Promise<FeedResult[]> {
  const byHost = new Map<string, FeedSource[]>();
  for (const source of NEWS_FEEDS) {
    const host = hostOf(source.feedUrl);
    const list = byHost.get(host);
    if (list) list.push(source);
    else byHost.set(host, [source]);
  }

  const results = new Map<FeedSource, FeedResult>();
  await Promise.all(
    [...byHost.values()].map(async (sources) => {
      for (let i = 0; i < sources.length; i += PER_HOST_CONCURRENCY) {
        const batch = sources.slice(i, i + PER_HOST_CONCURRENCY);
        const got = await Promise.all(batch.map(fetchOne));
        got.forEach((r, k) => results.set(batch[k], r));
      }
    }),
  );

  /* 台帳の順に戻す。画面の並びが取得の速さで揺れないように */
  return NEWS_FEEDS.map((source) => results.get(source)!);
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
 * - **1 つの発信元の取り分は PER_GROUP_LIMIT 件まで**（下記）
 *
 * ## 取り分を束ごとに数える
 *
 * 配信を 12 本に分けている発信元（UR 都市機構）を台帳へ入れると、
 * 発信元は 1 つなのに一覧の枠を 12 本ぶん取り合うことになる。24 枠の
 * うち大半が同じ発信元で埋まり、他の 8 媒体が押し出される。
 *
 * だから**束（FeedSource.group）ごとに上限を掛ける**。束の無い配信元
 * は自分だけの束として数える。日付順に並べてから数えるので、残るのは
 * その束の**新しいほうから** PER_GROUP_LIMIT 件。
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

  /* 束ごとの取り分を数えて絞る。並べ替えたあとに数えるので、
     残るのは各束の新しいほうから */
  const taken = new Map<string, number>();
  const out: MergedNewsItem[] = [];
  for (const m of merged) {
    if (out.length >= limit) break;
    const key = m.source.group ?? m.source.id;
    const n = taken.get(key) ?? 0;
    if (n >= PER_GROUP_LIMIT) continue;
    taken.set(key, n + 1);
    out.push(m);
  }
  return out;
}
