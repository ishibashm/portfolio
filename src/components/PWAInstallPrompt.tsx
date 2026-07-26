"use client";

import React, { useState, useEffect } from "react";
import { Download, Share, PlusSquare, X, Smartphone, Check } from "lucide-react";

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsStandalone(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(iosDevice);

    // Listen for beforeinstallprompt event on Android / Chromium
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
      }
      setDeferredPrompt(null);
    }
  };

  if (isStandalone || installed) {
    return null; // Already installed or running in standalone app mode
  }

  return (
    <>
      {/* Install Button Widget */}
      {(deferredPrompt || isIOS) && (
        <button
          onClick={handleInstallClick}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600/30 to-purple-600/30 border border-indigo-200 text-indigo-700 hover:text-stone-900 hover:border-indigo-400 transition-all group cursor-pointer shadow-lg shadow-indigo-950/40"
          title="アプリとしてスマホ/PCにインストール"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-600 group-hover:scale-110 transition-transform">
              <Smartphone size={16} />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold leading-tight">アプリをインストール</div>
              <div className="text-[10px] text-indigo-300/70 font-mono">iOS / Android / Desktop</div>
            </div>
          </div>
          <Download size={15} className="text-indigo-600 group-hover:translate-y-0.5 transition-transform shrink-0" />
        </button>
      )}

      {/* iOS Manual Installation Guide Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-white border border-stone-200 rounded-2xl p-6 text-stone-900 shadow-2xl space-y-4">
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 right-4 text-stone-500 hover:text-stone-900 p-1"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-600 border border-indigo-200">
                <Smartphone size={24} />
              </div>
              <div>
                <h3 className="font-bold text-base text-stone-800">iOS (iPhone/iPad) でのインストール</h3>
                <p className="text-xs text-stone-500 font-mono">ホーム画面に追加してアプリとして使用</p>
              </div>
            </div>

            <div className="space-y-3 pt-2 text-sm text-stone-600 font-mono">
              <div className="flex items-start gap-3 bg-white/80 p-3 rounded-xl border border-stone-200">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 text-xs font-bold shrink-0">1</span>
                <div>
                  Safari ブラウザ下部（または上部）の <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-stone-100 text-indigo-600 font-sans"><Share size={14} className="inline mr-1" /> 共有ボタン</span> をタップ
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/80 p-3 rounded-xl border border-stone-200">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 text-xs font-bold shrink-0">2</span>
                <div>
                  メニューから <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-stone-100 text-indigo-600 font-sans"><PlusSquare size={14} className="inline mr-1" /> ホーム画面に追加</span> を選択
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/80 p-3 rounded-xl border border-stone-200">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 text-xs font-bold shrink-0">3</span>
                <div>
                  右上「追加」をタップすれば、ホーム画面からネイティブアプリとして起動できます。
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-stone-900 font-medium text-sm rounded-xl transition-colors cursor-pointer"
            >
              了解しました
            </button>
          </div>
        </div>
      )}
    </>
  );
}
