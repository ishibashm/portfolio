"use client";

import { useEffect } from "react";

declare global {
    interface Window {
        googleTranslateElementInit: () => void;
        google: any;
    }
}

export default function GoogleTranslate() {
    useEffect(() => {
        // 既にスクリプトがある場合は何もしない
        if (document.getElementById("google-translate-script")) return;

        const googleTranslateElementInit = () => {
            new window.google.translate.TranslateElement(
                {
                    pageLanguage: "ja",
                    includedLanguages: "en,ja",
                    layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
                    autoDisplay: false,
                },
                "google_translate_element"
            );
        };

        window.googleTranslateElementInit = googleTranslateElementInit;

        const script = document.createElement("script");
        script.id = "google-translate-script";
        script.src =
            "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
        script.async = true;
        document.body.appendChild(script);
    }, []);

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div
                id="google_translate_element"
                className="overflow-hidden rounded-lg shadow-lg border border-white/10 bg-black/50 backdrop-blur-md"
            />
            <style jsx global>{`
        /* ツールバーを隠す */
        .skiptranslate iframe {
          display: none !important;
        }
        body {
          top: 0 !important;
        }
        /* ウィジェットのスタイル調整 */
        .goog-te-gadget-simple {
          background-color: transparent !important;
          border: none !important;
          padding: 8px 12px !important;
          font-family: inherit !important;
        }
        .goog-te-gadget-simple .goog-te-menu-value {
          color: #e2e8f0 !important; /* text-slate-200 */
        }
        .goog-te-gadget-simple .goog-te-menu-value span {
          color: #e2e8f0 !important;
          border-left: 1px solid #475569 !important; /* slate-600 */
        }
        .goog-te-gadget-icon {
            display: none !important;
        }
      `}</style>
        </div>
    );
}
