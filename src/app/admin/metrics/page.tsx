"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Users,
  Eye,
  TrendingUp,
  Clock,
  Monitor,
  Star,
} from "lucide-react";

/**
 * アクセス状況（管理者専用）。
 *
 * 「利用者がいるのか」を確かめるための画面。数字の出どころは
 * page_views（PageViewBeacon が送る匿名の閲覧記録）と user_configs、
 * それにお気に入り・履歴・保存プランの件数。
 *
 * コンソール型の高密度レイアウト:
 *   上段  KPI カード 6 枚（数値大・ラベル小・前期間比の矢印・スパークライン）
 *   中段  日別 PV/UV と、時間帯別（JST・直近 7 日）
 *   下段  ページ別 / 参照元 / デバイス別 / 登録ユーザーの内訳
 *
 * このサイトの計測は匿名で、日をまたいで同じ人を追えない（visitor_hash に
 * 日付を混ぜてある）。だから DAU 系の「同じ人が戻ってきたか」は構造的に
 * 出せない。ここに無い指標（リテンション・プラン別・ログイン履歴など）は
 * 出し忘れではなく、データを持たないことを選んだ結果。
 *
 * ページ自体は middleware（/admin が nonCoreRoutes に入っている）が、
 * API は denyUnlessAdmin が守る。この画面は読むだけで何も書かない。
 */

type Summary = {
  sinceDay: string;
  generatedAt: string;
  latestViewAt: string | null;
  registeredUsers: number;
  usersSaved7d: number;
  usersSaved30d: number;
  newUsers: {
    today: number;
    last7: number;
    last30: number;
    beforeTracking: number;
  };
  usage: { favorites: number; histories: number; simulations: number };
  today: { day: string; pv: number; uv: number };
  yesterday: { day: string; pv: number; uv: number };
  pv7: number;
  pvPrev7: number;
  pv30: number;
  pvPrev30: number;
  daily: { day: string; pv: number; uv: number }[];
  hourly: { hour: number; pv: number }[];
  topPaths: { path: string; pv: number; uv: number }[];
  topReferrers: { host: string; pv: number }[];
  devices: { device: string; pv: number; uv: number }[];
};

/** 「3分前」形式。管理画面は毎日見るものなので、絶対時刻より先に出す。 */
function relTime(iso: string | null): string {
  if (!iso) return "記録なし";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

/** 前期間比。増減の向きと割合。前期間が 0 のときは比を出さない（無限大を見せない）。 */
function delta(cur: number, prev: number): { text: string; cls: string } {
  if (prev === 0) {
    return cur > 0
      ? { text: "新規", cls: "text-emerald-600" }
      : { text: "±0", cls: "text-stone-400" };
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct > 0) return { text: `▲ +${pct}%`, cls: "text-emerald-600" };
  if (pct < 0) return { text: `▼ ${pct}%`, cls: "text-rose-500" };
  return { text: "±0%", cls: "text-stone-400" };
}

/** カード内の小さな折れ線。values は古い順。 */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - (v / max) * 24}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="w-full h-7 mt-1"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-emerald-400/80"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function KpiCard({
  label,
  value,
  sub,
  subCls,
  icon,
  spark,
}: {
  label: string;
  value: string;
  sub?: string;
  subCls?: string;
  icon: React.ReactNode;
  spark?: number[];
}) {
  return (
    <div className="bg-white/90 border border-stone-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
          {label}
        </span>
        <span className="text-stone-300">{icon}</span>
      </div>
      <div className="mt-1 text-2xl font-black font-mono tracking-tight text-stone-800">
        {value}
      </div>
      {sub && (
        <div
          className={`text-[11px] font-mono mt-0.5 ${subCls ?? "text-stone-400"}`}
        >
          {sub}
        </div>
      )}
      {spark && <Sparkline values={spark} />}
    </div>
  );
}

/** 横バー付きの行。テーブルの 1 行に数値とシェアを同時に見せる。 */
function BarRow({
  label,
  value,
  max,
  extra,
}: {
  label: string;
  value: number;
  max: number;
  extra?: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <span
        className="w-40 sm:w-48 truncate font-mono text-stone-600"
        title={label}
      >
        {label}
      </span>
      <div className="flex-1 h-3 bg-stone-100 rounded overflow-hidden">
        <div
          className="h-full bg-emerald-400/70"
          style={{ width: `${(value / Math.max(1, max)) * 100}%` }}
        />
      </div>
      <span className="w-12 text-right font-mono text-stone-700">{value}</span>
      {extra && (
        <span className="w-14 text-right font-mono text-[10px] text-stone-400">
          {extra}
        </span>
      )}
    </div>
  );
}

const DEVICE_LABELS: Record<string, string> = {
  pc: "PC",
  mobile: "スマホ",
  tablet: "タブレット",
  unknown: "不明（記録開始前）",
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

  const s = summary;
  const maxPv = Math.max(1, ...(s?.daily.map((d) => d.pv) ?? []));
  const maxHour = Math.max(1, ...(s?.hourly.map((h) => h.pv) ?? []));
  const sparkAsc = s ? [...s.daily].reverse().map((d) => d.pv) : [];
  const devicePv = s?.devices.reduce((a, d) => a + d.pv, 0) ?? 0;
  const hourMap = new Map(s?.hourly.map((h) => [h.hour, h.pv]) ?? []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 p-4 md:p-8 font-sans">
      <div className="max-w-[1200px] mx-auto space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold font-serif text-stone-900">
              アクセス状況
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              直近30日。閲覧の記録は匿名で、日をまたいで同じ人を追えません。クローラは除外済み。管理者だけが見られます。
            </p>
          </div>
          {s && (
            <span className="text-[10px] font-mono text-stone-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              最新の閲覧: {relTime(s.latestViewAt)}
            </span>
          )}
        </header>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}

        {!s && !error && (
          <div className="flex items-center gap-2 text-stone-400 text-sm p-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            集計しています…
          </div>
        )}

        {s && (
          <>
            {/* ── 上段: KPI カード ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <KpiCard
                label="今日の PV / UV"
                value={`${s.today.pv} / ${s.today.uv}`}
                sub={`昨日 ${s.yesterday.pv} ${delta(s.today.pv, s.yesterday.pv).text}`}
                subCls={delta(s.today.pv, s.yesterday.pv).cls}
                icon={<Eye className="w-4 h-4" />}
              />
              <KpiCard
                label="7日 PV"
                value={String(s.pv7)}
                sub={`前週 ${s.pvPrev7} ${delta(s.pv7, s.pvPrev7).text}`}
                subCls={delta(s.pv7, s.pvPrev7).cls}
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <KpiCard
                label="30日 PV"
                value={String(s.pv30)}
                sub={`前期間 ${s.pvPrev30} ${delta(s.pv30, s.pvPrev30).text}`}
                subCls={delta(s.pv30, s.pvPrev30).cls}
                icon={<TrendingUp className="w-4 h-4" />}
                spark={sparkAsc}
              />
              <KpiCard
                label="登録ユーザー"
                value={String(s.registeredUsers)}
                sub={`新規 今日${s.newUsers.today} / 7日${s.newUsers.last7} / 30日${s.newUsers.last30}`}
                icon={<Users className="w-4 h-4" />}
              />
              <KpiCard
                label="設定を保存した人"
                value={`${s.usersSaved7d} / ${s.usersSaved30d}`}
                sub="7日 / 30日（ログイン記録は持たないので保存が代理）"
                icon={<Users className="w-4 h-4" />}
              />
              <KpiCard
                label="機能の利用量"
                value={String(
                  s.usage.favorites + s.usage.histories + s.usage.simulations,
                )}
                sub={`★${s.usage.favorites} 履歴${s.usage.histories} プラン${s.usage.simulations}`}
                icon={<Star className="w-4 h-4" />}
              />
            </div>

            {/* ── 中段: 日別と時間帯別 ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <section className="lg:col-span-2 bg-white/90 border border-stone-200 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-stone-700 mb-3">
                  日別の PV / UV
                </h2>
                {s.daily.length === 0 ? (
                  <p className="text-sm text-stone-400">
                    まだ記録がありません。
                  </p>
                ) : (
                  <div className="space-y-1">
                    {s.daily.map((d) => (
                      <div
                        key={d.day}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="w-20 font-mono text-stone-500">
                          {d.day.slice(5)}
                        </span>
                        <div className="flex-1 h-4 bg-stone-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-emerald-400/70"
                            style={{ width: `${(d.pv / maxPv) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono text-stone-700">
                          {d.pv}
                        </span>
                        <span className="w-14 text-right font-mono text-[10px] text-stone-400">
                          UV {d.uv}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-stone-700 mb-1">
                  時間帯別（JST・直近7日）
                </h2>
                <p className="text-[10px] text-stone-400 mb-3">
                  濃いほど多い。いつ見られているか。
                </p>
                <div className="grid grid-cols-6 gap-1">
                  {Array.from({ length: 24 }, (_, h) => {
                    const pv = hourMap.get(h) ?? 0;
                    const alpha = pv === 0 ? 0 : 0.15 + (pv / maxHour) * 0.65;
                    return (
                      <div
                        key={h}
                        className="rounded p-1 text-center border border-stone-100"
                        style={{
                          backgroundColor: `rgba(16, 185, 129, ${alpha})`,
                        }}
                        title={`${h}時: ${pv} PV`}
                      >
                        <div className="text-[9px] font-mono text-stone-500">
                          {h}時
                        </div>
                        <div className="text-[11px] font-mono font-bold text-stone-700">
                          {pv}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* ── 下段: 内訳 ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-stone-700 mb-3">
                  よく見られたページ（30日）
                </h2>
                {s.topPaths.length === 0 ? (
                  <p className="text-sm text-stone-400">
                    まだ記録がありません。
                  </p>
                ) : (
                  s.topPaths.map((p) => (
                    <BarRow
                      key={p.path}
                      label={p.path}
                      value={p.pv}
                      max={s.topPaths[0].pv}
                      extra={`UV ${p.uv}`}
                    />
                  ))
                )}
              </section>

              <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-stone-700 mb-3">
                  参照元（外部サイトのみ・30日）
                </h2>
                {s.topReferrers.length === 0 ? (
                  <p className="text-sm text-stone-400">
                    外部サイトからの流入はまだありません。
                  </p>
                ) : (
                  s.topReferrers.map((r) => (
                    <BarRow
                      key={r.host}
                      label={r.host}
                      value={r.pv}
                      max={s.topReferrers[0].pv}
                    />
                  ))
                )}
              </section>

              <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-stone-700 mb-1 flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-stone-400" />
                  デバイス別（30日）
                </h2>
                <p className="text-[10px] text-stone-400 mb-3">
                  UA から PC / スマホ / タブレットの3値だけを記録。UA
                  そのものは保存していません。
                </p>
                {s.devices.length === 0 ? (
                  <p className="text-sm text-stone-400">
                    まだ記録がありません。
                  </p>
                ) : (
                  s.devices.map((d) => (
                    <BarRow
                      key={d.device}
                      label={DEVICE_LABELS[d.device] ?? d.device}
                      value={d.pv}
                      max={s.devices[0].pv}
                      extra={
                        devicePv > 0
                          ? `${Math.round((d.pv / devicePv) * 100)}%`
                          : undefined
                      }
                    />
                  ))
                )}
              </section>

              <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-stone-700 mb-3">
                  登録ユーザーの内訳
                </h2>
                <dl className="text-xs space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-stone-500">
                      設定を保存したことのある人（総数）
                    </dt>
                    <dd className="font-mono font-bold">{s.registeredUsers}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-stone-500">うち登録日の記録がある人</dt>
                    <dd className="font-mono">
                      {s.registeredUsers - s.newUsers.beforeTracking}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-stone-500">うち記録開始前からいる人</dt>
                    <dd className="font-mono">{s.newUsers.beforeTracking}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-stone-500">
                      直近7日に設定を保存した人
                    </dt>
                    <dd className="font-mono">{s.usersSaved7d}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-stone-500">
                      直近30日に設定を保存した人
                    </dt>
                    <dd className="font-mono">{s.usersSaved30d}</dd>
                  </div>
                </dl>
                <p className="text-[10px] text-stone-400 mt-3 leading-relaxed">
                  Supabase Auth
                  の全アカウント数ではなく、設定を保存したことのある人の数です。ログイン履歴・プラン・権限のような項目はこのサイトにはありません（データを持たないことを選んでいます）。
                </p>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
