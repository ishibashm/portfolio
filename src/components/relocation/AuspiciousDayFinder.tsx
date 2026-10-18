"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import { ProfilePicker } from "@/components/profile/ProfilePicker";
import { SavedAnalysisPanel } from "@/components/relocation/SavedAnalysisPanel";
import { buildTimingReport } from "@/lib/timingReport";
import {
  loadSettings,
  readSettingsSync,
  settingString,
  settingNumber,
  writeLocalSettings,
  type Settings,
} from "@/lib/userSettings";
import { KYUSEI } from "@/utils/kigaku";
import {
  BirthYearPicker,
  MonthDayPicker,
  OriginChooser,
  DateChips,
  type PickedOrigin,
} from "@/components/inputs/QuickChoices";
import { Loader2, CalendarCheck, ArrowRight, Layers, Star } from "lucide-react";
import Link from "next/link";
import { saveWorkingDate } from "@/lib/workingDate";
import {
  favoriteDayKey,
  favoriteDaysSnapshot,
  parseFavoriteDays,
  subscribeFavoriteDays,
  toggleFavoriteDay,
} from "@/lib/favoriteDays";
import {
  ALL_DIRECTIONS,
  DIRECTION_LABELS,
} from "@/utils/auspiciousDays";
import {
  isTenchusatsuMode,
  DEFAULT_TENCHUSATSU_MODE,
  TENCHUSATSU_MODES,
} from "@/utils/tenchusatsuPolicy";
import { getAuspiciousDayErrorMessage } from "@/lib/auspiciousDayErrors";
import { directionLabelName } from "@/lib/directionLabels";
import { TIER_LABELS, type DayTier } from "@/utils/dayTier";
import { CountUp } from "@/components/motion/CountUp";
import { Burst } from "@/components/motion/Burst";
import {
  DEFAULT_DAY_FILTER,
  filterDays,
  isFiltering,
  monthLabel,
  monthsOf,
  type DayFilter,
} from "@/utils/auspiciousDayFilter";

/**
 * 「年盤・月盤・日盤がすべて吉になる日」を列挙するパネル。
 *
 * これまで三盤の重ね合わせはヒートマップを目で追うしかなく、
 * 「今日から立春までに何日あるのか」「そのうちどれが天赦日か」を
 * 日付として取り出せなかった。引越し業者の予約や契約日の調整は
 * 日付が確定して初めて動かせるので、そこに接続できる形で出す。
 *
 * 天中殺で落ちる日も消さずに印を付ける。落とした結果だけを見せると
 * 「天中殺を勘定に入れるかどうかで何日変わるのか」が分からなくなり、
 * その判断自体ができない。
 */

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 最初に出す行数。
 *
 * 99 行を一度に出すと、次の方位まで画面を延々とめくることになる。
 * ただし**黙って切らない。**残りの件数をボタンに書いて、押せば全部出す。
 */
const INITIAL_ROWS = 20;

/*
  状態の呼び名は @/lib/directionLabels に集約。**ここに表を戻さないこと。**

  ここに手元の表があったので、同じ状態が画面をまたぐと別の名前になっていた。

    NOISE_VOID   ここ「空亡」    / 地図・履歴・シミュレータ「天中殺方位」
    NOISE_NODE   ここ「月交点」  / 同「羅睺・計都軸」
    NOISE_HA     ここ「歳破/月破」/ 同「歳破/月破/日破」（日盤も並べる表なのに
                 日破が抜けていた）
    SAFE         ここ「平」      / 同「平穏」

  さらに未知の状態が来ると `?? s` で NOISE_XXX という内部コードを
  そのまま画面に出していた。集約先は「判定なし」に落とす。
*/
const label = directionLabelName;

/*
  三盤の方位盤（立体は three.js）。WebGL の有無を見て立体か平面かを決める
  ので、サーバーでは描かない（ssr: false）。three.js は盤の部品が画面に
  入ってから読み込む（ThreeBoardStack の中）。
*/
const ThreeBoardStack = dynamic(
  () => import("@/components/relocation/ThreeBoardStack"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-3xl border border-stone-200 bg-stone-50 p-6 text-sm text-stone-500">
        三盤の方位盤を読み込んでいます…
      </div>
    ),
  },
);

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface DayVerdict {
  date: string;
  weekday: number;
  yearLayer: string;
  monthLayer: string;
  dayLayer: string;
  blockedByTenchusatsu: boolean;
  voidScopes: { year: boolean; month: boolean; day: boolean };
  tags: string[];
  /** 段階（S〜C）。scope=noBad で呼んだときに付く */
  tier?: DayTier;
}

interface Summary {
  direction: string;
  directionLabel: string;
  scannedDays: number;
  tripleAuspiciousDays: number;
  availableDays: number;
  blockedByTenchusatsuDays: number;
  /** 凶の無い日（S〜C）の数。scope=noBad で呼んだときに付く */
  noBadDays?: number;
  availableNoBadDays?: number;
  window: {
    yearBoardValidUntil: string | null;
    afterYearBoardStatus: string | null;
  };
  days: DayVerdict[];
}

/** 保存座標の表示精度は従来どおり小数 4 桁にそろえる。 */
function toInputCoord(v: unknown): string {
  if (v == null || (typeof v === "string" && !v.trim())) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 10000) / 10000);
}

const choiceClass =
  "rounded-lg border px-3 py-2 text-sm aria-pressed:bg-rose-100 aria-pressed:border-rose-500";

export function AuspiciousDayFinder() {
  const [birthDate, setBirthDate] = useState("");
  const [lon, setLon] = useState("");
  // スキャナーへ引き継ぐために緯度も持つ。方位の判定は経度だけで足りるが、
  // 物件を出すには出発地の座標が要る。
  const [lat, setLat] = useState("");
  const [direction, setDirection] = useState("all");
  const [tenchusatsuMode, setTenchusatsuMode] = useState<string>(
    DEFAULT_TENCHUSATSU_MODE,
  );
  const [from, setFrom] = useState(todayString());
  /* 三盤の方位盤で見る日。日取りの表の「盤」で切り替える */
  const [boardDate, setBoardDate] = useState(todayString());
  const boardRef = useRef<HTMLDivElement>(null);
  const showBoard = (date: string) => {
    setBoardDate(date);
    boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [months, setMonths] = useState(12);

  const [birthYear, setBirthYear] = useState("");
  const [editingBirth, setEditingBirth] = useState(false);
  const [baseLabel, setBaseLabel] = useState("");
  const [editingOrigin, setEditingOrigin] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  const [resolvingOrigin, setResolvingOrigin] = useState(false);
  const profileRevision = useRef(0);
  const originRequest = useRef(0);
  const missing = [
    !birthDate && "生年月日を選んでください",
    (!lat || !lon) && "出発地を選んでください",
    !from && "開始日を選んでください",
  ]
    .filter(Boolean)
    .join("。 ");

  /*
    12 ヶ月で走査すると 1 方位で 99 日、8 方位で 500 日を超える表になる
    （実測）。日付が並んでいるだけでは「いつにするか」を選べない、と
    利用者から指摘を受けている。

    **既定では 1 件も落とさない。**このパネルは元々「天中殺で落ちる日も
    消さずに印を付ける」方針で、落とした結果だけを見せると天中殺を勘定に
    入れるかどうかで何日変わるのかが分からなくなる。減らしたい人が選ぶ。
  */
  const [filter, setFilter] = useState<DayFilter>(DEFAULT_DAY_FILTER);
  /** 方位ごとに、最初は先頭だけ出す。押した方位だけ全部出す。 */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  /* お気に入り（lib/favoriteDays。端末の localStorage だけ）。
     日付 × 方位で持つので、☆ は行ごとに点く */
  const favoriteRaw = useSyncExternalStore(
    subscribeFavoriteDays,
    favoriteDaysSnapshot,
    () => "",
  );
  // 三盤吉（段階 S）の日を ☆ に残した瞬間だけ、金の線を弾けさせる。
  const [burst, setBurst] = useState<{ key: string; n: number } | null>(null);
  const favoriteKeys = new Set(
    parseFavoriteDays(favoriteRaw).map((f) =>
      favoriteDayKey(f.date, f.direction),
    ),
  );
  const [meta, setMeta] = useState<{ honmeiStar?: number; voidZodiacs?: string[] }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 他の画面で保存済みの設定を初期値にする。ここで入れ直させると、
  // 別画面の判定と違う前提で日付を出してしまう。
  useEffect(() => {
    readSaved();
    const query = new URLSearchParams(window.location.search);
    const dir = query.get("direction");
    if (dir && (dir === "all" || ALL_DIRECTIONS.some((d) => d === dir)))
      setDirection(dir);
    const date = query.get("targetDate");
    if (
      date &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date
    )
      setFrom(date);
    const mode = query.get("tenchusatsuMode");
    if (mode && isTenchusatsuMode(mode)) setTenchusatsuMode(mode);
    const pendingProfile = profileRevision;
    const pendingOrigin = originRequest;
    return () => {
      pendingProfile.current++;
      pendingOrigin.current++;
    };
  }, []);

  // 遅れて届いた設定が、選択中の値や切り替えたプロフィールを戻さないようにする。
  function readSaved() {
    const revision = ++profileRevision.current;
    originRequest.current++;
    setResolvingOrigin(false);
    const apply = (c: Settings) => {
      if (revision !== profileRevision.current) return;
      const birth = settingString(c, "birth_date") ?? "";
      setBirthDate(birth);
      setBirthYear(birth.slice(0, 4));
      setEditingBirth(false);
      setLon(
        toInputCoord(
          settingNumber(c, "base_lon") ?? settingString(c, "base_lon"),
        ),
      );
      setLat(
        toInputCoord(
          settingNumber(c, "base_lat") ?? settingString(c, "base_lat"),
        ),
      );
      setBaseLabel(settingString(c, "base_label") ?? "");
      setEditingOrigin(false);
      const urlMode = new URLSearchParams(window.location.search).get(
        "tenchusatsuMode",
      );
      const savedMode = settingString(c, "tenchusatsu_mode");
      if (
        !(urlMode && isTenchusatsuMode(urlMode)) &&
        savedMode &&
        isTenchusatsuMode(savedMode)
      )
        setTenchusatsuMode(savedMode);
    };
    apply(readSettingsSync());
    loadSettings()
      .then(({ settings }) => apply(settings))
      .catch(() => {});
  }

  async function pickOrigin(origin: PickedOrigin) {
    profileRevision.current++;
    const request = ++originRequest.current;
    setResolvingOrigin(true);
    setError(null);
    try {
      let { lat: pickedLat, lon: pickedLon } = origin;
      if (pickedLat === undefined || pickedLon === undefined) {
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(origin.name)}`,
        );
        const body = await res.json();
        if (!res.ok) throw new Error("geocode-failed");
        pickedLat = body.lat;
        pickedLon = body.lon;
      }
      if (
        typeof pickedLat !== "number" ||
        !Number.isFinite(pickedLat) ||
        typeof pickedLon !== "number" ||
        !Number.isFinite(pickedLon)
      )
        throw new Error("coordinates-missing");
      if (request !== originRequest.current) return;
      setLat(toInputCoord(pickedLat));
      setLon(toInputCoord(pickedLon));
      setBaseLabel(origin.name);
      setEditingOrigin(false);
      writeLocalSettings({
        base_lat: pickedLat,
        base_lon: pickedLon,
        base_label: origin.name,
      });
    } catch {
      if (request === originRequest.current)
        setError(
          "出発地の座標を取得できませんでした。もう一度選んでください。",
        );
    } finally {
      if (request === originRequest.current) setResolvingOrigin(false);
    }
  }

  const search = useCallback(async () => {
    if (missing || resolvingOrigin) {
      setError(missing || "出発地を確認中です。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const to = new Date(`${from}T12:00:00+09:00`);
      to.setMonth(to.getMonth() + months);
      const params = new URLSearchParams({
        birthDate,
        lon,
        from,
        to: `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(to.getDate()).padStart(2, "0")}`,
        direction,
        tenchusatsuMode,
        /* 三盤吉だけでなく、凶の無い日（吉2盤・吉1盤・平）まで拾う
           （利用者の指摘、2026-09-29「凶がないなら他の方角も出したら」） */
        scope: "noBad",
      });
      const res = await fetch(
        `/api/relocation/auspicious-days?${params.toString()}`,
      );
      const json = await res.json();
      if (!res.ok) {
        setError(getAuspiciousDayErrorMessage(json.error));
        setSummaries(null);
        return;
      }
      setSummaries(json.summaries);
      setMeta({ honmeiStar: json.honmeiStar, voidZodiacs: json.voidZodiacs });
    } catch {
      setError(getAuspiciousDayErrorMessage());
    } finally {
      setLoading(false);
    }
  }, [
    birthDate,
    lon,
    from,
    months,
    direction,
    tenchusatsuMode,
    missing,
    resolvingOrigin,
  ]);

  /**
   * 物件スキャナーへの受け渡し。対象日・方位・天中殺の扱いを引き継ぐ。
   * 出発地が分からないとスキャナーは方位を出せないので座標も渡す。
   */
  const scannerHref = (date: string, direction: string) => {
    const q = new URLSearchParams({ targetDate: date, direction, tenchusatsuMode });
    if (lat) q.set("baseLat", lat);
    if (lon) q.set("baseLon", lon);
    return `/relocation/arbitrage?${q.toString()}`;
  };

  /**
   * その方位について、絞り込み後に何が出るか。
   *
   * JSX の中で 4 か所が同じ値を要る。呼ぶたびに絞り直すが、対象は
   * 走査上限の 800 日で、絞り込みは 1 日あたり真偽値 4 つの比較。
   * 覚えを持つほうが、覚えを捨てる条件（絞り込み・展開・再走査）を
   * 数え落とす危険のほうが大きい。
   */
  const view = (s: Summary) => {
    const matched = filterDays(s.days, filter);
    const showAll = expanded[s.direction] ?? false;
    const shown = showAll ? matched : matched.slice(0, INITIAL_ROWS);
    return { matched, shown, hidden: matched.length - shown.length };
  };

  return (
    <section className="mb-10 rounded-3xl border border-slate-300 bg-white/95 p-6 md:p-8 shadow-lg shadow-slate-200/50">
      <h2 className="text-lg font-bold font-serif flex items-center gap-2">
        <CalendarCheck className="w-5 h-5 text-rose-500" />
        三盤に凶が入らない日を出す
      </h2>
      <p className="mt-3 text-sm text-slate-700 leading-relaxed">
        年盤・月盤・日盤のどれにも凶が入らない日を、方位ごとに日付で並べます。三盤すべてが吉の日（S）だけでなく、吉が2盤・1盤で残りが平の日（A・B）、すべて平の日（C）も出します。三盤吉だけを見たいときは下の絞り込みで選べます。年盤は立春で切り替わるため、その方位が吉でいられる期限も併せて出します。
      </p>

      {/*
        保存したプロフィールを呼び出す（利用者の指摘、2026-09-26「日取りを
        選ぶ方は保存したプロフィールを呼び出せない」）。ほかの道具と同じ
        部品で、選ぶと設定に書かれ、ここの入力欄にも写る
      */}
      <ProfilePicker className="mt-4" onApplied={() => readSaved()} />

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="min-w-0 space-y-2">
          {birthDate && !editingBirth ? (
            <p>
              生年月日: {birthDate}{" "}
              <button
                type="button"
                className={choiceClass}
                onClick={() => {
                  profileRevision.current++;
                  setEditingBirth(true);
                  setBirthYear("");
                  setBirthDate("");
                }}
              >
                変える
              </button>
            </p>
          ) : (
            <>
              <BirthYearPicker
                value={birthYear}
                onChange={(year) => {
                  profileRevision.current++;
                  setBirthYear(year);
                  setBirthDate("");
                }}
              />
              {birthYear && (
                <>
                  <p className="text-xs text-slate-600">
                    日盤・天中殺の計算に月日も必要です。
                  </p>
                  <MonthDayPicker
                    key={birthYear}
                    year={birthYear}
                    value={birthDate}
                    onChange={(date) => {
                      profileRevision.current++;
                      setBirthDate(date);
                      if (date) {
                        writeLocalSettings({ birth_date: date });
                        setEditingBirth(false);
                      }
                    }}
                  />
                </>
              )}
            </>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          {lat && lon && !editingOrigin ? (
            <p>
              出発地: {baseLabel || "登録済み"}{" "}
              <button
                type="button"
                className={choiceClass}
                onClick={() => {
                  profileRevision.current++;
                  setEditingOrigin(true);
                }}
              >
                変える
              </button>
            </p>
          ) : (
            <OriginChooser onPick={pickOrigin} />
          )}
          {resolvingOrigin && <p role="status">出発地を確認中…</p>}
          {/* 数字の欄は開いたときだけ描く。初めて来た人に座標を求めない。 */}
          <details onToggle={(e) => setShowCoords(e.currentTarget.open)}>
            <summary>座標を直接入れる</summary>
            {showCoords && (
              <>
                <label htmlFor="ad-lon">現住地の経度</label>
                <input
                  id="ad-lon"
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={lon}
                  onChange={(e) => {
                    profileRevision.current++;
                    originRequest.current++;
                    setResolvingOrigin(false);
                    setLon(e.target.value);
                    setBaseLabel("");
                  }}
                />
                <label htmlFor="ad-lat">現住地の緯度</label>
                <input
                  id="ad-lat"
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={lat}
                  onChange={(e) => {
                    profileRevision.current++;
                    originRequest.current++;
                    setResolvingOrigin(false);
                    setLat(e.target.value);
                    setBaseLabel("");
                  }}
                />
              </>
            )}
          </details>
        </div>
        <fieldset className="min-w-0 space-y-1">
          <legend>方位</legend>
          <div className="flex flex-wrap gap-2">
            {["all", ...ALL_DIRECTIONS].map((d) => (
              <button
                key={d}
                type="button"
                className={choiceClass}
                aria-pressed={direction === d}
                onClick={() => setDirection(d)}
              >
                {d === "all" ? "全方位" : DIRECTION_LABELS[d]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0 space-y-1">
          <legend>開始日</legend>
          <p className="text-sm">{from}</p>
          <DateChips value={from} onChange={setFrom} />
        </fieldset>
        <fieldset className="min-w-0 space-y-1">
          <legend>走査期間</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                [3, "3か月"],
                [6, "半年"],
                [12, "1年"],
                [24, "2年"],
              ] as const
            ).map(([value, name]) => (
              <button
                key={value}
                type="button"
                className={choiceClass}
                aria-pressed={months === value}
                onClick={() => setMonths(value)}
              >
                {name}
              </button>
            ))}
          </div>
        </fieldset>
        <details className="min-w-0 space-y-1">
          <summary>詳しい設定</summary>
          <label
            className="text-xs font-semibold text-slate-500 block cursor-help"
            htmlFor="ad-tenchusatsu"
            title="天中殺（算命学）＝空亡（四柱推命）。九星気学には本来無い概念で、どこまで禁止則として扱うかは流派によって異なります。"
          >
            天中殺の扱い
          </label>
          <select
            id="ad-tenchusatsu"
            value={tenchusatsuMode}
            onChange={(e) => {
              profileRevision.current++;
              setTenchusatsuMode(e.target.value);
            }}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none cursor-pointer focus:border-rose-400"
          >
            {TENCHUSATSU_MODES.map((m) => (
              <option key={m.id} value={m.id} title={m.description}>
                {m.label}
              </option>
            ))}
          </select>
        </details>
      </div>

      <button
        onClick={search}
        disabled={loading || !!missing || resolvingOrigin}
        aria-describedby={missing ? "ad-missing" : undefined}
        className="mt-5 px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white text-sm font-bold transition-colors inline-flex items-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        吉日を出す
      </button>

      {missing && (
        <p id="ad-missing" className="mt-2 text-sm text-slate-600">
          {missing}。
        </p>
      )}

      {error && (
        <p className="mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {meta.honmeiStar !== undefined && (
        <p className="mt-4 text-xs text-slate-500">
          本命星: <b className="text-slate-700">{meta.honmeiStar}</b> ／
          天中殺の支:{" "}
          <b className="text-slate-700">{meta.voidZodiacs?.join("・")}</b>
        </p>
      )}

      {!missing && (
        <div ref={boardRef} className="mt-5 scroll-mt-20">
          <ThreeBoardStack
            birthDate={birthDate}
            lon={lon}
            tenchusatsuMode={tenchusatsuMode}
            date={boardDate}
            onDateChange={setBoardDate}
          />
        </div>
      )}

      {summaries && (
        <div className="mt-5 space-y-5">
          {summaries.every((s) => s.days.length === 0) && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              走査した期間に、三盤のどれにも凶が入らない日はありませんでした。期間を延ばすか、方位を変えて試してください。
            </p>
          )}

          {/* 絞り込み。日を決めるときに実際に効く軸だけ置く。
              引越し業者の予約は土日に偏る、縁起日を優先したい人がいる、
              天中殺の日は結局選べない——この 3 つと、月。 */}
          {summaries.some((s) => s.days.length > 0) && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="text-xs font-bold text-slate-600">
                  絞り込み
                </span>

                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  曜日
                  <select
                    value={filter.weekday}
                    onChange={(e) =>
                      setFilter({
                        ...filter,
                        weekday: e.target.value as DayFilter["weekday"],
                      })
                    }
                    className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs outline-none cursor-pointer focus:border-rose-400"
                  >
                    <option value="all">すべて</option>
                    <option value="weekend">土日だけ</option>
                    <option value="weekday">平日だけ</option>
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  月
                  <select
                    value={filter.month}
                    onChange={(e) =>
                      setFilter({ ...filter, month: e.target.value })
                    }
                    className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs outline-none cursor-pointer focus:border-rose-400"
                  >
                    <option value="all">すべて</option>
                    {/* 候補がある月だけ。無い月を選べると押した瞬間に空になる */}
                    {monthsOf(summaries.flatMap((s) => s.days)).map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filter.luckyOnly}
                    onChange={(e) =>
                      setFilter({ ...filter, luckyOnly: e.target.checked })
                    }
                    className="accent-rose-500"
                  />
                  縁起日だけ（天赦日・一粒万倍日・大安）
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filter.hideBlocked}
                    onChange={(e) =>
                      setFilter({ ...filter, hideBlocked: e.target.checked })
                    }
                    className="accent-rose-500"
                  />
                  天中殺の日を隠す
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filter.tripleOnly}
                    onChange={(e) =>
                      setFilter({ ...filter, tripleOnly: e.target.checked })
                    }
                    className="accent-rose-500"
                  />
                  三盤吉（S）だけ
                </label>

                {isFiltering(filter) && (
                  <button
                    type="button"
                    onClick={() => setFilter(DEFAULT_DAY_FILTER)}
                    className="text-xs text-rose-700 underline"
                  >
                    絞り込みを外す
                  </button>
                )}
              </div>
            </div>
          )}

          {summaries
            .filter((s) => s.days.length > 0)
            .map((s) => (
              <div
                key={s.direction}
                className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
              >
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-base font-bold text-slate-800">
                      {s.directionLabel}
                    </span>
                    <span className="text-sm text-slate-600">
                      三盤吉{" "}
                      <b className="text-rose-600">
                        <CountUp value={s.tripleAuspiciousDays} />
                      </b>{" "}
                      日
                      {isFiltering(filter) && (
                        <>
                          {" "}
                          ／ 絞り込み後{" "}
                          <b className="text-slate-800">
                            {view(s).matched.length}
                          </b>{" "}
                          日
                        </>
                      )}
                      {s.blockedByTenchusatsuDays > 0 && (
                        <>
                          {" "}
                          ／ 天中殺で不可{" "}
                          <b className="text-amber-700">
                            {s.blockedByTenchusatsuDays}
                          </b>{" "}
                          日 ／ 実質{" "}
                          <b className="text-emerald-700">
                            <CountUp value={s.availableDays} />
                          </b>{" "}
                          日
                        </>
                      )}
                      {/* 天中殺の数と実質は三盤吉のうちの数。凶なしはその後に置く
                          （並べ替えると「凶なしのうち天中殺で不可」と読める） */}
                      {s.noBadDays !== undefined && (
                        <>
                          {" "}
                          ／ 凶なし（吉2盤・吉1盤・平を含む）{" "}
                          <b className="text-slate-800">{s.noBadDays}</b> 日
                        </>
                      )}
                    </span>
                  </div>
                  {s.window.yearBoardValidUntil && (
                    <span className="text-xs text-slate-500">
                      年盤の期限:{" "}
                      <b className="text-slate-700">
                        {s.window.yearBoardValidUntil}
                      </b>
                      {s.window.afterYearBoardStatus && (
                        <>
                          {" "}
                          まで（翌日から「{label(s.window.afterYearBoardStatus)}
                          」に変わる）
                        </>
                      )}
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white text-xs text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">
                          日付
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          年盤
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          月盤
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          日盤
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          暦
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          天中殺
                        </th>
                        <th className="px-3 py-2 text-left font-semibold">
                          物件
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {view(s).shown.map((d) => (
                        <tr
                          key={d.date}
                          className={`border-b border-slate-100 ${
                            d.blockedByTenchusatsu ? "bg-amber-50/60" : ""
                          }`}
                        >
                          <td className="px-3 py-2 font-mono whitespace-nowrap">
                            {(() => {
                              const on = favoriteKeys.has(
                                favoriteDayKey(d.date, s.direction),
                              );
                              return (
                                <button
                                  type="button"
                                  aria-pressed={on}
                                  aria-label={`${d.date} ${s.directionLabel} を${on ? "お気に入りから外す" : "お気に入りに追加"}`}
                                  title={
                                    on
                                      ? "お気に入りから外す"
                                      : "お気に入りに追加"
                                  }
                                  onClick={() => {
                                    if (!on && (d.tier ?? "S") === "S")
                                      setBurst((b) => ({
                                        key: favoriteDayKey(
                                          d.date,
                                          s.direction,
                                        ),
                                        n: (b?.n ?? 0) + 1,
                                      }));
                                    toggleFavoriteDay({
                                      date: d.date,
                                      direction: s.direction,
                                      directionLabel: s.directionLabel,
                                      yearLabel: label(d.yearLayer),
                                      monthLabel: label(d.monthLayer),
                                      dayLabel: label(d.dayLayer),
                                      tags: d.tags,
                                      blockedByTenchusatsu:
                                        d.blockedByTenchusatsu,
                                    });
                                  }}
                                  className="relative mr-1.5 -my-1 rounded p-1 align-middle text-slate-300 hover:text-amber-500"
                                >
                                  {burst?.key ===
                                    favoriteDayKey(d.date, s.direction) && (
                                    <Burst key={burst.n} />
                                  )}
                                  <Star
                                    className={`h-4 w-4 ${on ? "fill-amber-400 text-amber-500" : ""}`}
                                  />
                                </button>
                              );
                            })()}
                            {d.date}
                            <span className="text-slate-400">
                              （{WEEKDAYS[d.weekday]}）
                            </span>
                            <button
                              type="button"
                              aria-label={`${d.date} の三盤を方位盤で見る`}
                              title="この日の三盤を方位盤で見る"
                              onClick={() => showBoard(d.date)}
                              className="ml-1.5 -my-1 rounded p-1 align-middle text-slate-300 hover:text-rose-500"
                            >
                              <Layers className="h-4 w-4" />
                            </button>
                            {d.tier && (
                              <span
                                className={`mt-0.5 ml-7 block w-fit rounded px-1.5 py-0.5 font-sans text-xs font-semibold ${
                                  d.tier === "S"
                                    ? "bg-rose-50 text-rose-700"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {d.tier} {TIER_LABELS[d.tier]}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">{label(d.yearLayer)}</td>
                          <td className="px-3 py-2">{label(d.monthLayer)}</td>
                          <td className="px-3 py-2">{label(d.dayLayer)}</td>
                          <td className="px-3 py-2">
                            <span className="flex flex-wrap gap-1">
                              {d.tags.map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-semibold"
                                >
                                  {t}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {d.blockedByTenchusatsu ? (
                              <span className="text-amber-700 font-semibold">
                                不可（
                                {[
                                  d.voidScopes.year && "年",
                                  d.voidScopes.month && "月",
                                  d.voidScopes.day && "日",
                                ]
                                  .filter(Boolean)
                                  .join("・")}
                                ）
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {/* この日・この方位のまま物件一覧へ渡す。
                                日と方位が決まってから物件を選ぶのが実際の順序で、
                                条件を入れ直させると前提がずれる。 */}
                            {/* 押した時点で残す。クエリでも渡しているが、
                                戻ってから別の経路でスキャナーへ入っても
                                同じ日で始められるようにする（利用者報告）。 */}
                            <Link
                              href={scannerHref(d.date, s.direction)}
                              onClick={() => saveWorkingDate(d.date)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100 transition-colors"
                              title={`${d.date} に ${s.directionLabel} へ移る前提で物件を探す`}
                            >
                              この条件で探す
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 黙って切らない。残りの件数を書いて、押せば全部出す。 */}
                {view(s).hidden > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded({ ...expanded, [s.direction]: true })
                    }
                    className="w-full px-4 py-2.5 border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    残り {view(s).hidden} 日を表示
                  </button>
                )}

                {view(s).matched.length === 0 && (
                  <p className="px-4 py-3 text-xs text-slate-600">
                    この絞り込みに当てはまる日がありません。条件をゆるめてください。
                  </p>
                )}
              </div>
            ))}

          {/*
            分析を残す・AI に渡す（利用者の依頼、2026-09-26「どちらも引越し
            時期を分析したあと、それを保存できたらいい」）。全期間の分析と
            同じ部品と文書。生年月日と座標は入れない
          */}
          <SavedAnalysisPanel
            kind="calendar"
            defaultName={`${todayString()} の吉日`}
            buildMarkdown={() =>
              summaries.length === 0
                ? null
                : buildTimingReport({
                    title: "三盤に凶が入らない日（引越しの日取り）",
                    generatedAt: new Date(),
                    honmeiStarName:
                      meta.honmeiStar !== undefined
                        ? KYUSEI.find((k) => k.number === meta.honmeiStar)
                            ?.japanese
                        : undefined,
                    voidZodiacs: meta.voidZodiacs,
                    range: {
                      from,
                      to: `${months} か月先まで`,
                    },
                    conditions: [
                      `天中殺の扱い: ${
                        TENCHUSATSU_MODES.find((m) => m.id === tenchusatsuMode)
                          ?.label ?? tenchusatsuMode
                      }`,
                      "年盤・月盤・日盤のどれにも凶が入らない日（S 三盤吉・A 吉2盤・B 吉1盤・C 平）を数えています",
                    ],
                    directions: summaries.map((s) => {
                      const open = s.days.filter(
                        (d) => !d.blockedByTenchusatsu,
                      );
                      /* 段階の付いた応答なら、塞がれない日のうち最良の
                         段階を出す。付いていなければ三盤吉だけの一覧 */
                      const tiers = open.map((d) => d.tier ?? "S");
                      const best = (["S", "A", "B", "C"] as const).find((t) =>
                        tiers.includes(t),
                      );
                      const firstOfBest = open.find(
                        (d) => (d.tier ?? "S") === best,
                      );
                      return {
                        label: s.directionLabel,
                        bestTier: best ? `${best} ${TIER_LABELS[best]}` : null,
                        firstDate: firstOfBest?.date ?? null,
                        totalOpen: tiers.filter((t) => t === best).length,
                        windows: null,
                      };
                    }),
                    sourcePath: "https://cloud-palette.com/calendar",
                  })
            }
          />
        </div>
      )}
    </section>
  );
}
