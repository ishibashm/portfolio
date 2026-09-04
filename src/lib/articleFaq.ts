/**
 * 記事の中の「問いの形の見出し」と、その直後の段落を組にして取り出す。
 * `/blog/[slug]` の FAQPage 構造化データの材料になる。
 *
 * ## 作らない。拾うだけ
 *
 * FAQPage は**頁に実際に出ている文言**でなければならない。検索エンジン
 * 向けに問答をこしらえて構造化データにだけ入れるのは、Google の
 * 構造化データの規定に反する。ここは本文をそのまま読み、見出しを問い、
 * 直後の段落を答えとして組にする。**書き足しはしない。**
 *
 * ## 問いの見出しだけを拾う
 *
 * 記事の見出しには「先に結論」「注記」のように問いでないものが多い。
 * 日本語の疑問文は「？」で終わらないことが普通なので、末尾で判定する。
 *
 *   ・「？」「?」で終わる
 *   ・「か」で終わる（〜のか／〜ですか／〜だろうか）
 *
 * 「〜しか」「〜ほか」のような偶然の一致を避けるため、直前の 1 文字が
 * 助詞になりやすい字のときは落とす。**取りこぼすほうに倒す。**
 * 間違った問答を出すより、出さないほうがよい。
 *
 * ## 番号は問いに含めない
 *
 * 見出しに「5. 盤はなぜ逆に回るのか」のような通し番号が付くことがある。
 * 番号は頁の中での順序であって問いの一部ではないので落とす。
 *
 * ## 出すのは 2 組以上そろったときだけ
 *
 * 1 組だけの FAQPage は情報として薄く、体裁を作っただけになる。
 */

/** 問答の 1 組。 */
export interface ArticleFaq {
  question: string;
  answer: string;
}

/** これ未満なら FAQPage を出さない。 */
export const MIN_FAQ_PAIRS = 2;
/**
 * 答えの長さの下限。1 文に満たない答えは組にしない。
 *
 * 40 にしたら日本語の 2 文（37〜38 字）が軒並み落ちた。日本語は 1 文が
 * 短いので、英語の感覚で切ると**まともな答えまで捨てる**。30 なら
 * 「はい。」のような相槌は落ちて、1 文の答えは残る。
 */
const MIN_ANSWER = 30;
/** 答えの長さの上限。長すぎるものは頭だけ取る。 */
const MAX_ANSWER = 300;

/**
 * 「か」で終わっていても問いでないことがある語尾。
 * 「〜しか」「〜ほか」「〜ばかり」など、直前がこの字なら落とす。
 */
const NOT_QUESTION_BEFORE_KA = new Set(["し", "ほ", "つ", "ば", "ぬ"]);

function isQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[?？]$/.test(t)) return true;
  if (!t.endsWith("か")) return false;
  const before = t.slice(-2, -1);
  return !NOT_QUESTION_BEFORE_KA.has(before);
}

/** 見出しの通し番号と装飾を落とす。 */
function cleanHeading(text: string): string {
  return text
    .replace(/^\d+[.．)）]\s*/, "")
    .replace(/[*`]/g, "")
    .trim();
}

/**
 * 段落から markdown の記号を落として 1 行にする。
 * リンクは表示文字だけ残す（構造化データに [text](url) を入れない）。
 */
function plainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 記事の本文から問答を取り出す。
 *
 * 見出しの直後にある**最初の段落**だけを答えにする。表や箇条書きが先に
 * 来る見出しは飛ばす。答えになる 1 文が無いということなので。
 */
export function extractFaq(body: string): ArticleFaq[] {
  const lines = body.split("\n");
  const out: ArticleFaq[] = [];
  let inFence = false;
  let pending: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (pending && buffer.length > 0) {
      const answer = plainText(buffer.join(" "));
      if (answer.length >= MIN_ANSWER) {
        out.push({
          question: pending,
          answer:
            answer.length > MAX_ANSWER
              ? `${answer.slice(0, MAX_ANSWER)}…`
              : answer,
        });
      }
    }
    pending = null;
    buffer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (/^```/.test(line)) {
      inFence = !inFence;
      /*
        コードに入ったら、拾いかけの答えはそこで打ち切る。**pending も
        落とす。**残したままだと、コードの「後ろ」の段落が前の見出しの
        答えとして拾われる（検査で見つけた）。答えになるのは見出しの
        直後の段落だけで、コードを挟んだ先ではない。
      */
      flush();
      continue;
    }
    if (inFence) continue;

    const heading = line.match(/^(#{2,6})\s+(.+)$/);
    if (heading) {
      flush();
      const text = cleanHeading(heading[2]);
      pending = isQuestion(text) ? text : null;
      continue;
    }

    if (!pending) continue;

    if (line === "") {
      /* 段落の切れ目。1 段落ぶんそろっていれば確定する */
      if (buffer.length > 0) flush();
      continue;
    }

    /*
      表・箇条書き・引用は答えにしない。1 文の答えが無いということ。

      箇条書きの記号は**後ろに空白があるものだけ**。`^[-*+]` だけで
      見ると `**魔方陣**は…` のような強調で始まる段落を箇条書きと
      取り違えて、まともな答えを捨てる（検査で見つけた）。
    */
    if (/^([-*+]\s|\d+[.)]\s|[|>])/.test(line)) {
      pending = null;
      buffer = [];
      continue;
    }

    buffer.push(line);
  }
  flush();

  return out;
}

/** FAQPage を出してよいか。組が足りなければ出さない。 */
export function hasEnoughFaq(faq: readonly ArticleFaq[]): boolean {
  return faq.length >= MIN_FAQ_PAIRS;
}
