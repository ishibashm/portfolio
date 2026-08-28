"use client";

/**
 * 重なりの測定を「入れっぱなし」にするための入口。
 *
 * `?debug=overlap` を URL に付ける方式だけだと、**画面内のリンクを踏んだ
 * 時点で query が落ちて消える。**合図付きで開いた頁から、重なって見える
 * 頁へ移動すると出なくなる。実際に利用者の iPad で「付けたけど変わらない」
 * となった（2026-08-28）。
 *
 * ここで localStorage に入れておけば、どの頁へ移動しても出続ける。
 * 原因が分かったら、この頁ごと消す。
 */

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { OVERLAP_FLAG_KEY } from "@/components/debug/OverlapProbe";

const TARGETS = [
  { href: "/", label: "ホーム（引越しの方位とタイミングを決める）" },
  { href: "/relocation/wealth", label: "移住先の地域を比べる" },
  { href: "/calendar", label: "引越しの日取りを選ぶ" },
  { href: "/relocation/simulator", label: "引越し先を試算する" },
  { href: "/houi", label: "本命星と吉方位を調べる" },
];

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("overlap-probe-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("overlap-probe-change", onChange);
  };
}

function readFlag() {
  try {
    return localStorage.getItem(OVERLAP_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export default function Page() {
  const on = useSyncExternalStore(subscribe, readFlag, () => false);

  const toggle = useCallback((next: boolean) => {
    try {
      if (next) localStorage.setItem(OVERLAP_FLAG_KEY, "1");
      else localStorage.removeItem(OVERLAP_FLAG_KEY);
    } catch {
      // 読み書きできない設定でも、URL に ?debug=overlap を付ければ動く。
    }
    window.dispatchEvent(new Event("overlap-probe-change"));
  }, []);

  return (
    <div className="min-h-screen bg-[#faf7f5] px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-[70ch]">
        <h1 className="font-serif text-2xl font-bold">重なりの測定</h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-700">
          {
            "入力欄が重なって見える箇所を特定するための一時的な道具です。有効にすると、どのページにも画面の上に「ここで重なりを測る」ボタンが出ます。重なって見えるところまでスクロールしてから押してください。"
          }
        </p>

        <div className="mt-6 rounded-2xl border border-slate-300 bg-white p-5">
          <p className="text-sm font-bold">
            いまの状態: {on ? "有効" : "無効"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggle(true)}
              className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-bold text-white"
            >
              測定を有効にする
            </button>
            <button
              type="button"
              onClick={() => toggle(false)}
              className="rounded-full border border-slate-400 px-5 py-2.5 text-sm font-bold"
            >
              やめる
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            {
              "この端末のこのブラウザにだけ残ります。ほかの利用者には影響しません。URL に ?debug=overlap を付ける方法も引き続き使えます。"
            }
          </p>
        </div>

        <h2 className="mt-8 font-serif text-lg font-bold">
          重なって見えるページへ
        </h2>
        <ul className="mt-3 space-y-2">
          {TARGETS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="text-sm font-bold text-rose-600 underline"
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
