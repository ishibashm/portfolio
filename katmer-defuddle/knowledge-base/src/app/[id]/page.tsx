import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  ArrowLeft,
  Save,
  Clock,
  Hash,
  Tag,
  Folders,
  Info,
  Edit3,
  X,
} from "lucide-react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";
import DeleteButton from "./DeleteButton";
import DownloadButton from "./DownloadButton";
import GoogleDriveExportButton from "./GoogleDriveExportButton";
import CategorizeButton from "./CategorizeButton";
import { updateDocumentContent } from "./actions";
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";

export default async function DocumentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = {
    user: { id: "local-user", name: "Local Admin", email: "admin@local" },
  }; // const session = await getServerSession(authOptions);

  if (false) {
    // if (!session || !session.user) {
    return (
      <div className="w-full h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Unauthorized
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Please sign in to view this document.
          </p>
        </div>
      </div>
    );
  }

  const { id } = await params;
  const search = await searchParams;
  const isEditMode = search.view === "edit";

  const doc = await prisma.knowledgeDocument.findUnique({
    where: {
      id,
      // user_id: session.user.id
    },
  });

  if (!doc) {
    notFound();
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "published":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "review":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      default:
        return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return "text-red-600 dark:text-red-400 font-semibold";
      case "low":
        return "text-blue-600 dark:text-blue-400";
      default:
        return "text-orange-600 dark:text-orange-400";
    }
  };

  const containerWidthClass = "max-w-[1600px]";
  const updateAction = updateDocumentContent.bind(null, id);

  return (
    <div className="w-full h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-auto">
      {/* Form Action Bar */}
      <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 flex justify-between items-center z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors text-zinc-500"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                KB{String(doc.kb_id).padStart(7, "0")}
              </span>
              <span className="text-zinc-400 dark:text-zinc-600">|</span>
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {doc.title}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isEditMode && <CategorizeButton id={doc.id} />}
          <GoogleDriveExportButton title={doc.title} content={doc.content} />
          <DownloadButton title={doc.title} content={doc.content} />

          {isEditMode ? (
            <Link
              href={`/${id}`}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-sm font-medium rounded border border-zinc-200 dark:border-zinc-700 transition-colors"
            >
              <X size={16} /> Cancel
            </Link>
          ) : (
            <Link
              href={`/${id}?view=edit`}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 text-sm font-medium rounded border border-blue-200 dark:border-blue-800/50 transition-colors"
            >
              <Edit3 size={16} /> Edit
            </Link>
          )}

          <DeleteButton id={doc.id} />
        </div>
      </div>

      <div
        className={`p-6 md:px-12 w-full mx-auto space-y-6 transition-all duration-300 ${containerWidthClass}`}
      >
        {!isEditMode && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm">
            <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20 rounded-t-lg">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Record Information
              </h3>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 text-sm">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-1/3 text-zinc-500 font-medium flex items-center justify-end gap-1.5 text-right">
                    <Hash size={14} /> Number
                  </div>
                  <div className="w-2/3 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                    KB{String(doc.kb_id).padStart(7, "0")}
                  </div>
                </div>
                <div className="flex gap-4 items-center">
                  <div className="w-1/3 text-zinc-500 font-medium flex items-center justify-end gap-1.5 text-right">
                    <Info size={14} /> State
                  </div>
                  <div className="w-2/3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(doc.status)} border-current/20`}
                    >
                      {doc.status || "Draft"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-1/3 text-zinc-500 font-medium flex items-center justify-end gap-1.5 text-right">
                    <Folders size={14} /> Category
                  </div>
                  <div className="w-2/3 text-zinc-900 dark:text-zinc-100">
                    {doc.category || "General"}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-1/3 text-zinc-500 font-medium flex items-center justify-end gap-1.5 text-right">
                    Priority
                  </div>
                  <div className={`w-2/3 ${getPriorityColor(doc.priority)}`}>
                    {doc.priority || "Medium"}
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-1/3 text-zinc-500 font-medium flex items-center justify-end gap-1.5 text-right">
                    Type
                  </div>
                  <div className="w-2/3 text-zinc-900 dark:text-zinc-100">
                    {doc.type || "Note"}
                  </div>
                </div>
                <div className="flex gap-4 items-center">
                  <div className="w-1/3 text-zinc-500 font-medium flex items-center justify-end gap-1.5 text-right">
                    <Clock size={14} /> Created
                  </div>
                  <div className="w-2/3 text-zinc-600 dark:text-zinc-400">
                    {format(new Date(doc.created_at), "yyyy-MM-dd HH:mm:ss")}
                  </div>
                </div>
              </div>
            </div>

            {doc.tags && doc.tags.length > 0 && (
              <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 flex gap-4">
                <div className="w-[calc(16.666%-1rem)] md:w-[calc(16.666%-1.5rem)] text-zinc-500 font-medium flex items-start justify-end gap-1.5 text-right text-sm pt-1">
                  <Tag size={14} /> Tags
                </div>
                <div className="w-5/6 flex flex-wrap gap-2">
                  {doc.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 text-xs rounded border border-zinc-200 dark:border-zinc-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isEditMode ? (
          <form
            action={updateAction}
            className="flex flex-col h-full space-y-4"
          >
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)]">
              <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20 flex justify-between items-center">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <Edit3 size={16} /> Edit Markdown
                </h3>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors shadow-sm"
                >
                  <Save size={16} /> Save Changes
                </button>
              </div>
              <textarea
                name="content"
                defaultValue={doc.content}
                className="w-full h-full p-6 bg-transparent border-none focus:ring-0 resize-none font-mono text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 outline-none"
                placeholder="Write your markdown here..."
              />
            </div>
          </form>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 md:p-12 overflow-x-auto">
              <div
                className="prose prose-zinc dark:prose-invert max-w-none prose-lg 
                prose-headings:font-semibold prose-headings:tracking-tight prose-headings:mt-8 prose-headings:mb-4
                prose-p:leading-[1.8] prose-p:my-6 prose-p:tracking-[0.02em]
                prose-li:leading-[1.7] prose-li:my-2
                prose-a:text-blue-500 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                prose-img:rounded-xl prose-img:shadow-md
                prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-zinc-800 prose-pre:rounded-lg
                prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:bg-zinc-100 dark:prose-code:bg-zinc-800/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-normal
                font-sans text-zinc-800 dark:text-zinc-200"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                  rehypePlugins={[rehypeHighlight, rehypeKatex]}
                  components={{
                    img({ node, src, alt, ...props }) {
                      if (
                        typeof src === "string" &&
                        src.match(/\.(mp4|webm|ogg)$/i)
                      ) {
                        return (
                          <video
                            controls
                            className="w-full rounded-lg my-6 shadow-sm bg-black"
                            src={src}
                            title={alt}
                          >
                            Your browser does not support the video tag.
                          </video>
                        );
                      }
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="rounded-lg shadow-md my-6 max-h-[600px] object-contain mx-auto border border-zinc-200 dark:border-zinc-800"
                          src={src as string}
                          alt={alt}
                          loading="lazy"
                        />
                      );
                    },
                    a({ node, href, children, ...props }) {
                      if (
                        typeof href === "string" &&
                        href.match(/\.(mp4|webm|ogg)$/i)
                      ) {
                        return (
                          <video
                            controls
                            className="w-full rounded-lg my-6 shadow-sm bg-black"
                            src={href}
                          >
                            Your browser does not support the video tag.
                          </video>
                        );
                      }
                      return (
                        <a
                          href={href as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        >
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {doc.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
