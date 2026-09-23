/**
 * 記事の題・説明文と本文のズレを Jev（TypeSafe System One）で採点する。
 *
 * 利用者が共有した「Jev を広告運用に使う」手順（2026-09-24）のうち、
 * **広告と LP のズレのスコア化**を SEO に置き換えたもの。検索結果に出る
 * 題（title）と説明文（description）が広告、記事の本文が LP に当たる。
 * 題で約束したことに本文が答えていないと、押した人はすぐ戻る。
 *
 * 1 記事 = API 1 回。問いは 3 つで、どれも「はい」の確率（noul）で返る。
 *
 *   title_answered        題が約束していることに、本文が答えているか
 *   description_supported 説明文の主張が、すべて本文に書かれているか
 *   answer_first          題で検索した人が最初に知りたい答えが冒頭にあるか
 *
 * Jev は理由を返さないので、**何を聞いたかがそのまま答えの意味になる。**
 * 問いの文言を変えたら、前の run の数字とは比べられない。
 *
 * 本文は書き換えない。低い記事を人が読んで、題・説明文・冒頭のどれを
 * 直すかを決める（score_title_alignment の頭を読むこと）。
 */
import { stripLinks, type PostLike } from "./linkCandidates";

/** 問いの id。Jev の答えはこの名前で返る（[a-z0-9_] だけ）。 */
export const ALIGNMENT_QUESTIONS = [
  "title_answered",
  "description_supported",
  "answer_first",
] as const;
export type AlignmentQuestion = (typeof ALIGNMENT_QUESTIONS)[number];

/**
 * 冒頭の長さの上限（字）。最初の節が長い記事でも、検索から来た人が
 * 最初の画面で読む範囲を超えて「冒頭に答えがある」と数えないため。
 */
export const LEAD_MAX_CHARS = 1500;

/** 見えない記号を外す（リンクの URL と強調）。 */
function visible(text: string): string {
  return stripLinks(text).replace(/\*\*/g, "");
}

/**
 * 冒頭 = **本文の最初の `## ` 見出しの節の終わりまで**（見出しの前の
 * 前置きも含む）。全記事が「## 先に結論」で始まるので、実際には
 * 前置き＋結論の節になる。
 *
 * 最初は「段落を 3 つ」（内部リンクの採点と同じ `paragraphsOf`）で
 * 切っていたが、run #7（2026-09-24）で冒頭の列が低く出た 5 本を
 * 読むと、5 本とも答えは結論の節に書いてあった。`paragraphsOf` は
 * **表と 40 字未満の行を捨てる**（リンクを張る段落を選ぶための規則）
 * ので、答えが表の記事（九星気学以外の評価基準）や、結論が短い
 * 番号付きの箇条書きの記事（なぜ方位で吉凶が決まると考えたのか）で
 * 冒頭が空振りし、答えが 4 番目の箇条書きの記事（風水はどこから
 * 来たのか）は 3 で切れていた。**別の目的の規則を流用しないこと。**
 */
export function leadOf(body: string): string {
  const lines = body.split("\n");
  let headings = 0;
  const out: string[] = [];
  for (const line of lines) {
    if (/^## /.test(line)) {
      headings++;
      if (headings === 2) break;
    }
    out.push(line);
  }
  const text = visible(out.join("\n")).trim();
  return text.length > LEAD_MAX_CHARS
    ? `${text.slice(0, LEAD_MAX_CHARS)}…`
    : text;
}

export interface AlignmentRequest {
  model: string;
  state: string;
  questions: Record<AlignmentQuestion, { type: "noul"; instructions: string }>;
}

/**
 * state を組む。冒頭（`leadOf`）を先に切り出して見せ、そのあとに本文の
 * 全体を置く。「冒頭」を Jev の数え方に任せると答えが揺れるので、
 * こちらで決めて渡す。リンクの URL と強調の記号は外す。
 */
export function alignmentState(body: string): string {
  return `【冒頭（最初の節）】\n${leadOf(body)}\n\n【本文の全体】\n${visible(body).trim()}`;
}

export function buildAlignmentRequest(
  post: Pick<PostLike, "title" | "description" | "body">,
  model: string,
): AlignmentRequest {
  return {
    model,
    state: alignmentState(post.body),
    questions: {
      title_answered: {
        type: "noul",
        instructions:
          `state は記事の本文です。この記事の題は「${post.title}」です。` +
          `題が読者に約束していること（題の問いへの答え、題に出てくる具体的な対象）に、` +
          `本文が実際に答えていますか。題の語が本文に出てくるだけで答えが書かれていない場合、` +
          `または本文が題より狭い・別の話をしている場合は「いいえ」。`,
      },
      description_supported: {
        type: "noul",
        instructions:
          `state は記事の本文です。検索結果に出る説明文は「${post.description}」です。` +
          `説明文が述べている内容（主張・数字・扱う範囲）は、すべて本文に書かれていますか。` +
          `説明文にだけあって本文に無い主張や数字が 1 つでもあれば「いいえ」。`,
      },
      answer_first: {
        type: "noul",
        instructions:
          `state の【冒頭（最初の節）】を見てください。` +
          `題「${post.title}」で検索して来た人が最初に知りたい答えが、この冒頭に書かれていますか。` +
          `前置き・背景・一般論が続いて、答えが【本文の全体】の後半にしか出てこない場合は「いいえ」。`,
      },
    },
  };
}

export interface AlignmentScore {
  slug: string;
  title: string;
  description: string;
  scores: Record<AlignmentQuestion, number>;
  /** 3 つのうち最も低いもの。並べ替えと表の足切りに使う。 */
  min: number;
}

/** 3 つの確率から 1 行を作る。 */
export function toScore(
  post: Pick<PostLike, "slug" | "title" | "description">,
  scores: Record<AlignmentQuestion, number>,
): AlignmentScore {
  return {
    slug: post.slug,
    title: post.title,
    description: post.description,
    scores,
    min: Math.min(...ALIGNMENT_QUESTIONS.map((q) => scores[q])),
  };
}

/**
 * 鍵が無いときの偽の採点。**決定的**で、通しの確認にだけ使う。
 * 題の語が冒頭に出ていれば高い、というだけの粗い目安。
 */
export function mockAlignment(
  post: Pick<PostLike, "title" | "description" | "body">,
): Record<AlignmentQuestion, number> {
  const lead = leadOf(post.body);
  const hit = (s: string, where: string) => {
    const words = s
      .split(/[、。・\s「」（）()？?！!]+/)
      .filter((w) => w.length >= 2);
    if (words.length === 0) return 0.5;
    const n = words.filter((w) => where.includes(w)).length;
    return Number((0.2 + 0.7 * (n / words.length)).toFixed(3));
  };
  const full = stripLinks(post.body);
  return {
    title_answered: hit(post.title, full),
    description_supported: hit(post.description, full),
    answer_first: hit(post.title, lead),
  };
}
