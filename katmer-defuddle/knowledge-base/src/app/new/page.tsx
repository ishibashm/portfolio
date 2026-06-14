"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, UploadCloud } from "lucide-react";

export default function NewDocument() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) {
      setError("Please fill in all fields.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // basePath に対応するため、明示的に /kb プレフィックスを付ける
      const response = await fetch("/kb/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          content,
          user_id: "00000000-0000-0000-0000-000000000000",
        }),
      });

      if (!response.ok) {
        let errorMsg = "Failed to create document";
        try {
          const errData = await response.json();
          if (errData.error) errorMsg += `: ${errData.error}`;
        } catch {
          errorMsg += ` (Status: ${response.status})`;
        }
        throw new Error(errorMsg);
      }

      const doc = await response.json();
      router.push(`/${doc.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      // basePath に対応するため、明示的に /kb プレフィックスを付ける
      const response = await fetch("/kb/api/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to process file");
      }

      const data = await response.json();
      // data.title があれば常に上書きする（既存の値があっても更新する）
      if (data.title) setTitle(data.title);
      if (data.content) setContent(data.content);
    } catch (err: any) {
      setError(err.message || "Could not parse file");
    } finally {
      setIsUploading(false);
      // 同じファイルを連続でアップロードできるようにinputのvalueをリセット
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold">New Document</h1>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {/* Upload Zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20"
              : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(e.target.files[0]);
              }
            }}
            className="hidden"
            accept=".md,.txt,.pdf,.docx,.xlsx,.csv,.pptx"
          />
          {isUploading ? (
            <div className="flex flex-col items-center gap-3 text-zinc-500">
              <Loader2 size={32} className="animate-spin text-blue-500" />
              <p className="font-medium text-sm">Processing document...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-zinc-500">
              <UploadCloud
                size={32}
                className={isDragging ? "text-blue-500" : "text-zinc-400"}
              />
              <p className="font-medium text-sm">
                Drag &amp; drop a file here, or click to select
              </p>
              <p className="text-xs opacity-80">
                Supported: .md, .txt, .pdf, .docx, .xlsx, .csv, .pptx
              </p>
            </div>
          )}
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6 bg-white dark:bg-zinc-900 p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm"
        >
          <div className="space-y-2">
            <label htmlFor="title" className="block text-sm font-medium">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Next.js 14 Migration Notes"
              className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={isSubmitting || isUploading}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="content"
              className="block text-sm font-medium flex justify-between"
            >
              <span>Content</span>
              <span className="text-zinc-500 font-normal">
                Markdown supported
              </span>
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your notes here in Markdown..."
              className="w-full h-96 px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={isSubmitting || isUploading}
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
              The AI will automatically categorize and tag this document based
              on its content.
            </p>
          </div>

          <div className="flex justify-end pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>Save Document</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
