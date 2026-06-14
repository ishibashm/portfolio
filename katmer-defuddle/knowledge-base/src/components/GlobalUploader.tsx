"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  UploadCloud,
  X,
  Loader2,
  FileText,
  CheckCircle2,
  AlertCircle,
  HardDrive,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

export function GlobalUploader() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState("");
  const [results, setResults] = useState<
    {
      name: string;
      status: "loading" | "success" | "error";
      message?: string;
    }[]
  >([]);
  const [importHistory, setImportHistory] = useState<
    { name: string; date: string; type: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset drag state when navigating to /new page to ensure overlay is closed
  useEffect(() => {
    if (pathname?.endsWith("/new")) {
      setIsDragging(false);
    }
  }, [pathname]);

  useEffect(() => {
    try {
      const history = localStorage.getItem("katmer_import_history");
      if (history) {
        setImportHistory(JSON.parse(history));
      }
    } catch (e) {}
  }, []);

  const saveToHistory = (name: string, type: "Local" | "Drive") => {
    setImportHistory((prev) => {
      const newHistory = [
        { name, date: new Date().toISOString(), type },
        ...prev,
      ].slice(0, 50); // 直近50件
      localStorage.setItem("katmer_import_history", JSON.stringify(newHistory));
      return newHistory;
    });
  };

  // Expose a global event listener to open the uploader modal
  useEffect(() => {
    const handleOpenUploader = () => setIsOpen(true);
    window.addEventListener("open-global-uploader", handleOpenUploader);
    return () =>
      window.removeEventListener("open-global-uploader", handleOpenUploader);
  }, []);

  // Global drag and drop window overlay
  const handleDragOver = useCallback(
    (e: DragEvent) => {
      if (pathname?.endsWith("/new")) return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (!isOpen) {
        if (e.dataTransfer?.types.includes("Files")) {
          setIsDragging(true);
        }
      }
    },
    [isOpen, pathname],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      if (pathname?.endsWith("/new")) return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (e.clientX === 0 || e.clientY === 0) {
        setIsDragging(false);
      }
    },
    [pathname],
  );

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      if (pathname?.endsWith("/new")) return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      setIsDragging(false);

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        setIsOpen(true);
        await processFiles(Array.from(e.dataTransfer.files));
      }
    },
    [pathname],
  );

  useEffect(() => {
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [handleDragOver, handleDragLeave, handleDrop]);

  const processFiles = async (
    rawFiles: File[],
    source: "Local" | "Drive" = "Local",
  ) => {
    // Markdown (.md) のみ許可する
    const files = rawFiles.filter((f) => f.name.toLowerCase().endsWith(".md"));

    if (files.length === 0) {
      if (rawFiles.length > 0) {
        setResults([
          {
            name: "Unsupported Files",
            status: "error",
            message: "Only Markdown (.md) files are supported.",
          },
        ]);
        setIsOpen(true);
      }
      return;
    }

    setIsProcessing(true);
    const initialResults: {
      name: string;
      status: "loading" | "error" | "success";
      message?: string;
    }[] = files.map((f) => ({ name: f.name, status: "loading" }));

    // 除外されたファイルがある場合はエラーとして表示に追加する
    const rejectedFiles = rawFiles.filter((f) => !files.includes(f));
    if (rejectedFiles.length > 0) {
      initialResults.push(
        ...rejectedFiles.map((f) => ({
          name: f.name,
          status: "error" as const,
          message: "Only Markdown (.md) files are supported.",
        })),
      );
    }

    setResults((prev) => [...prev, ...initialResults]);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    try {
      const res = await fetch("/kb/api/documents/bulk-import", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        // Update results
        setResults((prev) => {
          const newResults = [...prev];
          data.results.forEach((r: any) => {
            const idx = newResults.findIndex(
              (x) => x.name === r.title && x.status === "loading",
            );
            if (idx !== -1) {
              newResults[idx] = {
                name: r.title,
                status: r.status === "success" ? "success" : "error",
                message: r.error || `Categorized as: ${r.category}`,
              };
              if (r.status === "success") {
                saveToHistory(r.title, source);
              }
            }
          });
          return newResults;
        });
        alert(
          `インポートが完了しました！ (${data.results.filter((r: any) => r.status === "success").length}件)`,
        );
        router.refresh(); // Refresh current page to show new documents
      } else {
        throw new Error("Upload failed");
      }
    } catch (err: any) {
      setResults((prev) =>
        prev.map((r) =>
          r.status === "loading"
            ? { ...r, status: "error", message: err.message }
            : r,
        ),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDriveImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveFolderId) return;

    setIsProcessing(true);
    setResults((prev) => [
      ...prev,
      {
        name: "Google Drive Import...",
        status: "loading",
        message: "Fetching from Drive",
      },
    ]);

    try {
      // 1. Fetch from Drive
      const fetchRes = await fetch("/kb/api/drive-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: driveFolderId }),
      });

      if (!fetchRes.ok) {
        let errMsg = "Drive fetch failed";
        try {
          const errData = await fetchRes.json();
          if (errData.error) errMsg += `: ${errData.error}`;
        } catch {
          errMsg += ` (Status: ${fetchRes.status})`;
        }
        throw new Error(errMsg);
      }
      const data = await fetchRes.json();

      if (!data.results || data.results.length === 0) {
        setResults((prev) =>
          prev.map((r) =>
            r.name === "Google Drive Import..."
              ? { ...r, status: "error", message: "No suitable files found" }
              : r,
          ),
        );
        setIsProcessing(false);
        return;
      }

      setResults((prev) =>
        prev.filter((r) => r.name !== "Google Drive Import..."),
      );

      // Convert to files and use processFiles
      const filesToProcess: File[] = [];
      data.results.forEach((r: any) => {
        if (r.content) {
          const blob = new Blob([r.content], { type: "text/markdown" });
          // Reconstruct file name with .md extension
          let newName = r.name;
          if (!newName.endsWith(".md")) newName += ".md";
          filesToProcess.push(
            new File([blob], newName, { type: "text/markdown" }),
          );
        }
      });

      if (filesToProcess.length > 0) {
        await processFiles(filesToProcess, "Drive");
      }
    } catch (err: any) {
      setResults((prev) =>
        prev.map((r) =>
          r.name === "Google Drive Import..."
            ? { ...r, status: "error", message: err.message }
            : r,
        ),
      );
    } finally {
      setIsProcessing(false);
      setDriveFolderId("");
    }
  };

  return (
    <>
      {/* Global Drag Overlay */}
      {isDragging && !isOpen && (
        <div className="fixed inset-0 z-[100] bg-blue-500/20 backdrop-blur-sm border-8 border-blue-500 flex flex-col items-center justify-center transition-all">
          <UploadCloud className="text-blue-600 w-24 h-24 mb-4 animate-bounce" />
          <h2 className="text-3xl font-bold text-blue-700 dark:text-blue-400 drop-shadow-md">
            Drop Markdown files to Import
          </h2>
          <p className="text-blue-600 dark:text-blue-300 font-medium mt-2 drop-shadow-md">
            Only .md files are supported
          </p>
        </div>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xl font-bold">Import Documents</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-8">
              {/* File Drop Zone */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Upload Local Files
                </h3>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-500 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl p-8 text-center cursor-pointer transition-colors"
                >
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files)
                        processFiles(Array.from(e.target.files));
                    }}
                    accept=".md"
                  />
                  <UploadCloud className="mx-auto h-12 w-12 text-zinc-400 mb-3" />
                  <p className="font-medium">Click or drag & drop files here</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Accepts Markdown (.md) only
                  </p>
                </div>
              </div>

              {/* Google Drive Import */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <HardDrive size={16} /> Google Drive Import
                </h3>
                <form onSubmit={handleDriveImport} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Paste Google Drive Folder ID here..."
                    value={driveFolderId}
                    onChange={(e) => setDriveFolderId(e.target.value)}
                    className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    disabled={isProcessing}
                  />
                  <button
                    type="submit"
                    disabled={!driveFolderId || isProcessing}
                    className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    Import
                  </button>
                </form>
              </div>

              {/* Results Area */}
              {results.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                    <span>Processing Status</span>
                    {isProcessing && (
                      <Loader2
                        size={16}
                        className="animate-spin text-blue-500"
                      />
                    )}
                  </h3>
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-700">
                    {results.map((r, i) => (
                      <div
                        key={i}
                        className="px-4 py-3 flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          {r.status === "loading" && (
                            <Loader2
                              size={16}
                              className="animate-spin text-blue-500 shrink-0"
                            />
                          )}
                          {r.status === "success" && (
                            <CheckCircle2
                              size={16}
                              className="text-green-500 shrink-0"
                            />
                          )}
                          {r.status === "error" && (
                            <AlertCircle
                              size={16}
                              className="text-red-500 shrink-0"
                            />
                          )}
                          <div className="truncate">
                            <p className="font-medium truncate">{r.name}</p>
                            {r.message && (
                              <p
                                className={`text-xs ${r.status === "error" ? "text-red-500" : "text-zinc-500"} truncate`}
                              >
                                {r.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Import History */}
              {importHistory.length > 0 &&
                !isProcessing &&
                results.length === 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                      Recent Imports
                    </h3>
                    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-800 max-h-[250px] overflow-y-auto">
                      {importHistory.map((h, i) => (
                        <div
                          key={i}
                          className="px-4 py-2.5 flex items-center justify-between text-sm"
                        >
                          <div className="flex flex-col truncate pr-4">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate">
                              {h.name}
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              {new Date(h.date).toLocaleString()}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                              h.type === "Drive"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }`}
                          >
                            {h.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex justify-end">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setResults([]);
                }}
                className="px-4 py-2 font-medium hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                {isProcessing ? "Hide (Running in background)" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
