import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { ReactNode } from "react";
import { headingId } from "@/lib/blogToc";

/**
 * React の子から文字だけを集める。h2 のアンカー id の元。
 *
 * 見出しに強調（**）が入ると children は要素の配列になるので、
 * 文字列連結では拾えない。id の作り方そのものは lib/blogToc の
 * headingId に寄せてあり、目次側と必ず同じ値になる。
 */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

/**
 * 本文の読み幅。
 *
 * 以前は段落・箇条書きにだけ max-w-[70ch] が付いていて、**表・見出しの
 * 罫線・区切り線には上限が無かった**。記事のカラムは 1700px からサイド
 * バー 300px を引いた幅（およそ 1350px）なので、本文が 700px で止まる
 * 隣で表と罫線だけが倍近くまで伸び、同じ記事の中で列が 2 本あるように
 * 見えていた。
 *
 * 読み幅は 1 か所で決める。個々の要素に書くと、要素を足したときに必ず
 * 付け忘れる（実際そうなった）。器（1700px）は狭めない。CLAUDE.md 3 節の
 * とおり、行長は器ではなく中身の側で守る。
 */
const MEASURE = "max-w-[70ch]";

const components: Components = {
  h2: ({ children, ...props }) => (
    <h2
      id={headingId(textOf(children))}
      className={`mt-12 ${MEASURE} scroll-mt-6 border-b border-slate-300 pb-2 font-serif text-2xl font-bold text-slate-900`}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className={`mt-8 ${MEASURE} font-serif text-lg font-bold text-slate-900`}
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p
      className={`mt-4 ${MEASURE} text-[15px] leading-8 text-slate-700`}
      {...props}
    >
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul
      className={`mt-4 ${MEASURE} list-disc space-y-2 pl-6 text-[15px] leading-7 text-slate-700`}
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className={`mt-4 ${MEASURE} list-decimal space-y-2 pl-6 text-[15px] leading-7 text-slate-700`}
      {...props}
    >
      {children}
    </ol>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-bold text-slate-950" {...props}>
      {children}
    </strong>
  ),
  a: ({ children, href, ...props }) => {
    const external = href?.startsWith("http");
    return (
      <a
        href={href}
        className="font-semibold text-rose-600 underline decoration-rose-300 underline-offset-4 hover:text-rose-700"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...props}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children, ...props }) => (
    <blockquote
      className={`mt-6 ${MEASURE} rounded-r-2xl border-l-4 border-rose-400 bg-rose-50 px-5 py-1 text-slate-700`}
      {...props}
    >
      {children}
    </blockquote>
  ),
  // 読み幅に収まらない表は、器を広げずに中で横スクロールさせる。
  // 表のためだけに読み幅を広げると、本文の行長がその表に引きずられる。
  table: ({ children, ...props }) => (
    <div
      className={`mt-6 ${MEASURE} overflow-x-auto rounded-2xl border border-slate-300 bg-white/90`}
    >
      <table className="min-w-full border-collapse text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-stone-100/80" {...props}>
      {children}
    </thead>
  ),
  tr: ({ children, ...props }) => (
    <tr className="border-b border-slate-200 last:border-0" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th
      className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold text-slate-700"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-3 align-top leading-6 text-slate-700" {...props}>
      {children}
    </td>
  ),
  code: ({ children, ...props }) => (
    <code
      className="rounded bg-stone-200/70 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800"
      {...props}
    >
      {children}
    </code>
  ),
  hr: ({ ...props }) => (
    <hr className={`my-10 ${MEASURE} border-slate-300`} {...props} />
  ),
};

export function BlogArticleBody({ body }: { body: string }) {
  return (
    <div>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
