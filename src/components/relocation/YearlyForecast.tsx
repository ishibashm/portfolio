"use client";

import { useCallback, useEffect, useState } from "react";
import { rampColor } from "@/lib/panelPalette";
import { toUserMessage } from "@/lib/errorMessage";
import { SETTINGS_KEY } from "@/lib/userSettings";

/**
 * これから 12 か月の見通し。
 *
 * ## 死んでいたものを出し直す
 *
 * この予測を出す API（/api/nba/forecast）は前からあったが、**呼んでいたのは
 * NBADashboard だけで、その部品はどこにも描画されていなかった**（型だけが
 * import type で参照されていた）。つまり 2,831 行の部品ごと誰にも見られて
 * いない状態で、**12 か月予測は完全に死んでいた。**利用者の指摘で気付いた。
 *
 * 部品をそのまま復活させると、シミュレータと同じ「情報過多で使い方が
 * 分からない」になる。**12 か月予測だけを切り出す。**
 *
 * ## 色は大きさに使う
 *
 * Q 値は「その月の質」で、良い／悪いの 2 値ではなく大きさ。順序尺度
 * （単一色相の薄→濃）を使う（lib/panelPalette の SEQUENTIAL_RAMP）。
 * 判定の緑・赤は使わない。使うと「吉方位」の緑と混ざる。
 *
 * 天中殺だけは別扱いにする。大きさではなく**当たっているかどうか**なので、
 * 枠で示して色の目盛りから外す。
 */

/** /api/nba/forecast が返す 1 か月ぶん。 */
interface ForecastPoint {
  name: string;
  date: string;
  qValue: number;
  isVoidTime: boolean;
  action: string;
}

/** Q 値の目盛り。0〜100 を想定し、外れても端に寄せる。 */
function qRatio(q: number): number {
  if (!Number.isFinite(q)) return 0;
  return Math.min(1, Math.max(0, q / 100));
}

/** 端末に入っている生年月日。無ければ undefined。 */
function readBirthDate(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "birth_date" in parsed) {
      const value = (parsed as { birth_date?: unknown }).birth_date;
      return typeof value === "string" ? value : undefined;
    }
  } catch {
    /* 読めない端末（プライベートウィンドウ等）では省略して進む。 */
  }
  return undefined;
}

export function YearlyForecast() {
  const [points, setPoints] = useState<ForecastPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/nba/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /*
          体調の初期値は API 側の既定（shield 100 / ansLoad 20）に任せる。
          ここは「時期そのものの質」を見る画面なので、体調で上下させると
          月どうしを比べられなくなる。
        */
        body: JSON.stringify({ clientBirthDate: readBirthDate() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setPoints(json.data);
      setError(null);
    } catch (e) {
      setError(toUserMessage(e, "12 か月の見通しを取得できませんでした。"));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* いちばん質の高い月。天中殺の月は勧めない。 */
  const best =
    points && points.length > 0
      ? points
          .filter((p) => !p.isVoidTime)
          .reduce<ForecastPoint | null>(
            (top, p) => (!top || p.qValue > top.qValue ? p : top),
            null,
          )
      : null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-stone-800">
          これから 12 か月の見通し
        </h2>
        <p className="text-[11px] text-stone-500">
          月ごとの質（Q 値）。濃いほど条件が良い月です。
        </p>
      </div>

      {busy && !points && (
        <p className="mt-3 text-xs text-stone-500">読み込んでいます…</p>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </p>
      )}

      {points && points.length > 0 && (
        <>
          {/* 結論を先に置く */}
          {best && (
            <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-stone-700">
              この 1 年でいちばん条件が良いのは
              <strong className="mx-1 font-bold">{best.name}</strong>
              です（Q 値 {Math.round(best.qValue)}）。
            </p>
          )}

          {/* 根拠：12 か月ぶんを並べる */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {points.map((p) => (
              <div
                key={p.date}
                className={`rounded-xl border p-2.5 ${
                  p.isVoidTime
                    ? "border-amber-300 bg-amber-50/50"
                    : "border-stone-200"
                }`}
              >
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[11px] font-bold text-stone-700">
                    {p.name}
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums text-stone-900">
                    {Math.round(p.qValue)}
                  </span>
                </div>
                <span
                  className="mt-1.5 block h-2 rounded-full"
                  style={{ backgroundColor: rampColor(qRatio(p.qValue)) }}
                  aria-hidden
                />
                {p.isVoidTime && (
                  <span className="mt-1.5 block text-[10px] font-bold text-amber-800">
                    天中殺の期間
                  </span>
                )}
                <span className="mt-1 block text-[10px] leading-snug text-stone-600">
                  {p.action}
                </span>
              </div>
            ))}
          </div>

          {/* 明細：畳まない */}
          <ul className="mt-4 space-y-1.5 border-t border-stone-200 pt-3">
            <li className="max-w-[70ch] text-[11px] leading-relaxed text-stone-600">
              ・Q 値は<strong>時期そのものの質</strong>
              で、方位は見ていません。どこへ動くかは別の画面で確かめてください。
            </li>
            <li className="max-w-[70ch] text-[11px] leading-relaxed text-stone-600">
              ・体調は既定値で計算しています。実際の体調を入れると上下します。
            </li>
            <li className="max-w-[70ch] text-[11px] leading-relaxed text-stone-600">
              ・<strong>天中殺の月は、質が高くても勧めていません。</strong>
              枠を付けて色の目盛りから外しています。
            </li>
          </ul>
        </>
      )}

      {points && points.length === 0 && (
        <p className="mt-3 text-xs text-stone-500">
          見通しを出せませんでした。生年月日を入れると精度が上がります。
        </p>
      )}
    </section>
  );
}
