"use client";

import React, { useEffect } from "react";

interface AdBannerProps {
  slot?: string;
  format?: "auto" | "fluid" | "rectangle" | "horizontal";
  responsive?: boolean;
  className?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({
  slot,
  format = "auto",
  responsive = true,
  className = "",
}) => {
  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_ID;

  useEffect(() => {
    if (adsenseId && typeof window !== "undefined") {
      try {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (err) {
        console.warn("AdSense push error:", err);
      }
    }
  }, [adsenseId]);

  if (!adsenseId) {
    return (
      <div
        className={`w-full p-4 rounded-2xl bg-white/70 backdrop-blur-md border border-slate-200/80 text-center font-sans ${className}`}
        aria-label="スポンサー広告"
      >
        <span className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase block mb-1">
          スポンサーリンク / Sponsored
        </span>
        <div className="w-full h-16 rounded-xl bg-stone-100/70 border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-500 font-medium">
          [ 広告スペース - Cloud Palette Intelligence ]
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full overflow-hidden my-4 ${className}`} aria-label="スポンサー広告">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={adsenseId}
        data-ad-slot={slot || "0000000000"}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  );
};
