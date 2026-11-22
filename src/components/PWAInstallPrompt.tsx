"use client";

import React, { useState, useEffect } from "react";
import { Download, Share, PlusSquare, X, Smartphone } from "lucide-react";

/*
  ここで使う 2 つは**どちらも標準に入っていない**ので、lib.dom には型が無い。
  以前は any とキャストで通していたが、それだと綴りを間違えても気付けない
  （deferredPrompt.promt() でも検査を通る）。実在する API なので、
  「無いことにする」のではなく宣言する。

  - beforeinstallprompt … Chromium 系だけが出す。入れるかどうかを尋ねる前に
    横取りして、こちらの好きな場所でボタンを出すために使う
  - navigator.standalone … iOS の Safari だけが持つ。ホーム画面から開かれた
    かどうか。display-mode: standalone を見られない古い iOS のための併用
*/
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
  interface Navigator {
    /** iOS Safari のみ。ホーム画面から開かれていれば true。 */
    standalone?: boolean;
  }
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    ) {
      setIsStandalone(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(iosDevice);

    // Listen for beforeinstallprompt event on Android / Chromium
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
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
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600/30 dark:from-indigo-800 to-purple-600/30 border border-indigo-200 dark:border-theme-border text-indigo-700 dark:text-theme-link hover:text-stone-900 dark:hover:text-ink hover:border-indigo-400 dark:hover:border-theme-border transition-all group cursor-pointer shadow-lg shadow-indigo-950/40 dark:shadow-black/20"
          title="アプリとしてスマホ/PCにインストール"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 dark:bg-theme-link-soft text-indigo-600 dark:text-theme-link group-hover:scale-110 transition-transform">
              <Smartphone size={16} />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold leading-tight">アプリをインストール</div>
              <div className="text-[10px] text-indigo-700 dark:text-theme-link font-mono">iOS / Android / Desktop</div>
            </div>
          </div>
          <Download size={15} className="text-indigo-600 dark:text-theme-link group-hover:translate-y-0.5 transition-transform shrink-0" />
        </button>
      )}

      {/* iOS Manual Installation Guide Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 dark:bg-theme-surface backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-white dark:bg-theme-surface border border-stone-200 dark:border-theme-border rounded-2xl p-6 text-stone-900 dark:text-ink shadow-2xl space-y-4">
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 right-4 text-stone-500 dark:text-ink-muted hover:text-stone-900 dark:hover:text-ink p-1"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 dark:bg-theme-link-soft text-indigo-600 dark:text-theme-link border border-indigo-200 dark:border-theme-border">
                <Smartphone size={24} />
              </div>
              <div>
                <h3 className="font-bold text-base text-stone-800 dark:text-ink">iOS (iPhone/iPad) でのインストール</h3>
                <p className="text-xs text-stone-500 dark:text-ink-muted font-mono">ホーム画面に追加してアプリとして使用</p>
              </div>
            </div>

            <div className="space-y-3 pt-2 text-sm text-stone-600 dark:text-ink-muted font-mono">
              <div className="flex items-start gap-3 bg-white/80 dark:bg-theme-surface p-3 rounded-xl border border-stone-200 dark:border-theme-border">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 dark:bg-theme-link-soft text-indigo-600 dark:text-theme-link text-xs font-bold shrink-0">1</span>
                <div>
                  Safari ブラウザ下部（または上部）の <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-stone-100 dark:bg-theme-subtle text-indigo-600 dark:text-theme-link font-sans"><Share size={14} className="inline mr-1" /> 共有ボタン</span> をタップ
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/80 dark:bg-theme-surface p-3 rounded-xl border border-stone-200 dark:border-theme-border">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 dark:bg-theme-link-soft text-indigo-600 dark:text-theme-link text-xs font-bold shrink-0">2</span>
                <div>
                  メニューから <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-stone-100 dark:bg-theme-subtle text-indigo-600 dark:text-theme-link font-sans"><PlusSquare size={14} className="inline mr-1" /> ホーム画面に追加</span> を選択
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/80 dark:bg-theme-surface p-3 rounded-xl border border-stone-200 dark:border-theme-border">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 dark:bg-theme-link-soft text-indigo-600 dark:text-theme-link text-xs font-bold shrink-0">3</span>
                <div>
                  右上「追加」をタップすれば、ホーム画面からネイティブアプリとして起動できます。
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 bg-indigo-600 dark:bg-indigo-800 hover:bg-indigo-500 dark:hover:bg-indigo-800 text-white font-medium text-sm rounded-xl transition-colors cursor-pointer"
            >
              了解しました
            </button>
          </div>
        </div>
      )}
    </>
  );
}
