"use client";

/**
 * 実機のブラウザで「どの要素とどの要素が重なっているか」を測って出す。
 *
 * ## なぜ要るか
 *
 * iPad（Safari）で入力欄が重なる、という報告を追えていない。手元には
 * Safari が無く（WebKit はこの環境に入らない）、代わりに使っている
 * Chromium は**描画そのものにずれがある**ことが分かった。CSS を一切
 * 当てない素の HTML でも、閉じた `<details>` の中身を隠さずに描く
 * （Chromium 141）。そのせいで実在しない不具合を 1 件掴みかけた。
 *
 * 再現機が信用できない以上、**利用者の実機に測ってもらう**しかない。
 * これはそのための一時的な道具で、原因が分かったら消す。
 *
 * ## 出し方
 *
 * 次のどちらかが立っているときだけ動く。どちらも無ければ何も描かない。
 *
 * - URL に `?debug=overlap` が付いている
 * - `localStorage` に `debug_overlap` が入っている（/debug/overlap で入れる）
 *
 * **URL の合図だけにしない。**画面内のリンクを踏むと query は落ちるので、
 * 「合図付きで開いた頁から、重なって見える頁へ移動する」と消えてしまう。
 * 実際、利用者の iPad で「付けたけど変わらない」となった（2026-08-28）。
 * localStorage なら移動しても残る。
 *
 * ## 置き場所を下にしない
 *
 * iOS の Safari は `position: fixed; bottom: 0` を**ブラウザの下の帯の
 * 裏**に置くことがある。出しても見えない可能性があるので上に出す。
 * `env(safe-area-inset-top)` ぶんだけ下げる。
 *
 * ## 測り方の決め事
 *
 * - **位置指定の祖先（重ね合わせの根）ごとに分けて比べる。**そうしないと、
 *   意図して内容の上に浮かせている物（サイドバー・ログ欄）と、本当の
 *   崩れが混ざる
 * - 祖先が透明・高さ 0 で隠している中身は数えない（畳んだ欄の中身が
 *   偽の重なりとして大量に出る）
 * - **いま画面に見えているものを先に出す。**利用者が「重なって見える所」まで
 *   スクロールしてから測るのが一番速いため
 */

import { useCallback, useState, useSyncExternalStore } from "react";

interface Hit {
  a: string;
  b: string;
  ox: number;
  oy: number;
  y: number;
  inView: boolean;
}

interface Report {
  env: string[];
  hits: Hit[];
  overflow: string[];
}

const MAX_NODES = 1200;

function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const ph = el.getAttribute("placeholder");
  const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
  const cls =
    typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
      : "";
  return `${tag}${id}${ph ? `[${ph}]` : ""}${cls} "${text}"`;
}

/** 位置指定の祖先。これが同じもの同士だけを比べる。 */
function stackRoot(el: Element): Element {
  let n = el.parentElement;
  while (n && n !== document.documentElement) {
    const p = getComputedStyle(n).position;
    if (p === "fixed" || p === "absolute" || p === "sticky") return n;
    n = n.parentElement;
  }
  return document.body;
}

/** 自分か祖先が隠しているものは数えない。 */
function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  let n: Element | null = el;
  while (n && n !== document.documentElement) {
    const s = getComputedStyle(n);
    if (s.display === "none" || s.visibility === "hidden") return false;
    if (Number(s.opacity) === 0) return false;
    // 畳んだ欄（高さ 0 で切り取っている）の中身を除く
    if (s.overflow !== "visible" && n.getBoundingClientRect().height < 2) {
      return false;
    }
    n = n.parentElement;
  }
  return true;
}

function measure(): Report {
  const vv = window.visualViewport;
  const env = [
    `URL: ${location.pathname}${location.search}`,
    `画面: ${innerWidth} x ${innerHeight} (CSS px)`,
    `端末の画面: ${screen.width} x ${screen.height} / DPR ${devicePixelRatio}`,
    vv
      ? `visualViewport: ${Math.round(vv.width)} x ${Math.round(vv.height)} / 拡大 ${vv.scale.toFixed(2)}`
      : "visualViewport: なし",
    `横スクロール: ${document.documentElement.scrollWidth > innerWidth ? `あり (${document.documentElement.scrollWidth} > ${innerWidth})` : "なし"}`,
    `現在のスクロール位置: y=${Math.round(scrollY)}`,
    `UA: ${navigator.userAgent}`,
  ];

  const all = [
    ...document.querySelectorAll(
      "input,select,textarea,button,label,span,p,h1,h2,h3,a,td,th",
    ),
  ]
    .filter((el) => !el.closest("[data-overlap-probe]"))
    .filter((el) => {
      const p = getComputedStyle(el).position;
      return p !== "absolute" && p !== "fixed";
    })
    .filter(isVisible)
    .slice(0, MAX_NODES);

  const groups = new Map<Element, Element[]>();
  for (const el of all) {
    const root = stackRoot(el);
    const list = groups.get(root);
    if (list) list.push(el);
    else groups.set(root, [el]);
  }

  const hits: Hit[] = [];
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ox > 2 && oy > 2) {
          hits.push({
            a: describe(a),
            b: describe(b),
            ox: Math.round(ox),
            oy: Math.round(oy),
            y: Math.round(ra.top + scrollY),
            inView: ra.top < innerHeight && ra.bottom > 0,
          });
        }
      }
    }
  }
  // 画面に見えているものを先に、次に重なりの大きい順。
  hits.sort(
    (p, q) => Number(q.inView) - Number(p.inView) || q.ox * q.oy - p.ox * p.oy,
  );

  // 入力欄が親の枠からはみ出していないか（重なりの一歩手前）
  const overflow: string[] = [];
  for (const el of document.querySelectorAll("input,select,textarea")) {
    if (el.closest("[data-overlap-probe]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2) continue;
    let n = el.parentElement;
    let depth = 0;
    while (n && depth < 6) {
      const pr = n.getBoundingClientRect();
      if (
        pr.width > 2 &&
        r.right > pr.right + 1 &&
        getComputedStyle(n).overflowX === "visible"
      ) {
        overflow.push(
          `${Math.round(r.right - pr.right)}px はみ出し: ${describe(el)} (幅 ${Math.round(r.width)} / 枠 ${Math.round(pr.width)})`,
        );
        break;
      }
      n = n.parentElement;
      depth++;
    }
  }

  return { env, hits: hits.slice(0, 40), overflow };
}

function asText(r: Report): string {
  const lines = [...r.env, "", `重なり: ${r.hits.length} 件`];
  for (const h of r.hits) {
    lines.push(
      `${h.inView ? "[画面内] " : ""}${h.ox}x${h.oy}px @y${h.y}`,
      `   A: ${h.a}`,
      `   B: ${h.b}`,
    );
  }
  lines.push("", `はみ出す入力欄: ${r.overflow.length} 件`, ...r.overflow);
  return lines.join("\n");
}

export const OVERLAP_FLAG_KEY = "debug_overlap";

/**
 * 合図を読む。サーバ側では必ず false（描かない）。
 *
 * 購読を空にしない。空だと、点いたあとに再描画する機会が無い。
 */
function subscribeFlag(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener("overlap-probe-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("overlap-probe-change", onChange);
  };
}

const readFlag = () => {
  if (new URLSearchParams(location.search).get("debug") === "overlap") {
    return true;
  }
  try {
    return localStorage.getItem(OVERLAP_FLAG_KEY) === "1";
  } catch {
    // プライベートブラウズなどで読めないことがある。URL の合図だけで動く。
    return false;
  }
};
const flagOnServer = () => false;

export function OverlapProbe() {
  // useEffect + setState にしない。効果の中で状態を変えると
  // react-hooks/set-state-in-effect の警告が増える（4 節の総数を守る）。
  // 読むだけの外部の値なので useSyncExternalStore が素直。
  const on = useSyncExternalStore(subscribeFlag, readFlag, flagOnServer);
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);

  const run = useCallback(() => {
    setCopied(false);
    setReport(measure());
  }, []);

  if (!on) return null;

  return (
    <div
      data-overlap-probe
      /* iOS は fixed bottom:0 をブラウザの下の帯の裏に置くことがあるので
         上に出す。ノッチ・ステータスバーぶんは safe-area で下げる。 */
      className="fixed inset-x-0 top-0 z-[9999] font-sans"
      style={{
        pointerEvents: "none",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {report === null ? (
        <div
          className="flex justify-center p-3"
          style={{ pointerEvents: "auto" }}
        >
          <button
            type="button"
            onClick={run}
            className="rounded-full bg-rose-600 px-6 py-3 text-sm font-bold text-white shadow-lg"
          >
            ここで重なりを測る
          </button>
        </div>
      ) : (
        <div
          className="mx-auto max-h-[70vh] w-full overflow-y-auto border-t-4 border-rose-500 bg-white p-4 text-slate-900 shadow-2xl"
          style={{ pointerEvents: "auto" }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={run}
              className="rounded-full bg-rose-600 px-4 py-2 text-xs font-bold text-white"
            >
              もう一度測る
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(asText(report))
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
              className="rounded-full border border-slate-400 px-4 py-2 text-xs font-bold"
            >
              {copied ? "コピーしました" : "全部コピー"}
            </button>
            <button
              type="button"
              onClick={() => setReport(null)}
              className="rounded-full border border-slate-400 px-4 py-2 text-xs font-bold"
            >
              閉じる
            </button>
          </div>
          <p className="mb-2 text-xs leading-relaxed text-slate-600">
            {
              "重なって見えるところまでスクロールしてから「もう一度測る」を押すと、その画面にあるものが先頭に出ます。"
            }
          </p>
          <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed">
            {asText(report)}
          </pre>
        </div>
      )}
    </div>
  );
}
