/**
 * 記事どうしの内部リンク候補を組み立て、Jev（TypeSafe の System One）の
 * 答えを読む純粋関数。CLI は score_link_candidates.ts、見張りは
 * __tests__/linkCandidates.test.ts。
 *
 * ここには I/O を置かない（ファイルも fetch も無し）。テストから
 * そのまま呼べるようにするため。
 */

export interface PostLike {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  body: string;
}

export interface Paragraph {
  /** 本文中の段落の通し番号（0 始まり。見出し・表・コードは数えない） */
  index: number;
  /** リンク記法を外した素の文 */
  text: string;
}

export interface Candidate {
  source: string;
  paragraph: Paragraph;
  dest: string;
}

export interface Scored extends Candidate {
  probability: number;
  confidence: number | null;
}

/** 採点の材料にする段落の最短の長さ。短い導入文は「次に読む先」を持たない。 */
export const MIN_PARAGRAPH_CHARS = 40;

/**
 * 記事のタグのうち、半分を超える記事に付いているものは近さの根拠に
 * しない（lib/blogRelated と同じ規則。「九星気学」がほぼ全記事に付く）。
 */
export const COMMON_TAG_RATIO = 0.5;

/** `[文言](/blog/slug)` を文言だけにする。外部リンクも同じ。 */
export function stripLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

/**
 * 本文を段落に割る。見出し・表・コード・frontmatter は除く。
 * 箇条書きは 1 項目を 1 段落と数える（リンクは箇条書きにも張るため）。
 */
export function paragraphsOf(body: string): Paragraph[] {
  const out: Paragraph[] = [];
  let inCode = false;
  let buf: string[] = [];
  let index = 0;
  const flush = () => {
    if (buf.length === 0) return;
    const text = stripLinks(buf.join(" ")).replace(/\*\*/g, "").trim();
    buf = [];
    if (text.length < MIN_PARAGRAPH_CHARS) return;
    out.push({ index: index++, text });
  };
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("```")) {
      flush();
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (
      line.startsWith("#") ||
      line.startsWith("|") ||
      line.startsWith("---")
    ) {
      flush();
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      // 箇条書きは項目ごとに区切る
      flush();
      buf.push(line.replace(/^\s*([-*]|\d+\.)\s+/, ""));
      flush();
      continue;
    }
    buf.push(line.trim());
  }
  flush();
  return out;
}

/** その記事の本文が既にリンクしている宛先 slug。 */
export function linkedSlugs(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(/\]\(\/blog\/([^)\s#?]+)/g)) {
    out.add(m[1].replace(/\/$/, ""));
  }
  return out;
}

function commonTags(posts: PostLike[]): Set<string> {
  const count = new Map<string, number>();
  for (const p of posts) {
    for (const t of new Set(p.tags)) count.set(t, (count.get(t) ?? 0) + 1);
  }
  const limit = posts.length * COMMON_TAG_RATIO;
  return new Set([...count].filter(([, n]) => n > limit).map(([t]) => t));
}

/** タグかカテゴリを共有する宛先だけに絞る（費用を抑える）。 */
export function related(
  source: PostLike,
  dest: PostLike,
  ignored: Set<string>,
): boolean {
  if (source.category === dest.category) return true;
  const tags = new Set(source.tags.filter((t) => !ignored.has(t)));
  return dest.tags.some((t) => tags.has(t));
}

/**
 * 採点に掛ける（段落, 宛先）の組。
 *
 * - 自分自身は除く
 * - その記事が既に本文から張っている宛先は除く（重ねて張らない）
 * - 既定ではタグかカテゴリを共有する宛先だけ。allPairs で全組み合わせ
 */
export function candidatePairs(
  posts: PostLike[],
  options: {
    allPairs?: boolean;
    sources?: Set<string>;
    dests?: Set<string>;
  } = {},
): Candidate[] {
  const ignored = commonTags(posts);
  const out: Candidate[] = [];
  for (const source of posts) {
    if (options.sources && !options.sources.has(source.slug)) continue;
    const already = linkedSlugs(source.body);
    const dests = posts.filter(
      (d) =>
        d.slug !== source.slug &&
        !already.has(d.slug) &&
        (!options.dests || options.dests.has(d.slug)) &&
        (options.allPairs || related(source, d, ignored)),
    );
    if (dests.length === 0) continue;
    for (const paragraph of paragraphsOf(source.body)) {
      for (const d of dests)
        out.push({ source: source.slug, paragraph, dest: d.slug });
    }
  }
  return out;
}

/** 1 つの段落に対する、宛先ごとの問い（Noul）。 */
export interface SystemOneRequest {
  model: string;
  state: string;
  questions: Record<string, { type: "noul"; instructions: string }>;
}

export const DEFAULT_MODEL = "jev-latest";

/**
 * 段落を state、宛先を問いにする。問いの id は宛先の slug（[a-z0-9-] だけ）。
 *
 * 問いは「読者が次に進めるか」だけを聞く。Jev は理由を返さないので、
 * 何を聞いたかがそのまま答えの意味になる。判断の基準は共有した
 * 内部リンクの手順の「読者がクリックする理由」に合わせてある。
 */
export function buildRequest(
  source: PostLike,
  paragraph: Paragraph,
  dests: PostLike[],
  model = DEFAULT_MODEL,
): SystemOneRequest {
  const questions: SystemOneRequest["questions"] = {};
  for (const d of dests) {
    questions[d.slug] = {
      type: "noul",
      instructions:
        `state は記事「${source.title}」の 1 段落です。` +
        `この段落の中から記事「${d.title}」（${d.description}）へリンクを張ると、` +
        `読者はいま読んでいることの続きとして、その記事で次に知りたいことへ進めますか。` +
        `段落の話題と宛先の主題が実際に繋がっている場合だけ「はい」。` +
        `同じ語が出てくるだけの場合は「いいえ」。`,
    };
  }
  return { model, state: paragraph.text, questions };
}

/**
 * 答えを読む。**応答の項目名は公式の仕様書をこの環境から読めていない**
 * （出口の proxy が弾く）。検索で分かっている範囲では answers[id] に
 * 確率と confidence が入る。項目名の揺れを 1 か所で吸収し、読めなければ
 * null を返して呼ぶ側で止める（黙って 0 にしない）。
 */
export function parseAnswer(
  response: unknown,
  id: string,
): { probability: number; confidence: number | null } | null {
  if (typeof response !== "object" || response === null) return null;
  const root = response as Record<string, unknown>;
  const table = (root.answers ?? root.results ?? root.decisions ?? root) as
    | Record<string, unknown>
    | undefined;
  const raw = table?.[id];
  if (typeof raw === "number") return { probability: raw, confidence: null };
  if (typeof raw !== "object" || raw === null) return null;
  const a = raw as Record<string, unknown>;
  const prob = [a.probability, a.p, a.yes, a.value, a.answer].find(
    (v) => typeof v === "number",
  );
  if (typeof prob !== "number") return null;
  const conf = typeof a.confidence === "number" ? a.confidence : null;
  return { probability: prob, confidence: conf };
}

/**
 * 鍵が無いときの偽の採点。**決定的**で、通しの確認にだけ使う。
 * 宛先の題の語が段落に出ていれば高く、共有タグが多ければ少し高く。
 */
export function mockScore(
  paragraph: Paragraph,
  source: PostLike,
  dest: PostLike,
): number {
  const words = dest.title
    .split(/[、。・\s「」（）()]+/)
    .filter((w) => w.length >= 2);
  const hits = words.filter((w) => paragraph.text.includes(w)).length;
  const shared = dest.tags.filter((t) => source.tags.includes(t)).length;
  const score = 0.15 + 0.6 * (hits / Math.max(1, words.length)) + 0.05 * shared;
  return Math.min(0.99, Number(score.toFixed(3)));
}

/** 日本語は 1 文字 ≒ 1〜2 トークン。安全側に 1 文字 1.5 トークンで見る。 */
export function estimateTokens(req: SystemOneRequest): number {
  const chars =
    req.state.length +
    Object.values(req.questions).reduce((n, q) => n + q.instructions.length, 0);
  return Math.ceil(chars * 1.5);
}
