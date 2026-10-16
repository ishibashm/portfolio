import { sitePathSchema } from "@/lib/answerBlocks";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

function siteLink(href: string): string | undefined {
  return sitePathSchema.safeParse(href).success ? href : undefined;
}

export function AgentAnswer({ text }: { text: string }) {
  return (
    <div className="space-y-3 break-words text-sm leading-8 text-slate-800 [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_h4]:text-sm [&_h5]:text-sm [&_h6]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_hr]:border-stone-200 [&_pre]:overflow-auto [&_blockquote]:border-l-2 [&_blockquote]:border-stone-200 [&_blockquote]:pl-4 [&_table]:block [&_table]:overflow-auto [&_th]:px-2 [&_td]:px-2">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => siteLink(url)}
        components={{
          img: () => null,
          a: ({ href, children }) =>
            href && siteLink(href) ? (
              <a href={href} className="underline underline-offset-2">
                {children}
              </a>
            ) : (
              <>{children}</>
            ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
