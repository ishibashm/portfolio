import type { FeedResult, MergedNewsItem } from "@/lib/fetchNews";
import {
  feedGroupOf,
  type FeedGroup,
  type FeedSource,
} from "@/data/newsSources";

/**
 * /news の札を「発信元」単位に組み直す。
 *
 * ## なぜ要るか
 *
 * 台帳はフィード 1 本 = 1 行だが、**発信元とフィードは 1 対 1 では
 * ない**。UR 都市機構は配信が 12 本に分かれている（報道発表・賃貸の
 * 募集/抽選・入札の公示が本部ごと。`probe-news-feeds` の実測）。
 * そのまま並べると 12 枚の札が出て、他の 8 媒体が読めなくなる。
 *
 * ここは**並べ替えるだけ**で、取得もネットワークも持たない。純粋
 * 関数なので、そのまま検査できる。
 *
 * ## 2 段にまとめる
 *
 * 1. **束**（`FeedSource.group`）… 画面の札 1 枚。UR なら 1 枚
 * 2. **区分**（`FeedSource.section`）… 札の中の見出し。UR なら
 *    「報道発表」「賃貸の募集・抽選」「入札・発注」の 3 つ
 *
 * 区分を挟むのは、10 本ある入札の配信を本部ごとに 10 個の見出しで
 * 並べても読めないため。**同じ区分のフィードは 1 本に混ぜて日付順**
 * にし、どの本部から来たかは行の末尾に添える（出典を消さない）。
 *
 * ## 落ちた配信元はここで数えない
 *
 * 取得できなかったフィードは呼ぶ側が別に出す（画面下の「取得できて
 * いない配信元」）。ここは ok のものだけを組む。
 */

/** 札の中の 1 区分。 */
export interface GroupedSection {
  /** 見出し。`FeedSource.section` そのまま。 */
  name: string;
  /** 混ぜて日付順にした見出し。出典は item ごとに持つ。 */
  items: MergedNewsItem[];
  /** この区分に入っているフィードの本数。 */
  feedCount: number;
}

/** 束としてまとめた札 1 枚。 */
export interface GroupedFeed {
  group: FeedGroup;
  sections: GroupedSection[];
  /** 束に入っているフィードの本数。札の脇に出す。 */
  feedCount: number;
}

/** 画面に出す並び。束の札と、束を持たない配信元の札。 */
export interface NewsLayout {
  /** まとめた札。台帳で最初に出てきた束の順。 */
  groups: GroupedFeed[];
  /** 束を持たない配信元。今までどおり 1 フィード 1 枚。 */
  singles: FeedResult[];
}

/** 区分を書いていないフィードの行き先。 */
const DEFAULT_SECTION = "新着";

/** 見出しを新しい順に。日付の読めないものは最後（台帳の順のまま）。 */
function byDate(a: MergedNewsItem, b: MergedNewsItem): number {
  const ta = a.item.publishedAt ? Date.parse(a.item.publishedAt) : NaN;
  const tb = b.item.publishedAt ? Date.parse(b.item.publishedAt) : NaN;
  const va = Number.isNaN(ta);
  const vb = Number.isNaN(tb);
  if (va && vb) return 0;
  if (va) return 1;
  if (vb) return -1;
  return tb - ta;
}

/**
 * 取得できた結果を束ごとに組み直す。
 *
 * @param feeds 取得の結果（落ちたものが混じっていてよい。ここで外す）
 * @param perSection 1 区分に出す見出しの上限。札が縦に伸びすぎないように
 */
export function groupFeeds(
  feeds: readonly FeedResult[],
  perSection: number,
): NewsLayout {
  const groups: GroupedFeed[] = [];
  const byId = new Map<string, GroupedFeed>();
  const singles: FeedResult[] = [];
  /* 区分は「束 → 区分名」で引く。台帳に出てきた順を保つ */
  const sections = new Map<string, GroupedSection>();

  for (const feed of feeds) {
    if (!feed.ok) continue;
    const source: FeedSource = feed.source;
    const group = feedGroupOf(source.group);
    if (!group) {
      singles.push(feed);
      continue;
    }

    let card = byId.get(group.id);
    if (!card) {
      card = { group, sections: [], feedCount: 0 };
      byId.set(group.id, card);
      groups.push(card);
    }
    card.feedCount++;

    const sectionName = source.section ?? DEFAULT_SECTION;
    const key = `${group.id} ${sectionName}`;
    let section = sections.get(key);
    if (!section) {
      section = { name: sectionName, items: [], feedCount: 0 };
      sections.set(key, section);
      card.sections.push(section);
    }
    section.feedCount++;
    for (const item of feed.items) {
      section.items.push({ item, source });
    }
  }

  /*
    区分の中で日付順にしてから上限で切る。**並べる前に切らない**。
    本部ごとに 20 件ずつ来るので、先に切ると先頭の本部の古い見出しが
    残り、他の本部の新しい見出しが落ちる。
  */
  for (const card of groups) {
    for (const section of card.sections) {
      section.items.sort(byDate);
      section.items = section.items.slice(0, perSection);
    }
  }

  return { groups, singles };
}
