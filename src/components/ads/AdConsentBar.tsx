"use client";

import { AD_CONSENT_STORAGE_KEY, parseAdConsent } from "@/lib/adConsent";
import Link from "next/link";
import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("cp-ad-consent", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("cp-ad-consent", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readChoice() {
  try {
    return parseAdConsent(localStorage.getItem(AD_CONSENT_STORAGE_KEY));
  } catch {
    return parseAdConsent(null);
  }
}

function choose(value: "granted" | "denied") {
  try {
    localStorage.setItem(AD_CONSENT_STORAGE_KEY, value);
  } catch {
    /* 保存できない端末では、このページのあいだだけバーを閉じる */
  }
  if (window.adsbygoogle) {
    window.adsbygoogle.requestNonPersonalizedAds = value === "granted" ? 0 : 1;
  }
  window.dispatchEvent(new Event("cp-ad-consent"));
}

/**
 * 画面下に固定する。本文の高さを変えないので、閉じても CLS は起きない。
 * サーバーでは未選択として描き、保存済みの端末は水和のあとで消す。
 */
export function AdConsentBar() {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "unknown");
  if (choice !== "unknown") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-300 bg-[#faf7f3]/95 px-4 py-3 text-sm text-stone-800 shadow-lg">
      <div className="mx-auto flex max-w-[1700px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[70ch] leading-6">
          広告の Cookie
          について。同意するまで、興味に合わせた広告にはしません。生年月日や出発地は送りません。
          <Link href="/privacy" className="ml-1 text-rose-700 underline">
            プライバシーポリシー
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-lg border border-stone-400 px-3 py-2"
            onClick={() => choose("denied")}
          >
            必須のみ
          </button>
          <button
            type="button"
            className="rounded-lg bg-stone-800 px-3 py-2 text-white"
            onClick={() => choose("granted")}
          >
            同意する
          </button>
        </div>
      </div>
    </div>
  );
}
