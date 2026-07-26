"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Palette,
  Copy,
  Check,
  Download,
  Monitor,
  Tablet,
  Smartphone,
  Code,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import html2canvas from "html2canvas";

interface SharePageClientProps {
  component: {
    id: string;
    title: string;
    style: string;
    inputData: any;
    cleanHtml: string;
    createdAt: string;
  };
}

export default function SharePageClient({ component }: SharePageClientProps) {
  const [viewportWidth, setViewportWidth] = useState<
    "100%" | "768px" | "375px"
  >("100%");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const wrapHtmlWithTailwind = (htmlContent: string) => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/@tailwindcss/browser@4"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #09090b;
      color: white;
      font-family: system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 1.5rem;
    }
    /* Custom scrollbar for preview */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: #09090b;
    }
    ::-webkit-scrollbar-thumb {
      background: #27272a;
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #3f3f46;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(component.cleanHtml);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleExportPng = async () => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) {
      alert("Error: Preview not fully loaded yet.");
      return;
    }

    setIsExporting(true);
    try {
      // Find the element to capture or capture the entire body of the iframe
      const elementToCapture = iframe.contentDocument.body;

      const canvas = await html2canvas(elementToCapture, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#09090b",
        scale: 2, // Retain sharp details
        logging: false,
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `${component.title.toLowerCase().replace(/\s+/g, "_")}_visualization.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to export PNG:", err);
      alert("Failed to generate image. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // Safe client-side local storage integration to allow opening in visualizer studio
  const handleOpenInStudio = () => {
    // We can store the component details in session storage
    // so the visualizer page can load it upon load.
    sessionStorage.setItem(
      "visualizer_input_data",
      JSON.stringify(component.inputData, null, 2),
    );
    sessionStorage.setItem("visualizer_initial_style", component.style);
    sessionStorage.setItem("visualizer_initial_html", component.cleanHtml);
    sessionStorage.setItem("visualizer_initial_title", component.title);
    sessionStorage.setItem("visualizer_initial_id", component.id);
  };

  const styleLabels: Record<string, string> = {
    "music-dashboard": "Resonance Synth",
    "twitter-card": "Solar HUD",
    "realestate-card": "Magnetosphere Shield",
    "pricing-tier": "Cosmic Flux Dashboard",
    "analytics-widget": "Space Weather Alert",
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 overflow-hidden font-sans">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-6 py-4 bg-stone-50/80 backdrop-blur-md border-b border-stone-200/60 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <Link
            href="/visualizer"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-stone-200/60 hover:bg-stone-100 text-stone-500 hover:text-stone-900 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-stone-800 text-base">
                {component.title}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {styleLabels[component.style] || component.style}
              </span>
            </div>
            <p className="text-[11px] text-stone-400">
              Shared via Resonance Sandbox
            </p>
          </div>
        </div>

        {/* Viewport Width Controllers */}
        <div className="hidden md:flex items-center gap-1 bg-white/80 p-1 border border-stone-200/60 rounded-xl">
          <button
            onClick={() => setViewportWidth("100%")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewportWidth === "100%" ? "bg-stone-100 text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Desktop</span>
          </button>
          <button
            onClick={() => setViewportWidth("768px")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewportWidth === "768px" ? "bg-stone-100 text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
          >
            <Tablet className="w-3.5 h-3.5" />
            <span>Tablet</span>
          </button>
          <button
            onClick={() => setViewportWidth("375px")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewportWidth === "375px" ? "bg-stone-100 text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile</span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-stone-200/60 rounded-xl hover:bg-stone-100 text-stone-600 hover:text-stone-900 transition-all"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ExternalLink className="w-3.5 h-3.5" />
            )}
            <span>{copiedLink ? "Copied URL!" : "Copy Link"}</span>
          </button>

          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-stone-200/60 rounded-xl hover:bg-stone-100 text-stone-600 hover:text-stone-900 transition-all"
          >
            {copiedCode ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Code className="w-3.5 h-3.5" />
            )}
            <span>{copiedCode ? "Copied HTML!" : "Copy Code"}</span>
          </button>

          <button
            onClick={handleExportPng}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-stone-200/60 rounded-xl hover:bg-stone-100 text-stone-600 hover:text-stone-900 transition-all disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? "Exporting..." : "Export PNG"}</span>
          </button>

          <Link
            href="/visualizer"
            onClick={handleOpenInStudio}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-stone-900 rounded-xl shadow-md shadow-indigo-600/10 hover:shadow-indigo-500/20 transition-all font-semibold"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Open in Sandbox</span>
          </Link>
        </div>
      </header>

      {/* Main Canvas Display */}
      <main className="flex-1 bg-stone-100/60 relative overflow-hidden flex items-center justify-center p-4">
        {/* Decorative Grid and Background Glows */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2e_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2e_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-10 pointer-events-none" />
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Resizable Preview Container */}
        <div
          style={{ width: viewportWidth }}
          className="h-full max-h-[85vh] transition-all duration-300 ease-in-out border border-stone-200/60 rounded-2xl overflow-hidden shadow-2xl bg-[#09090b] flex flex-col"
        >
          {/* Virtual Titlebar representing browser iframe frame */}
          <div className="px-4 py-2 bg-white/80 border-b border-stone-200/60 flex items-center gap-2 select-none shrink-0">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <div className="flex-1 flex justify-center pr-10">
              <div className="px-6 py-0.5 rounded-lg bg-stone-50/80 border border-stone-200/60 text-[10px] text-stone-400 font-mono tracking-wider w-80 truncate text-center select-all">
                resonance-sandbox://{component.id}.local
              </div>
            </div>
          </div>

          <iframe
            ref={iframeRef}
            srcDoc={wrapHtmlWithTailwind(component.cleanHtml)}
            className="w-full flex-1 border-0 bg-[#09090b]"
            title={component.title}
            sandbox="allow-scripts allow-popups allow-forms allow-same-origin"
          />
        </div>
      </main>
    </div>
  );
}
