import { NextResponse } from "next/server";
import {
  fetchAllFeeds,
  type FeedResult,
  type MergedNewsItem,
} from "@/lib/fetchNews";
import { filterLocalNews, localNewsKeys } from "@/lib/localNews";
import { findArea } from "@/lib/areaContent";
import { prefNameByCode } from "@/lib/prefContent";

/**
 * その地域のニュースを返す口。
 *
 * ## なぜ API にするか（頁の中で読まない）
 *
 * 市区町村ページは 1,022 枚あり、静的に焼いている。頁の中で
 * `fetchAllFeeds` を呼ぶと、**ビルドのたびに 1,022 回ぶんの取得を
 * 試みる**。CI は外に出られないので全部が諦めるまで待つことになり、
 * ビルドが伸びるだけで中身も空になる（外に出られない環境で焼いた
 * HTML が配られる）。
 *
 * 画面側から呼ぶ形にすれば、静的な頁はそのまま静的なままで、見出しは
 * 本番のサーバが答える。
 *
 * ## 相手への負荷は増えない
 *
 * ここが呼ぶのは `fetchAllFeeds` で、その中の fetch は 6 時間の
 * キャッシュに載っている（`REVALIDATE_SECONDS`）。市区町村ページを
 * 何枚開いても、配信元へ行く回数は 1 フィードあたり 1 日 4 回のまま。
 * **絞り込みは取ったあとに手元で行う。**
 *
 * ## 判定には関係しない
 *
 * 方位の吉凶とは無関係の、参考として並べる見出し。
 */

/** 1 つの地域に出す件数。頁の主役ではないので頭出しだけ。 */
const LIMIT = 6;

/** 絞り込みの元にする、全配信元の新着の本数。 */
const POOL = 400;

const MESSAGES = {
  BAD_REQUEST: "地域の指定が正しくありません。",
} as const;

export const revalidate = 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const areaCode = searchParams.get("area");
  const prefCode = searchParams.get("pref");

  let pref: string | undefined;
  let full: string | undefined;

  if (areaCode) {
    const area = findArea(areaCode);
    if (!area) {
      return NextResponse.json(
        { error: MESSAGES.BAD_REQUEST },
        { status: 400 },
      );
    }
    pref = area.pref;
    full = area.full;
  } else if (prefCode) {
    const name = prefNameByCode(prefCode);
    if (!name) {
      return NextResponse.json(
        { error: MESSAGES.BAD_REQUEST },
        { status: 400 },
      );
    }
    /* 県の頁は市の鍵を持たない。full を県名そのものにすると
       cityNameCandidates が空を返し、県名だけで拾う形になる */
    pref = name;
    full = name;
  } else {
    return NextResponse.json({ error: MESSAGES.BAD_REQUEST }, { status: 400 });
  }

  const feeds = await fetchAllFeeds();
  const latest = poolForFilter(feeds);
  const keys = localNewsKeys(pref, full);
  const matches = filterLocalNews(latest, keys, LIMIT);

  return NextResponse.json({
    data: matches.map((m) => ({
      title: m.item.item.title,
      link: m.item.item.link,
      publishedAt: m.item.item.publishedAt,
      source: m.item.source.name,
      scope: m.scope,
      matched: m.matched,
    })),
  });
}

/**
 * 絞り込みの元になる見出しを集める。
 *
 * **`mergeLatest` は使わない。**あれは新着一覧のための関数で、1 つの
 * 発信元が枠を占めないように**束ごとの取り分（4 件）を掛ける**。地域で
 * 絞る前の母集団にそれを掛けると、UR の入札 10 本から 4 件しか残らず、
 * その市の公示が拾えなくなる。
 *
 * 取り分は「新着一覧が 1 つの発信元で埋まらない」ための決まりで、
 * 地域で絞ったあとの並びには要らない。ここでは全部を日付順に並べる。
 */
function poolForFilter(feeds: readonly FeedResult[]): MergedNewsItem[] {
  const seen = new Set<string>();
  const out: MergedNewsItem[] = [];
  for (const feed of feeds) {
    if (!feed.ok) continue;
    for (const item of feed.items) {
      if (seen.has(item.link)) continue;
      seen.add(item.link);
      out.push({ item, source: feed.source });
    }
  }
  out.sort((a, b) => {
    const ta = a.item.publishedAt ? Date.parse(a.item.publishedAt) : NaN;
    const tb = b.item.publishedAt ? Date.parse(b.item.publishedAt) : NaN;
    const va = Number.isNaN(ta);
    const vb = Number.isNaN(tb);
    if (va && vb) return 0;
    if (va) return 1;
    if (vb) return -1;
    return tb - ta;
  });
  return out.slice(0, POOL);
}
