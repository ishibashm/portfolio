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
  Wallet,
  BookOpen,
  ArrowRightLeft,
} from "lucide-react";
import {
  FIXED_COSTS,
  perUnitYen,
  totalMonthlyYen,
  unsetItems,
} from "@/lib/operatingCosts";

/**
 * アクセス状況（管理者専用）。
 *
 * 「利用者がいるのか」を確かめるための画面。数字の出どころは
 * page_views（PageViewBeacon が送る匿名の閲覧記録）と user_configs、
 * それにお気に入り・履歴・保存プランの件数。
 *
 * コンソール型の高密度レイアウト:
 *   上段  KPI カード 6 枚（数値大・ラベル小・前期間比の矢印・スパークライン）
 *   中段  日別 PV/UV の推移（折れ線）と、時間帯別（JST・直近 7 日）
 *         曜日 × 時間帯（JST・直近 30 日）
 *         ブログの効果検証（記事別・流入元・道具への到達率）
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

type UserRow = {
  email: string;
  createdAt: string | null;
  updatedAt: string;
  has: {
    birthDate: boolean;
    birthPlace: boolean;
    baseLocation: boolean;
    geminiKey: boolean;
  };
  presetCount: number;
  favorites: number;
  histories: number;
  simulations: number;
};

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
  externalApi: {
    status: "ok" | "error";
    message: string | null;
    sinceDay: string;
    totalCalls: number | null;
    totalEstimateYen: number | null;
    rows: {
      provider: string;
      model: string;
      route: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      untrackedCalls: number;
      estimateYen: number | null;
    }[];
  };
  gcpBilling: {
    status: "ok" | "unconfigured" | "error";
    invoiceMonth: string;
    currency: string | null;
    total: number | null;
    services: { service: string; amount: number }[];
    message: string | null;
  };
  today: { day: string; pv: number; uv: number };
  yesterday: { day: string; pv: number; uv: number };
  pv7: number;
  pvPrev7: number;
  pv30: number;
  pvPrev30: number;
  daily: { day: string; pv: number; uv: number }[];
  hourly: { hour: number; pv: number }[];
  /** 曜日 × 時間帯（直近30日）。記録のある枠だけ来る。dow は日曜が 0。 */
  weekdayHourly: { dow: number; hour: number; pv: number }[];
  /** 今日と昨日の日付（JST）。数え直さず、集計と同じものを使う。 */
  intradayToday: string;
  intradayYesterday: string;
  /** 今日と昨日の時間別。記録のある時刻だけ来る。 */
  intraday: { day: string; hour: number; pv: number; uv: number }[];
  topPaths: { path: string; pv: number; uv: number }[];
  topReferrers: { host: string; pv: number }[];
  devices: { device: string; pv: number; uv: number }[];
  blog: {
    index: { pv: number; uv: number };
    totals: { pv: number; uv: number };
    /** ブログ全体（一覧+記事）の日別。新しい順。 */
    daily: { day: string; pv: number; uv: number }[];
    /** 直近7日の日 × 記事の内訳。days は新しい順・0 埋め済み。 */
    recentBreakdown: {
      postColumns: { slug: string; title: string }[];
      days: {
        day: string;
        index: number;
        posts: Record<string, number>;
        other: number;
        total: number;
      }[];
    };
    posts: {
      slug: string;
      title: string;
      path: string;
      publishedAt: string;
      daysSincePublished: number;
      pv: number;
      uv: number;
    }[];
    referrers: { host: string; pv: number }[];
    funnel: {
      blogVisitDays: number;
      toolVisitDays: number;
      rate: number | null;
    };
  };
};

function formatYen(value: number | null, digits = 0): string {
  return value === null
    ? "未設定"
    : `¥${value.toLocaleString("ja-JP", { maximumFractionDigits: digits })}`;
}

function formatCurrency(value: number | null, currency: string | null): string {
  if (value === null) return "未設定";
  if (!currency) return value.toLocaleString("ja-JP");
  try {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "JPY" ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString("ja-JP")} ${currency}`;
  }
}

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

/**
 * 日別 PV / UV の推移。
 *
 * 以前は 1 日 1 本の横バーを 30 行並べていた。1 日ずつの値は読めるが、
 * **増えているのか減っているのかが読めない**。効果検証で見たいのは
 * 各日の絶対値ではなく傾きなので、時間を横軸に取る形に替える。
 *
 * recharts は使わない。この画面のためだけに読み込むには重く、
 * CLAUDE.md にあるとおり Tooltip の型が any を増やす。既存の
 * Sparkline と同じ手書きの SVG で足りる。
 *
 * preserveAspectRatio="none" で横に伸ばすので、線は
 * vectorEffect="non-scaling-stroke" が要る（無いと太さまで伸びる）。
 * 同じ理由で **SVG の中に文字を置かない**。目盛りは外の HTML で出す。
 */
function DailyChart({
  daily,
}: {
  daily: { day: string; pv: number; uv: number }[];
}) {
  // 応答は新しい順。左を古い日にする。
  const rows = [...daily].reverse();
  if (rows.length < 2) {
    return (
      <p className="text-sm text-stone-400">
        まだ推移を描けません（2日分から）。
      </p>
    );
  }

  const max = Math.max(1, ...rows.map((r) => r.pv), ...rows.map((r) => r.uv));
  const W = 100;
  const H = 40;
  const x = (i: number) => (i / (rows.length - 1)) * W;
  const y = (v: number) => H - (v / max) * H;
  const line = (pick: (r: (typeof rows)[number]) => number) =>
    rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(pick(r))}`).join(" ");
  const pvLine = line((r) => r.pv);

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-mono text-stone-400">
        <span>{max} PV</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-1.5 rounded-sm bg-emerald-400/70" />
            PV
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-[2px] bg-sky-500" />
            UV
          </span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-40 mt-1"
        role="img"
        aria-label="日別の PV と UV の推移"
      >
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={0}
            x2={W}
            y1={H * t}
            y2={H * t}
            stroke="currentColor"
            strokeWidth="1"
            className="text-stone-200"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={`${pvLine} L${W},${H} L0,${H} Z`}
          className="fill-emerald-400/25"
        />
        <path
          d={pvLine}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-emerald-500"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={line((r) => r.uv)}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="3 2"
          className="text-sky-500"
          vectorEffect="non-scaling-stroke"
        />
        {/* 値を読むための当たり判定。線ではなく面で拾う。 */}
        {rows.map((r, i) => (
          <rect
            key={r.day}
            x={x(i) - W / rows.length / 2}
            y={0}
            width={W / rows.length}
            height={H}
            fill="transparent"
          >
            <title>{`${r.day}　PV ${r.pv} / UV ${r.uv}`}</title>
          </rect>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] font-mono text-stone-400">
        <span>{rows[0].day}</span>
        <span>{rows[rows.length - 1].day}</span>
      </div>
    </div>
  );
}

/**
 * 今日 1 日の中の動き。昨日の同じ時刻と並べる。
 *
 * 「時間帯別（直近 7 日）」は 7 日ぶんを重ねた**いつもの傾向**で、
 * 今日どう増えているかは読めない（利用者の指摘）。ここは今日だけを見る。
 *
 * 昨日を薄い棒で後ろに置き、同じ時刻どうしで比べられるようにする。
 * 差は棒の下に出す。**まだ来ていない時刻は棒を描かない**（0 件なのか
 * 時刻が来ていないのかを取り違えないため）。
 *
 * 応答は記録のある時刻だけ来る。残りはここで 0 として埋める。
 */
function IntradayChart({
  rows,
  today,
  yesterday,
  nowHour,
}: {
  rows: { day: string; hour: number; pv: number; uv: number }[];
  today: string;
  yesterday: string;
  nowHour: number;
}) {
  const pick = (day: string) => {
    const map = new Map(
      rows.filter((r) => r.day === day).map((r) => [r.hour, r]),
    );
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      pv: map.get(h)?.pv ?? 0,
      uv: map.get(h)?.uv ?? 0,
    }));
  };

  const todayRows = pick(today);
  const yesterdayRows = pick(yesterday);
  const max = Math.max(
    1,
    ...todayRows.map((r) => r.pv),
    ...yesterdayRows.map((r) => r.pv),
  );

  const todaySum = todayRows.reduce((s, r) => s + r.pv, 0);
  // 昨日は「今の時刻まで」で切る。1 日ぶんと比べると必ず負けて見える。
  const yesterdaySoFar = yesterdayRows
    .filter((r) => r.hour <= nowHour)
    .reduce((s, r) => s + r.pv, 0);
  const diff = todaySum - yesterdaySoFar;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
        <span className="font-mono font-bold text-stone-700">
          今日 {todaySum} PV
        </span>
        <span className="font-mono text-stone-400">
          昨日の同じ時刻まで {yesterdaySoFar} PV
        </span>
        <span
          className={`font-mono font-bold ${
            diff > 0
              ? "text-emerald-600"
              : diff < 0
                ? "text-rose-600"
                : "text-stone-400"
          }`}
        >
          {diff > 0 ? `+${diff}` : diff}
        </span>
      </div>

      <div className="grid grid-cols-12 gap-1">
        {todayRows.map((r) => {
          const future = r.hour > nowHour;
          const prev = yesterdayRows[r.hour].pv;
          const delta = r.pv - prev;
          return (
            <div
              key={r.hour}
              className="flex flex-col items-center gap-0.5"
              title={`${r.hour}時: 今日 ${r.pv} PV / ${r.uv} UV・昨日 ${prev} PV`}
            >
              <div className="relative w-full h-16 bg-stone-50 rounded-sm overflow-hidden">
                {/* 昨日（薄い棒・後ろ） */}
                <div
                  className="absolute bottom-0 left-0 right-0 bg-stone-200"
                  style={{ height: `${(prev / max) * 100}%` }}
                />
                {/* 今日（濃い棒・手前）。まだ来ていない時刻は描かない。 */}
                {!future && (
                  <div
                    className="absolute bottom-0 left-1/4 right-1/4 bg-emerald-500"
                    style={{ height: `${(r.pv / max) * 100}%` }}
                  />
                )}
              </div>
              <div className="text-[8px] font-mono text-stone-400">
                {r.hour}
              </div>
              <div
                className={`text-[8px] font-mono ${
                  future
                    ? "text-stone-300"
                    : delta > 0
                      ? "text-emerald-600"
                      : delta < 0
                        ? "text-rose-500"
                        : "text-stone-300"
                }`}
              >
                {future ? "–" : delta > 0 ? `+${delta}` : delta}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 曜日 × 時間帯（直近30日）。
 *
 * 時間帯だけの 24 枠では「平日の昼なのか週末の夜なのか」が均されて
 * 消える。記事を出す曜日や告知の時間を決めるにはこちらが要る。
 *
 * 応答は記録のある枠だけ来る。168 枠の残りはここで 0 として埋める。
 */
function WeekdayHeatmap({
  cells,
}: {
  cells: { dow: number; hour: number; pv: number }[];
}) {
  const byKey = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.pv]));
  const max = Math.max(1, ...cells.map((c) => c.pv));

  if (cells.length === 0) {
    return <p className="text-sm text-stone-400">まだ記録がありません。</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="flex gap-[2px] pl-6 mb-[2px]">
          {Array.from({ length: 24 }, (_, h) => (
            <span
              key={h}
              className="flex-1 text-center text-[8px] font-mono text-stone-400"
            >
              {h % 3 === 0 ? h : ""}
            </span>
          ))}
        </div>
        {WEEKDAY_LABELS.map((label, dow) => (
          <div key={dow} className="flex items-center gap-[2px] mb-[2px]">
            <span className="w-6 text-[10px] font-mono text-stone-500">
              {label}
            </span>
            {Array.from({ length: 24 }, (_, h) => {
              const pv = byKey.get(`${dow}-${h}`) ?? 0;
              return (
                <div
                  key={h}
                  className="flex-1 h-4 rounded-[2px] border border-stone-100"
                  style={{
                    backgroundColor:
                      pv === 0
                        ? undefined
                        : `rgba(16, 185, 129, ${0.15 + (pv / max) * 0.65})`,
                  }}
                  title={`${label}曜 ${h}時: ${pv} PV`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const DEVICE_LABELS: Record<string, string> = {
  pc: "PC",
  mobile: "スマホ",
  tablet: "タブレット",
  unknown: "不明（記録開始前）",
};

/** 設定の有無を示す小さなバッジ。中身の生値はサーバが返さない。 */
function FlagBadge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${
        on
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-stone-50 text-stone-300 border-stone-200"
      }`}
    >
      {label}
    </span>
  );
}

export default function AdminMetricsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
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
    // ユーザー一覧は別口。集計が読めても一覧が落ちることはあり得るので、
    // 片方の失敗でもう片方を巻き込まない。
    fetch("/api/metrics/users")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setUsers(body.data.users);
      })
      .catch((e) =>
        setUsersError(
          e instanceof Error
            ? e.message
            : "ユーザー一覧を読み込めませんでした。",
        ),
      );
  }, []);

  const s = summary;
  const maxHour = Math.max(1, ...(s?.hourly.map((h) => h.pv) ?? []));

  /*
    いまが JST の何時か。今日の棒を「まだ来ていない時刻」まで描かない
    ために使う。0 件なのか時刻が来ていないのかを取り違えると、
    「今日は伸びていない」と読み違える。
  */
  const nowHourJst = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  const sparkAsc = s ? [...s.daily].reverse().map((d) => d.pv) : [];
  const devicePv = s?.devices.reduce((a, d) => a + d.pv, 0) ?? 0;
  const hourMap = new Map(s?.hourly.map((h) => [h.hour, h.pv]) ?? []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 p-4 md:p-8 font-sans">
      <div className="max-w-[1700px] mx-auto space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold font-serif text-stone-900">
              アクセス状況
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              直近30日。閲覧の記録は匿名で、日をまたいで同じ人を追えません。クローラは除外済み。管理者だけが見られます。
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* 記事の編集への導線。管理ページはどこからも遷移できない
                設計なので、管理ページ同士だけは行き来できるようにする */}
            <a
              href="/admin/blog"
              className="px-3.5 py-1.5 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-600 hover:bg-stone-50"
            >
              記事を編集する
            </a>
            {s && (
              <span className="text-[10px] font-mono text-stone-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                最新の閲覧: {relTime(s.latestViewAt)}
              </span>
            )}
          </div>
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

            {/* ── 経費 ──
                金額は lib/operatingCosts に置いてある。未設定のものは
                そう出す。推測した額を並べると、あとから見た人がそれを
                実額だと思い込む。 */}
            <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-stone-700 mb-3 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-stone-400" />
                運用の経費（固定費）
              </h2>

              {(() => {
                const total = totalMonthlyYen();
                const unset = unsetItems();
                return (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <KpiCard
                        label="月額合計"
                        value={formatYen(total)}
                        sub={
                          unset.length > 0
                            ? `${unset.length}件が未設定のため出せません`
                            : "固定費のみ"
                        }
                        subCls={unset.length > 0 ? "text-amber-600" : undefined}
                        icon={<Wallet className="w-4 h-4" />}
                      />
                      <KpiCard
                        label="年額換算"
                        value={formatYen(total === null ? null : total * 12)}
                        sub="月額 × 12"
                        icon={<Wallet className="w-4 h-4" />}
                      />
                      <KpiCard
                        label="登録者 1 人あたり"
                        value={formatYen(
                          perUnitYen(total, s.registeredUsers),
                          1,
                        )}
                        sub={`登録 ${s.registeredUsers} 人`}
                        icon={<Users className="w-4 h-4" />}
                      />
                      <KpiCard
                        label="1000PV あたり"
                        value={formatYen(perUnitYen(total, s.pv30, 1000), 1)}
                        sub={`30日 PV ${s.pv30}`}
                        icon={<Eye className="w-4 h-4" />}
                      />
                    </div>

                    <div className="divide-y divide-stone-100">
                      {FIXED_COSTS.map((c) => (
                        <div
                          key={c.key}
                          className="flex items-start justify-between gap-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-stone-700">
                              {c.label}
                            </div>
                            <div className="text-[10px] text-stone-400 leading-relaxed">
                              {c.note}
                            </div>
                          </div>
                          <div
                            className={`shrink-0 font-mono text-xs ${
                              c.monthlyYen === null
                                ? "text-amber-600"
                                : "text-stone-700"
                            }`}
                          >
                            {formatYen(c.monthlyYen)}
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="mt-3 text-[10px] leading-relaxed text-stone-400">
                      金額は <code>src/lib/operatingCosts.ts</code>{" "}
                      に書いてあります。実額が分かったものから埋めてください。
                      <strong className="text-amber-600">
                        推測の額は入れていません
                      </strong>
                      。0 円と「未設定」は別物として扱います。従量課金と GCP
                      請求実額は、下の別枠で表示します。
                    </p>
                  </>
                );
              })()}
            </section>

            <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-stone-700 mb-1 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-stone-400" />
                外部 API の従量（当月）
              </h2>
              <p className="text-[10px] text-stone-400 mb-3">
                {s.externalApi.sinceDay} 以降。成功して usage
                が返った呼び出しを集計。
              </p>

              {s.externalApi.status === "error" && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {s.externalApi.message}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 mb-4">
                <KpiCard
                  label="呼び出し回数"
                  value={
                    s.externalApi.totalCalls === null
                      ? "—"
                      : String(s.externalApi.totalCalls)
                  }
                  sub={
                    s.externalApi.totalCalls === null
                      ? "取得失敗"
                      : `${s.externalApi.rows.length} 経路`
                  }
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <KpiCard
                  label="推定額"
                  value={formatYen(s.externalApi.totalEstimateYen, 2)}
                  sub={
                    s.externalApi.totalEstimateYen === null
                      ? "未計測トークンあり／対象外モデル"
                      : "当月実績 × 公式単価（2026-08-13換算）"
                  }
                  subCls={
                    s.externalApi.totalEstimateYen === null
                      ? "text-amber-600"
                      : undefined
                  }
                  icon={<Wallet className="w-4 h-4" />}
                />
              </div>

              {s.externalApi.status === "ok" &&
              s.externalApi.rows.length === 0 ? (
                <p className="text-sm text-stone-400">まだ記録がありません。</p>
              ) : s.externalApi.rows.length > 0 ? (
                <div className="divide-y divide-stone-100">
                  {s.externalApi.rows.map((row) => (
                    <div
                      key={`${row.provider}:${row.model}:${row.route}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-stone-700">
                          {row.model}
                        </div>
                        <div className="text-[10px] text-stone-400 break-all">
                          {row.provider} · {row.route}
                        </div>
                        <div className="text-[10px] text-stone-400">
                          入力 {row.inputTokens.toLocaleString()} / 出力{" "}
                          {row.outputTokens.toLocaleString()} tokens
                          {row.untrackedCalls > 0 && (
                            <span className="ml-1 text-amber-600">
                              （未計測 {row.untrackedCalls} 回）
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-xs font-bold text-stone-700">
                          {row.calls} 回
                        </div>
                        <div
                          className={`font-mono text-[10px] ${
                            row.estimateYen === null
                              ? "text-amber-600"
                              : "text-stone-500"
                          }`}
                        >
                          {formatYen(row.estimateYen, 2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <p className="mt-3 text-[10px] leading-relaxed text-stone-400">
                単価は <code>src/lib/apiUsage.ts</code>
                {
                  " に置きます。価格表と円換算を確認できるまでは未設定のままにし、推測額は出しません。"
                }
              </p>
            </section>

            <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-stone-700 mb-1 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-stone-400" />
                GCP 請求実額（当月）
              </h2>
              <p className="text-[10px] text-stone-400 mb-3">
                請求月 {s.gcpBilling.invoiceMonth.slice(0, 4)}/
                {s.gcpBilling.invoiceMonth.slice(4)}。Billing Export の cost
                から credits を差し引いた対象プロジェクトの実額。
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <KpiCard
                  label="請求実額"
                  value={formatCurrency(
                    s.gcpBilling.total,
                    s.gcpBilling.currency,
                  )}
                  sub={
                    s.gcpBilling.status === "ok"
                      ? `${s.gcpBilling.services.length} サービス`
                      : (s.gcpBilling.message ?? "未設定")
                  }
                  subCls={
                    s.gcpBilling.status === "ok" ? undefined : "text-amber-600"
                  }
                  icon={<Wallet className="w-4 h-4" />}
                />
                <KpiCard
                  label="取得状態"
                  value={
                    s.gcpBilling.status === "ok"
                      ? "取得済み"
                      : s.gcpBilling.status === "unconfigured"
                        ? "未設定"
                        : "取得失敗"
                  }
                  sub="Cloud Billing Export → BigQuery"
                  subCls={
                    s.gcpBilling.status === "ok"
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }
                  icon={<Wallet className="w-4 h-4" />}
                />
              </div>

              {s.gcpBilling.services.length > 0 && (
                <div className="divide-y divide-stone-100">
                  {s.gcpBilling.services.map((item) => (
                    <div
                      key={item.service}
                      className="flex items-center justify-between gap-3 py-2 text-xs"
                    >
                      <span className="font-bold text-stone-700">
                        {item.service}
                      </span>
                      <span className="font-mono text-stone-600">
                        {formatCurrency(item.amount, s.gcpBilling.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-3 text-[10px] leading-relaxed text-stone-400">
                Cloud Billing API は実額を返さないため、Standard usage cost の
                BigQuery export を読みます。未設定時は通信せず、0
                円とは区別します。
              </p>
            </section>

            {/* ── 中段: 日別と時間帯別 ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <section className="lg:col-span-2 bg-white/90 border border-stone-200 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-stone-700 mb-1">
                  日別の PV / UV（30日）
                </h2>
                <p className="text-[10px] text-stone-400 mb-3">
                  升目に触れるとその日の値が出ます。
                </p>
                {s.daily.length === 0 ? (
                  <p className="text-sm text-stone-400">
                    まだ記録がありません。
                  </p>
                ) : (
                  <DailyChart daily={s.daily} />
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

            {/*
              今日 1 日の中の動き。上の「時間帯別（直近 7 日）」は
              いつもの傾向で、今日どう増えているかは読めない。
            */}
            <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-stone-700 mb-1">
                今日の時間別（JST・昨日と比較）
              </h2>
              <p className="text-[10px] text-stone-400 mb-3">
                {
                  "濃い棒が今日、薄い棒が昨日の同じ時刻。下の数字は昨日との差。まだ来ていない時刻は棒を描きません。"
                }
              </p>
              <IntradayChart
                rows={s.intraday}
                today={s.intradayToday}
                yesterday={s.intradayYesterday}
                nowHour={nowHourJst}
              />
            </section>

            <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-stone-700 mb-1">
                曜日 × 時間帯（JST・直近30日）
              </h2>
              <p className="text-[10px] text-stone-400 mb-3">
                濃いほど多い。左の 24 枠は 7 日ぶんなので「今」を、こちらは 30
                日ぶんなので「平日の昼か週末の夜か」を見るためのもの。
              </p>
              <WeekdayHeatmap cells={s.weekdayHourly} />
            </section>

            {/* ── ブログの効果検証 ── */}
            <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-stone-700 mb-1 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-stone-400" />
                ブログの効果検証（30日）
              </h2>
              <p className="text-[10px] text-stone-400 mb-4">
                記事は読まれているか、読んだ人が道具まで来ているか。
                <span className="text-amber-600">
                  到達率は同じ日に両方を見た割合です。
                </span>
                閲覧の記録は日をまたいで同じ人を追えないので、「記事を読んで後日また来て使った」は測れません。実際より低く出ます。
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <KpiCard
                  label="記事 PV"
                  value={s.blog.totals.pv.toLocaleString()}
                  sub={`UV ${s.blog.totals.uv}`}
                  icon={<BookOpen className="w-4 h-4" />}
                />
                <KpiCard
                  label="一覧 PV"
                  value={s.blog.index.pv.toLocaleString()}
                  sub={`UV ${s.blog.index.uv}`}
                  icon={<Eye className="w-4 h-4" />}
                />
                <KpiCard
                  label="サイト全体に占める割合"
                  value={
                    s.pv30 === 0
                      ? "—"
                      : `${Math.round(((s.blog.totals.pv + s.blog.index.pv) / s.pv30) * 100)}%`
                  }
                  sub={`全体 ${s.pv30} PV`}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <KpiCard
                  label="道具への到達率"
                  value={
                    s.blog.funnel.rate === null
                      ? "—"
                      : `${Math.round(s.blog.funnel.rate * 100)}%`
                  }
                  sub={`${s.blog.funnel.toolVisitDays} / ${s.blog.funnel.blogVisitDays} 人日`}
                  icon={<ArrowRightLeft className="w-4 h-4" />}
                />
              </div>

              {/* ── 1日の動きと内訳 ──
                  30日合計だけだと「昨日動きがあったのか」「いま何が
                  読まれているのか」が読めない、という指摘への答え。
                  左が動き（折れ線・30日）、右がその内訳（直近7日 ×
                  記事）。内訳は記録の無い日も 0 の行で出す。行が抜けると
                  「記録が無い」と「0 だった」の区別がつかない。 */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
                <div className="lg:col-span-2 rounded-xl border border-stone-200 bg-white/60 p-4">
                  <h3 className="text-xs font-bold text-stone-600 mb-2">
                    ブログの日別 PV / UV（30日）
                  </h3>
                  {s.blog.daily.length === 0 ? (
                    <p className="text-sm text-stone-400">
                      まだ記録がありません。
                    </p>
                  ) : (
                    <DailyChart daily={s.blog.daily} />
                  )}
                </div>

                <div className="rounded-xl border border-stone-200 bg-white/60 p-4 overflow-x-auto">
                  <h3 className="text-xs font-bold text-stone-600 mb-2">
                    直近7日の内訳
                  </h3>
                  <table className="w-full text-[11px] font-mono">
                    <thead className="text-[9px] text-stone-400">
                      <tr className="border-b border-stone-200">
                        <th className="py-1 pr-2 text-left font-bold">日付</th>
                        <th className="py-1 px-1.5 text-right font-bold">
                          一覧
                        </th>
                        {s.blog.recentBreakdown.postColumns.map((c) => (
                          <th
                            key={c.slug}
                            className="py-1 px-1.5 text-right font-bold max-w-[72px] truncate"
                            title={c.title}
                          >
                            {c.title}
                          </th>
                        ))}
                        <th className="py-1 px-1.5 text-right font-bold">他</th>
                        <th className="py-1 pl-1.5 text-right font-bold">計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.blog.recentBreakdown.days.map((row) => (
                        <tr
                          key={row.day}
                          className="border-b border-stone-100 last:border-0"
                        >
                          <td className="py-1 pr-2 text-stone-500">
                            {row.day.slice(5)}
                          </td>
                          <td className="py-1 px-1.5 text-right text-stone-600">
                            {row.index}
                          </td>
                          {s.blog.recentBreakdown.postColumns.map((c) => (
                            <td
                              key={c.slug}
                              className="py-1 px-1.5 text-right text-stone-700"
                            >
                              {row.posts[c.slug] ?? 0}
                            </td>
                          ))}
                          <td className="py-1 px-1.5 text-right text-stone-400">
                            {row.other}
                          </td>
                          <td className="py-1 pl-1.5 text-right font-bold text-stone-800">
                            {row.total}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[9px] text-stone-400 leading-relaxed">
                    列は直近7日で読まれた順に3本まで。残りは「他」です。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2">
                  <h3 className="text-xs font-bold text-stone-600 mb-2">
                    記事別
                  </h3>
                  {s.blog.posts.length === 0 ? (
                    <p className="text-sm text-stone-400">記事がありません。</p>
                  ) : (
                    <div className="space-y-1">
                      {s.blog.posts.map((post) => (
                        <div
                          key={post.slug}
                          className="flex items-center gap-2 py-1 text-xs"
                        >
                          <a
                            href={post.path}
                            className="w-56 xl:w-80 truncate text-stone-600 hover:text-rose-600 hover:underline"
                            title={`${post.title}（${post.path}）`}
                          >
                            {post.title}
                          </a>
                          <span className="w-16 text-right font-mono text-[10px] text-stone-400">
                            {post.daysSincePublished}日前
                          </span>
                          <div className="flex-1 h-3 bg-stone-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-emerald-400/70"
                              style={{
                                width: `${(post.pv / Math.max(1, s.blog.posts[0].pv)) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="w-10 text-right font-mono text-stone-700">
                            {post.pv}
                          </span>
                          <span className="w-14 text-right font-mono text-[10px] text-stone-400">
                            UV {post.uv}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-[10px] text-stone-400">
                    公開中の記事は PV が 0
                    でも並びます。一覧から消すと「読まれていない」が見えなくなるためです。
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-stone-600 mb-2">
                    記事への流入元
                  </h3>
                  {s.blog.referrers.length === 0 ? (
                    <p className="text-sm text-stone-400">
                      外部からの流入はまだありません。
                    </p>
                  ) : (
                    s.blog.referrers.map((r) => (
                      <BarRow
                        key={r.host}
                        label={r.host}
                        value={r.pv}
                        max={s.blog.referrers[0].pv}
                      />
                    ))
                  )}
                  <p className="mt-2 text-[10px] text-stone-400">
                    サイト内の移動は記録していないので、ここに出るのは外部からの流入だけです。
                  </p>
                </div>
              </div>
            </section>

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

            {/* ── 登録ユーザーの一覧 ── */}
            <section className="bg-white/90 border border-stone-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-stone-700 mb-1">
                登録ユーザーの一覧
              </h2>
              <p className="text-[10px] text-stone-400 mb-3">
                自分以外のアカウントが居るかを確かめるための一覧です。設定の中身（生年月日・座標・APIキー）はサーバが返さず、有無だけをバッジで出します。
              </p>
              {usersError && (
                <p className="text-sm text-rose-700">{usersError}</p>
              )}
              {!users && !usersError && (
                <p className="text-sm text-stone-400">読み込んでいます…</p>
              )}
              {users && users.length === 0 && (
                <p className="text-sm text-stone-400">
                  設定を保存したユーザーはまだいません。
                </p>
              )}
              {users && users.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] text-stone-400 border-b border-stone-200">
                        <th className="py-1.5 pr-3 font-bold">メール</th>
                        <th className="py-1.5 pr-3 font-bold">登録</th>
                        <th className="py-1.5 pr-3 font-bold">最終保存</th>
                        <th className="py-1.5 pr-3 font-bold">設定</th>
                        <th className="py-1.5 pr-2 font-bold text-right">★</th>
                        <th className="py-1.5 pr-2 font-bold text-right">
                          履歴
                        </th>
                        <th className="py-1.5 font-bold text-right">プラン</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr
                          key={u.email}
                          className="border-b border-stone-100 last:border-0"
                        >
                          <td className="py-1.5 pr-3 font-mono text-stone-700 break-all">
                            {u.email}
                          </td>
                          <td
                            className="py-1.5 pr-3 font-mono text-stone-500 whitespace-nowrap"
                            title={u.createdAt ?? undefined}
                          >
                            {u.createdAt
                              ? u.createdAt.slice(0, 10)
                              : "記録開始前"}
                          </td>
                          <td
                            className="py-1.5 pr-3 font-mono text-stone-500 whitespace-nowrap"
                            title={u.updatedAt}
                          >
                            {relTime(u.updatedAt)}
                          </td>
                          <td className="py-1.5 pr-3">
                            <span className="flex flex-wrap gap-1">
                              <FlagBadge
                                on={u.has.birthDate}
                                label="生年月日"
                              />
                              <FlagBadge
                                on={u.has.baseLocation}
                                label="出発地"
                              />
                              <FlagBadge on={u.has.birthPlace} label="出生地" />
                              <FlagBadge
                                on={u.presetCount > 0}
                                label={`ﾌﾟﾘｾｯﾄ${u.presetCount}`}
                              />
                              <FlagBadge on={u.has.geminiKey} label="APIｷｰ" />
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 font-mono text-right text-stone-700">
                            {u.favorites}
                          </td>
                          <td className="py-1.5 pr-2 font-mono text-right text-stone-700">
                            {u.histories}
                          </td>
                          <td className="py-1.5 font-mono text-right text-stone-700">
                            {u.simulations}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
