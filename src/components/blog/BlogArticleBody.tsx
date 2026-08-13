import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h2: ({ children, ...props }) => (
    <h2
      className="mt-12 scroll-mt-6 border-b border-slate-300 pb-2 font-serif text-2xl font-bold text-slate-900"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mt-8 font-serif text-lg font-bold text-slate-900" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="mt-4 max-w-[70ch] text-[15px] leading-8 text-slate-700" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="mt-4 max-w-[70ch] list-disc space-y-2 pl-6 text-[15px] leading-7 text-slate-700" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="mt-4 max-w-[70ch] list-decimal space-y-2 pl-6 text-[15px] leading-7 text-slate-700" {...props}>
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
      className="mt-6 rounded-r-2xl border-l-4 border-rose-400 bg-rose-50 px-5 py-1 text-slate-700"
      {...props}
    >
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-300 bg-white/90">
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
  hr: ({ ...props }) => <hr className="my-10 border-slate-300" {...props} />,
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
