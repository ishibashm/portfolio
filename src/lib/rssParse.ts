/**
 * RSS / Atom の見出しだけを取り出す小さな解析器。
 *
 * ## なぜ自前か
 *
 * /news が要るのは**見出し・リンク・日付・出典**の 4 つだけ。本文は
 * 転載しない（著作権と、配信側の想定した使い方の両方の理由）。
 * その 4 つのために依存を足すより、読む枝だけを写す（#149 の方針と同じ。
 * 外部データの取り込みは、実際に読む枝だけを型にする）。
 *
 * ## 対応する形
 *
 *   RSS 2.0   <channel><item><title><link><pubDate>
 *   RSS 1.0   <rdf:RDF><item><title><link><dc:date>（官公庁に多い。
 *             国交省のプレスリリースがこの形）
 *   Atom      <feed><entry><title><link href=""><updated>
 *
 * Node のサーバ側で動かすので DOMParser は無い。正規表現で <item> /
 * <entry> の塊を切り出して中を読む。XML 全般を扱えるものではないが、
 * 見出しの列挙という用途には足りる。**取れなかったら黙って捨てる**
 * （1 件の壊れた記事でフィード全体を落とさない）。
 */

export interface NewsItem {
  title: string;
  link: string;
  /** ISO 8601。日付が読めなければ null（並べ替えで最後に回る）。 */
  publishedAt: string | null;
  /**
   * 記事の要約。description（RSS）/ summary・content（Atom）から
   * タグを剥がして先頭だけ。**引用の範囲に収める**ため上限あり。
   * 全文を写さないのは転載になるから。読むのはリンク先。
   */
  summary: string | null;
}

/** 要約の上限。引用の範囲に収める（全文を写すと転載になる）。 */
const SUMMARY_MAX = 120;

/**
 * フィードのバイト列を文字列にする。
 *
 * res.text() は常に UTF-8 として読むので、Shift_JIS / EUC-JP の配信
 * （官公庁系に残っている）が文字化けする。実際に /news で化けた。
 *
 * 文字コードは 2 か所から探す。HTTP の Content-Type の charset が先
 * （転送時の宣言のほうが新しい）、無ければ XML 宣言の encoding。
 * どちらも無ければ UTF-8。知らない名前も UTF-8 に落とす（TextDecoder が
 * 投げて 1 フィード全部を失うより、化けて見えるほうが調べられる）。
 */
export function decodeFeedBytes(
  bytes: ArrayBuffer | Uint8Array,
  contentType?: string | null,
): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let charset =
    contentType?.match(/charset=["']?([\w-]+)/i)?.[1]?.toLowerCase() ?? null;
  if (!charset) {
    /* XML 宣言は ASCII 互換の範囲にあるので、先頭を latin1 で覗いてよい */
    const head = new TextDecoder("latin1").decode(buf.subarray(0, 256));
    charset =
      head.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1]?.toLowerCase() ??
      null;
  }
  if (!charset || charset === "utf8") charset = "utf-8";
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&");
}

/**
 * CDATA を外し、実体参照を戻し、タグを剥がし、空白を畳む。
 *
 * 復号 → タグ剥がし → 復号の順。XML の中に HTML が実体参照で
 * 入っている形（&lt;b&gt;…）が実際のフィードにあり、先にタグを
 * 剥がすと &lt;b&gt; が文字として残る。1 回目の復号でタグに戻し、
 * 剥がしたあと、二重エスケープ（&amp;#12354; など）を 2 回目で戻す。
 */
function cleanText(raw: string): string {
  let s = raw.trim();
  const cdata = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) s = cdata[1];
  s = decodeEntities(s);
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s.replace(/\s+/g, " ").trim();
}

/** タグ 1 つの中身。無ければ null。名前空間の接頭辞は呼び出し側で書く。 */
function tagContent(block: string, tag: string): string | null {
  const m = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return m ? m[1] : null;
}

/** 日付文字列を ISO に。読めなければ null。 */
function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(cleanText(raw));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Atom の <link href="…">。rel="alternate" か rel 無しを優先する。 */
function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>(?:<\/link>)?/gi)];
  let fallback: string | null = null;
  for (const [, attrs] of links) {
    const href = attrs.match(/href="([^"]+)"/i)?.[1] ?? null;
    if (!href) continue;
    const rel = attrs.match(/rel="([^"]+)"/i)?.[1];
    if (!rel || rel === "alternate") return href;
    fallback = fallback ?? href;
  }
  return fallback;
}

/** 1 記事ぶんの塊から取り出す。必須（見出しとリンク）が欠けたら null。 */
function readItem(block: string, kind: "rss" | "atom"): NewsItem | null {
  const rawTitle = tagContent(block, "title");
  if (!rawTitle) return null;
  const title = cleanText(rawTitle);
  if (!title) return null;

  let link: string | null;
  let date: string | null;
  if (kind === "atom") {
    link = atomLink(block);
    date = tagContent(block, "updated") ?? tagContent(block, "published");
  } else {
    const rawLink = tagContent(block, "link");
    link = rawLink ? cleanText(rawLink) : null;
    date = tagContent(block, "pubDate") ?? tagContent(block, "dc:date");
  }
  if (!link || !/^https?:\/\//.test(link)) return null;

  const rawSummary =
    kind === "atom"
      ? (tagContent(block, "summary") ?? tagContent(block, "content"))
      : (tagContent(block, "description") ??
        tagContent(block, "content:encoded"));
  let summary: string | null = rawSummary ? cleanText(rawSummary) : null;
  if (summary) {
    /* 見出しの繰り返しだけの description は情報が無いので出さない */
    if (summary === title) summary = null;
    else if (summary.length > SUMMARY_MAX) {
      summary = `${summary.slice(0, SUMMARY_MAX)}…`;
    }
  }

  return { title, link, publishedAt: toIso(date), summary };
}

/**
 * フィード本文から記事を列挙する。新しい順。
 *
 * 形式の判定はタグの有無で行う。<entry> があれば Atom、無ければ
 * <item>（RSS 2.0 と RSS 1.0 はどちらも <item> なので同じ道で読める。
 * 日付だけ pubDate / dc:date の両対応にしてある）。
 */
export function parseFeed(xml: string, limit = 20): NewsItem[] {
  const entries = [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)];
  const blocks: { body: string; kind: "rss" | "atom" }[] = entries.length
    ? entries.map((m) => ({ body: m[1], kind: "atom" as const }))
    : [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => ({
        body: m[1],
        kind: "rss" as const,
      }));

  const items: NewsItem[] = [];
  for (const { body, kind } of blocks) {
    const item = readItem(body, kind);
    if (item) items.push(item);
  }

  items.sort((a, b) => {
    if (a.publishedAt === b.publishedAt) return 0;
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
  return items.slice(0, limit);
}
