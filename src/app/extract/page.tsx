"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Globe,
  Loader2,
  Copy,
  Download,
  Image as ImageIcon,
  BookOpen,
  ArrowUpRight,
  Wifi,
  Sparkles,
  Terminal,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
} from "lucide-react";
import { extractArticle, saveToKnowledgeBase } from "./actions";

export default function DefuddleExtractorPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [driveSaving, setDriveSaving] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);

  // KB Saving states
  const [kbSaving, setKbSaving] = useState(false);

  // HUD Alert/Toast states
  const [hudNotification, setHudNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
    visible: boolean;
  }>({ message: "", type: "info", visible: false });

  // Load Google Identity Services script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const showHudNotification = (
    message: string,
    type: "success" | "error" | "info",
  ) => {
    setHudNotification({ message, type, visible: true });
    setTimeout(() => {
      setHudNotification((prev) => {
        if (prev.message === message) {
          return { ...prev, visible: false };
        }
        return prev;
      });
    }, 5000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setScreenshotUrl(null);
    setScreenshotError(null);

    try {
      const response = await extractArticle(url);
      if (response.success) {
        setResult(response.data);
        showHudNotification("記事の抽出に成功しました！", "success");
      } else {
        setError(response.error || "抽出に失敗しました。");
        showHudNotification("抽出に失敗しました。", "error");
      }
    } catch (err: any) {
      setError(err.message || "予期しないエラーが発生しました。");
      showHudNotification(err.message || "エラーが発生しました。", "error");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (result?.content) {
      navigator.clipboard.writeText(result.content);
      showHudNotification("クリップボードにコピーしました！", "success");
    }
  };

  const takeScreenshot = async () => {
    if (!url) return;
    setScreenshotLoading(true);
    setScreenshotError(null);
    if (screenshotUrl) {
      URL.revokeObjectURL(screenshotUrl);
      setScreenshotUrl(null);
    }
    try {
      const res = await fetch("/api/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Screenshot failed");
      }
      const blob = await res.blob();
      setScreenshotUrl(URL.createObjectURL(blob));
      showHudNotification(
        "スクリーンショットの撮影に成功しました！",
        "success",
      );
    } catch (err: any) {
      setScreenshotError(err.message || "Failed to take screenshot");
      showHudNotification("スクリーンショットの撮影に失敗しました。", "error");
    } finally {
      setScreenshotLoading(false);
    }
  };

  const downloadScreenshot = () => {
    if (!screenshotUrl) return;
    const a = document.createElement("a");
    a.href = screenshotUrl;
    const safeTitle = result?.title
      ? result.title.replace(/[^a-zA-Z0-9]/gi, "_").toLowerCase()
      : "screenshot";
    a.download = `${safeTitle}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAsFile = () => {
    if (result?.content) {
      const blob = new Blob([result.content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeTitle = result.title
        ? result.title.replace(/[^a-zA-Z0-9]/gi, "_").toLowerCase()
        : "extracted_article";
      a.download = `${safeTitle}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showHudNotification(
        "Markdownファイルとしてダウンロードしました。",
        "success",
      );
    }
  };

  const uploadToGoogleDrive = async (accessToken: string) => {
    if (!result?.content) return;
    setDriveSaving(true);

    try {
      const safeTitle = result.title
        ? result.title.replace(/[^a-zA-Z0-9]/gi, "_").toLowerCase()
        : "extracted_article";
      const fileName = `${safeTitle}.md`;

      const metadata = {
        name: fileName,
        mimeType: "text/markdown",
      };

      const fileContent = result.content;
      const form = new FormData();
      form.append(
        "metadata",
        new Blob([JSON.stringify(metadata)], { type: "application/json" }),
      );
      form.append("file", new Blob([fileContent], { type: "text/markdown" }));

      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: form,
        },
      );

      if (response.ok) {
        showHudNotification(
          "Google Driveへのアップロードが完了しました！",
          "success",
        );
      } else {
        const errData = await response.json();
        console.error("Drive Error:", errData);
        showHudNotification(
          `アップロード失敗: ${errData.error?.message || response.statusText}`,
          "error",
        );
      }
    } catch (err: any) {
      console.error("Upload Error:", err);
      showHudNotification(
        "Google Drive保存中にエラーが発生しました。",
        "error",
      );
    } finally {
      setDriveSaving(false);
    }
  };

  const handleSaveToDrive = () => {
    const win = window as any;
    if (!win.google?.accounts?.oauth2) {
      showHudNotification(
        "Google APIクライアントの読み込みに失敗しました。",
        "error",
      );
      return;
    }

    const clientId =
      "1048856040219-0r5hkme3p98ntim1r6c3qondi37n061t.apps.googleusercontent.com";

    const tokenClient = win.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (tokenResponse: any) => {
        if (tokenResponse.error !== undefined) {
          console.error("Token Error:", tokenResponse);
          showHudNotification("認証に失敗しました。", "error");
          setDriveSaving(false);
          return;
        }
        uploadToGoogleDrive(tokenResponse.access_token);
      },
    });

    tokenClient.requestAccessToken();
  };

  const handleSaveToSecondBrain = async () => {
    if (!result) return;
    setKbSaving(true);
    try {
      const res = await saveToKnowledgeBase(
        result.title,
        result.content,
        result.site,
      );
      if (res.success) {
        showHudNotification(
          `Second Brainに保存しました！ (${res.kb_id})`,
          "success",
        );
      } else {
        showHudNotification(res.error || "保存に失敗しました。", "error");
      }
    } catch (err: any) {
      console.error(err);
      showHudNotification(err.message || "エラーが発生しました。", "error");
    } finally {
      setKbSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-[color-mix(in_srgb,var(--color-accent,#10b981)_30%,transparent)] font-sans relative overflow-hidden flex flex-col">
      {/* Background Liquid Glass Glows */}
      <div
        className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[120px] -z-10 pointer-events-none"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--color-accent, #10b981) 8%, transparent)",
        }}
      />
      <div
        className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] -z-10 pointer-events-none"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--color-accent, #10b981) 6%, transparent)",
        }}
      />

      <main className="flex-grow max-w-[1400px] w-full mx-auto px-6 py-10 relative z-10">
        {/* Header Section */}
        <header
          className="relative mb-8 p-6 md:p-8 rounded-2xl border bg-white/[0.01] backdrop-blur-md overflow-hidden"
          style={{
            borderColor: "rgba(255, 255, 255, 0.05)",
          }}
        >
          {/* Cyber Decorative Lines */}
          <div
            className="absolute top-0 left-0 w-full h-[1px] opacity-70"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent, #10b981) 30%, transparent), transparent)",
            }}
          />
          <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          <div
            className="absolute top-0 left-8 w-[1px] h-4"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-accent, #10b981) 50%, transparent)",
            }}
          />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-2 w-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: "var(--color-accent, #10b981)" }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ backgroundColor: "var(--color-accent, #10b981)" }}
                  />
                </span>
                <span
                  className="text-xs font-mono tracking-widest uppercase font-semibold flex items-center gap-1.5"
                  style={{ color: "var(--color-accent, #10b981)" }}
                >
                  <Wifi className="w-3.5 h-3.5" /> Defuddle Content Extractor
                  Node
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter bg-gradient-to-r from-white via-zinc-100 to-[color-mix(in_srgb,var(--color-accent,#10b981)_60%,white)] bg-clip-text text-transparent">
                Web Extractor
              </h1>
              <p className="text-zinc-400 mt-3 max-w-2xl text-sm md:text-base font-light leading-relaxed">
                任意のWebサイトから、広告やナビゲーションを除去したクリーンなマークダウン原稿を抽出します。
                抽出されたデータはそのままローカルナレッジベースやGoogle
                Driveに格納できます。
              </p>
            </div>
          </div>
        </header>

        {/* URL Input Form */}
        <section
          className="p-6 rounded-2xl bg-white/[0.01] border backdrop-blur-md relative overflow-hidden mb-8"
          style={{
            borderColor: "rgba(255, 255, 255, 0.05)",
          }}
        >
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)",
              backgroundSize: "8px 8px",
            }}
          />

          <form
            onSubmit={handleSubmit}
            className="flex flex-col md:flex-row gap-4 items-end relative z-10"
          >
            <div className="flex-grow space-y-2 w-full">
              <label
                htmlFor="url-input"
                className="text-[10px] text-zinc-500 uppercase tracking-widest block font-mono"
              >
                Target Site URL
              </label>
              <input
                id="url-input"
                type="url"
                required
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-black/60 border border-white/5 text-white placeholder-zinc-700 focus:outline-none text-sm font-mono transition-all"
                style={{
                  borderColor: "rgba(255, 255, 255, 0.05)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--color-accent, #10b981)";
                  e.target.style.boxShadow =
                    "0 0 10px color-mix(in srgb, var(--color-accent, #10b981) 15%, transparent)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255, 255, 255, 0.05)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-white font-mono text-xs uppercase tracking-widest font-bold transition-all cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: "var(--color-accent, #10b981)",
                boxShadow:
                  "0 4px 20px color-mix(in srgb, var(--color-accent, #10b981) 20%, transparent)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = "brightness(1.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "none";
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>EXTRACTING...</span>
                </>
              ) : (
                <>
                  <Globe size={16} />
                  <span>START_EXTRACTION</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* Display Error if any */}
        {error && (
          <div className="mb-8 p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] text-rose-400 font-mono uppercase font-bold tracking-wider">
                ERR: EXTRACT_OPERATION_FAILED
              </span>
              <p className="text-xs text-zinc-300 font-mono mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Display Result Grid */}
        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Document Content Column */}
            <div className="lg:col-span-2 space-y-6">
              <div
                className="p-6 rounded-2xl bg-white/[0.01] border backdrop-blur-md relative overflow-hidden"
                style={{
                  borderColor: "rgba(255, 255, 255, 0.05)",
                }}
              >
                {/* L-shaped corner brackets */}
                <div className="absolute top-2.5 left-2.5 w-2 h-2 border-t border-l border-white/5 pointer-events-none" />
                <div className="absolute top-2.5 right-2.5 w-2 h-2 border-t border-r border-white/5 pointer-events-none" />
                <div className="absolute bottom-2.5 left-2.5 w-2 h-2 border-b border-l border-white/5 pointer-events-none" />
                <div className="absolute bottom-2.5 right-2.5 w-2 h-2 border-b border-r border-white/5 pointer-events-none" />

                <div className="border-b border-white/5 pb-4 mb-4">
                  <span
                    className="text-[9px] px-2 py-0.5 rounded border font-mono uppercase tracking-wider font-semibold"
                    style={{
                      color: "var(--color-accent, #10b981)",
                      backgroundColor:
                        "color-mix(in srgb, var(--color-accent, #10b981) 5%, transparent)",
                      borderColor:
                        "color-mix(in srgb, var(--color-accent, #10b981) 15%, transparent)",
                    }}
                  >
                    {result.site || "Web Page"}
                  </span>
                  <h2 className="text-xl font-bold tracking-tight text-white/90 mt-3">
                    {result.title}
                  </h2>
                  {result.author && (
                    <p className="text-xs text-zinc-500 font-mono mt-1">
                      Author: {result.author}
                    </p>
                  )}
                </div>

                <div className="prose prose-invert max-w-none text-zinc-300 text-xs md:text-sm font-mono leading-relaxed max-h-[500px] overflow-y-auto pr-2 bg-black/40 p-4 rounded-xl border border-white/5 whitespace-pre-wrap">
                  {result.content}
                </div>
              </div>
            </div>

            {/* Actions Panel Column */}
            <div className="space-y-6">
              {/* Main Actions Box */}
              <div
                className="p-6 rounded-2xl bg-white/[0.01] border backdrop-blur-md relative overflow-hidden"
                style={{
                  borderColor: "rgba(255, 255, 255, 0.05)",
                }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center border"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--color-accent, #10b981) 8%, transparent)",
                      borderColor:
                        "color-mix(in srgb, var(--color-accent, #10b981) 25%, transparent)",
                    }}
                  >
                    <FileText
                      className="w-5 h-5"
                      style={{ color: "var(--color-accent, #10b981)" }}
                    />
                  </div>
                  <div>
                    <h2 className="text-sm font-mono tracking-wider text-zinc-500 uppercase">
                      {"// Export Console"}
                    </h2>
                    <h3 className="text-lg font-bold tracking-tight text-white">
                      データ出力・保存
                    </h3>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Save to Second Brain */}
                  <button
                    onClick={handleSaveToSecondBrain}
                    disabled={kbSaving}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/5 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/15 transition-all text-xs font-mono select-none cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen size={14} className="text-indigo-400" />
                      <span>ナレッジベース (Second Brain) に保存</span>
                    </span>
                    {kbSaving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ChevronRightIcon />
                    )}
                  </button>

                  {/* Save to Google Drive */}
                  <button
                    onClick={handleSaveToDrive}
                    disabled={driveSaving}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/5 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/15 transition-all text-xs font-mono select-none cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Globe size={14} className="text-emerald-400" />
                      <span>Google Drive に保存</span>
                    </span>
                    {driveSaving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ChevronRightIcon />
                    )}
                  </button>

                  {/* Copy to Clipboard */}
                  <button
                    onClick={copyToClipboard}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/5 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/15 transition-all text-xs font-mono select-none cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Copy size={14} className="text-cyan-400" />
                      <span>クリップボードにコピー</span>
                    </span>
                    <ChevronRightIcon />
                  </button>

                  {/* Download MD file */}
                  <button
                    onClick={downloadAsFile}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/5 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/15 transition-all text-xs font-mono select-none cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Download size={14} className="text-amber-400" />
                      <span>Markdownファイルをダウンロード</span>
                    </span>
                    <ChevronRightIcon />
                  </button>

                  {/* Capture Screenshot */}
                  <button
                    onClick={takeScreenshot}
                    disabled={screenshotLoading}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/5 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/15 transition-all text-xs font-mono select-none cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <ImageIcon size={14} className="text-rose-400" />
                      <span>Webサイトのスクリーンショット撮影</span>
                    </span>
                    {screenshotLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ChevronRightIcon />
                    )}
                  </button>
                </div>
              </div>

              {/* Screenshot Preview Box */}
              {(screenshotLoading || screenshotUrl || screenshotError) && (
                <div
                  className="p-6 rounded-2xl bg-white/[0.01] border backdrop-blur-md relative overflow-hidden"
                  style={{
                    borderColor: "rgba(255, 255, 255, 0.05)",
                  }}
                >
                  <h3 className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest mb-3">
                    {"// Screenshot Node"}
                  </h3>

                  {screenshotLoading && (
                    <div className="h-48 rounded-xl border border-white/5 bg-black/40 flex flex-col items-center justify-center text-zinc-500 gap-2">
                      <Loader2
                        size={24}
                        className="animate-spin text-rose-400"
                      />
                      <span className="text-[10px] font-mono tracking-widest uppercase">
                        Capturing Node Screen...
                      </span>
                    </div>
                  )}

                  {screenshotError && (
                    <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 text-xs font-mono text-rose-300">
                      ERR_SCREENSHOT_CAPTURE_FAILED: {screenshotError}
                    </div>
                  )}

                  {screenshotUrl && !screenshotLoading && (
                    <div className="space-y-4">
                      <div className="relative rounded-xl border border-white/5 overflow-hidden bg-black/40 max-h-60">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={screenshotUrl}
                          alt="Web page screenshot"
                          className="w-full h-auto object-contain"
                        />
                      </div>
                      <button
                        onClick={downloadScreenshot}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/5 text-rose-300 hover:bg-rose-500/10 hover:text-white transition-all text-xs font-mono cursor-pointer"
                      >
                        <Download size={14} />
                        <span>DOWNLOAD_SCREENSHOT_IMAGE</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* HUD Notification Toast */}
      {hudNotification.visible && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm p-4 rounded-xl border bg-[#0a0a0ad9] backdrop-blur-md shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300"
          style={{
            borderColor:
              hudNotification.type === "success"
                ? "rgba(16, 185, 129, 0.3)"
                : hudNotification.type === "error"
                  ? "rgba(239, 68, 68, 0.3)"
                  : "rgba(255, 255, 255, 0.1)",
          }}
        >
          {hudNotification.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : hudNotification.type === "error" ? (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <Terminal className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-grow">
            <div className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase mb-0.5">
              {hudNotification.type === "success"
                ? "SYS_LOG_OK"
                : hudNotification.type === "error"
                  ? "SYS_LOG_ERR"
                  : "SYS_LOG_INFO"}
            </div>
            <p className="text-xs font-mono text-zinc-200">
              {hudNotification.message}
            </p>
          </div>
          <button
            onClick={() =>
              setHudNotification((prev) => ({ ...prev, visible: false }))
            }
            className="text-zinc-500 hover:text-zinc-300 text-xs font-mono select-none cursor-pointer"
          >
            {"[X]"}
          </button>
        </div>
      )}
    </div>
  );
}

function ChevronRightIcon() {
  return (
    <ChevronRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
  );
}
