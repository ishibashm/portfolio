"use client";

import { useEffect, useState } from "react";
import { Loader2, Users, Eye, TrendingUp } from "lucide-react";

/**
 * アクセス状況（管理者専用）。
 *
 * 「利用者がいるのか」を確かめるための画面。数字の出どころは
 * page_views（PageViewBeacon が送る匿名の閲覧記録）と user_configs。
 *
 * ページ自体は middleware（/admin が nonCoreRoutes に入っている）が、
 * API は denyUnlessAdmin が守る。この画面は読むだけで何も書かない。
 */

type Summary = {
  sinceDay: string;
  registeredUsers: number;
  daily: { day: string; pv: number; uv: number }[];
  topPaths: { path: string; pv: number; uv: number }[];
  topReferrers: { host: string; pv: number }[];
};

export default function AdminMetricsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/metrics/summary")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setSummary(body.data);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "読み込みに失敗しました。"),
      );
  }, []);

  const totalPv = summary?.daily.reduce((s, d) => s + d.pv, 0) ?? 0;
  const maxPv = Math.max(1, ...(summary?.daily.map((d) => d.pv) ?? []));

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 p-4 md:p-8 font-sans">
      <div className="max-w-[1200px] mx-auto space-y-5">
        <header>
          <h1 className="text-xl font-bold font-serif text-stone-900">
            アクセス状況
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            直近30日。閲覧の記録は匿名で、日をまたいで同じ人を追えません。クローラは除外済み。管理者だけが見られます。
          </p>
        </header>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}

        {!summary && !error && (
          <div className="flex items-center gap-2 text-stone-500 text-sm p-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            集計中…
          </div>
        )}

        {summary && (
          <>
            {/* 数字の要約 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white/90 border border-stone-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-stone-500">
                  <Users className="w-4 h-4" />
                  設定を保存したユーザー
                </div>
                <div className="text-3xl font-bold font-mono mt-2">
                  {summary.registeredUsers}
                </div>
                <p className="text-[10px] text-stone-400 mt-1">
                  user_configs の件数。閲覧しただけの人は含みません。
                </p>
              </div>
              <div className="bg-white/90 border border-stone-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-stone-500">
                  <Eye className="w-4 h-4" />
                  30日間の閲覧（PV）
                </div>
                <div className="text-3xl font-bold font-mono mt-2">
                  {totalPv}
                </div>
                <p className="text-[10px] text-stone-400 mt-1">
                  {summary.sinceDay} 以降。自分の閲覧も含まれます。
                </p>
              </div>
              <div className="bg-white/90 border border-stone-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-stone-500">
                  <TrendingUp className="w-4 h-4" />
                  記録のある日
                </div>
                <div className="text-3xl font-bold font-mono mt-2">
                  {summary.daily.length}
                  <span className="text-sm text-stone-400 font-sans">
                    {" "}
                    / 30日
                  </span>
                </div>
                <p className="text-[10px] text-stone-400 mt-1">
                  0 のままなら、誰も来ていないということです。
                </p>
              </div>
            </div>

            {/* 日別 */}
            <div className="bg-white/90 border border-stone-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-stone-700 mb-3">
                日別の閲覧と訪問者
              </h2>
              {summary.daily.length === 0 ? (
                <p className="text-sm text-stone-400">
                  まだ記録がありません。テーブル作成（Apply additive
                  SQL）が済んでいるかも確認してください。
                </p>
              ) : (
                <div className="space-y-1">
                  {summary.daily.map((d) => (
                    <div
                      key={d.day}
                      className="flex items-center gap-3 text-xs font-mono"
                    >
                      <span className="w-24 text-stone-500">{d.day}</span>
                      <div className="flex-1 h-4 bg-stone-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-emerald-400/70"
                          style={{ width: `${(d.pv / maxPv) * 100}%` }}
                        />
                      </div>
                      <span className="w-20 text-right">
                        {d.pv} PV / {d.uv} 人
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ページ別・参照元 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white/90 border border-stone-200 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-stone-700 mb-3">
                  よく見られたページ
                </h2>
                {summary.topPaths.length === 0 ? (
                  <p className="text-sm text-stone-400">
                    まだ記録がありません。
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {summary.topPaths.map((p) => (
                        <tr key={p.path} className="border-b border-stone-100">
                          <td className="py-1.5 pr-2 font-mono truncate max-w-[240px]">
                            {p.path}
                          </td>
                          <td className="py-1.5 text-right font-mono w-24">
                            {p.pv} PV / {p.uv} 人
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="bg-white/90 border border-stone-200 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-stone-700 mb-3">
                  参照元（外部サイトのみ）
                </h2>
                {summary.topReferrers.length === 0 ? (
                  <p className="text-sm text-stone-400">
                    まだ記録がありません。検索やリンク経由の来訪が無いとここは空のままです。
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {summary.topReferrers.map((r) => (
                        <tr key={r.host} className="border-b border-stone-100">
                          <td className="py-1.5 pr-2 font-mono truncate max-w-[240px]">
                            {r.host}
                          </td>
                          <td className="py-1.5 text-right font-mono w-16">
                            {r.pv} PV
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
