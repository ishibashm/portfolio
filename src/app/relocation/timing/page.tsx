"use client";

/**
 * 引っ越し時期の全期間分析。
 *
 * スキャナー左欄の「引っ越し時期を探す」は、物件を探す文脈の中で
 * 「次にどこへ動けるか」を出すためのもので、幅が狭く情報量に限界がある。
 * こちらは時期そのものを主役にした専用面で、過去から未来までの全日 ×
 * 全方位を一望する。
 *
 *   カレンダーヒートマップ  日 × 方位の格子。1 セル 1 日 1 方位
 *   段階の分布              方位ごとの S〜X の積み上げ（構成比）
 *   窓の帯グラフ            候補日の連なりを時間軸の帯で描く
 *   平年比                  9 年平均（calendarClimatology）との比較
 *   選択日の地図            その日にどの県へ動けるかを色で塗る
 *
 * 判定は決定的な計算なので、走査は /api/relocation/auspicious-days の
 * mode=timeline（全日 × 全方位の格付け）を 1 回叩くだけ。外部課金なし。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import calendarClimatology from "@/data/calendarClimatology.json";
import { ArbitrageMap } from "@/components/ArbitrageMap";
import { YearlyForecast } from "@/components/relocation/YearlyForecast";
import { DayCellPopover } from "@/components/relocation/DayCellPopover";
import { toPercentStack } from "@/utils/percentStack";
import { saveWorkingDate } from "@/lib/workingDate";
import { prefectureDirections } from "@/lib/prefectureDirection";
import {
  ALL_DIRECTIONS,
  DIRECTION_LABELS,
  TIER_LABELS,
  summarizeWindows,
  type DayTier,
} from "@/utils/auspiciousDays";
import { TIER_FILL, BLOCKED_FILL } from "@/utils/tierDisplay";
import {
  DAY_CATEGORIES,
  allCategories,
  isUnfiltered,
  matchesTimingFilter,
  toggleCategory,
  type DayCategory,
} from "@/lib/timingFilter";
import { DEFAULT_TENCHUSATSU_MODE } from "@/utils/tenchusatsuPolicy";
import { loadSettings } from "@/lib/userSettings";
import { ActiveProfileBadge } from "@/components/profile/ActiveProfileBadge";
import { PartyMembersEditor } from "@/components/relocation/PartyMembersEditor";
import {
  partyParam,
  readSharedParty,
  writeSharedParty,
  type PartyMemberInput,
} from "@/lib/partyMemberInput";
import {
  destinationCandidates,
  jointTimeline,
  memberDirection,
  partyTimingReport,
  type MemberTimeline,
} from "@/lib/partyTimeline";
import { PREFECTURE_CENTERS } from "@/lib/prefectureDirection";
import {
  loadProfilePresets,
  type ProfilePreset,
} from "@/lib/profilePresetSync";
import { DEFAULT_PARTY_POLICY, type PartyPolicy } from "@/utils/arbitrageParty";

interface TimelineDay {
  date: string;
  weekday: number;
  rokuyo: string;
  tags: string[];
  blocked: boolean;
  tiers: Record<string, string>;
}

const TIERS: DayTier[] = ["S", "A", "B", "C", "D", "X"];

const WEEKDAY_JP = "日月火水木金土";

/**
 * 方位の絞り込みモード。
 *
 * 重要なのは「吉を出すモードかどうか」。environmental と personal_bazi は
 * 設計上、凶しか判定しない（filterCollisionByMode が OPTIMAL を返さない）
 * ため、吉の段階（S・A・B）は原理的に 0 件になる。
 *
 * 実測（本命三碧・空亡午未・名古屋、2026-01-01 から 730 日、全方位）:
 *
 *              composite                    environmental
 *   北西   S 12 / A 59 / B 94   計 165      S 0 / A 0 / B 0（最良は C）
 *   南東   S  2 / A 32 / B 97   計 131      S 0 / A 0 / B 0（最良は C）
 *
 * この事実を画面に出さないと「吉の日はめったに無いのか」という
 * 誤解になる。モードごとに「吉を出すか」を持たせて明示する。
 *
 * 数字は #566 で数え直した。三盤吉の条件を「三つとも吉」に直すまでは
 * 年か月のどちらか 1 枚が吉なら S に数えていたので、composite の S が
 * 南東 131・北西 165 と出ていた（いまの S＋A＋B に当たる）。
 */
const FILTER_MODES: {
  id: string;
  label: string;
  canBeAuspicious: boolean;
  hint: string;
}[] = [
  {
    id: "composite",
    label: "総合（既定）",
    canBeAuspicious: true,
    hint: "九星の吉方位と、五黄殺・暗剣殺・破・天中殺方位などの凶をすべて見る。三盤吉が出るのはこのモード。",
  },
  {
    id: "personal_kigaku",
    label: "本命星のみ",
    canBeAuspicious: true,
    hint: "本命星との相生・本命殺・的殺だけを見る。環境要因（五黄殺など）を外すので候補は増える。",
  },
  {
    id: "personal_bazi",
    label: "天中殺のみ",
    canBeAuspicious: false,
    hint: "空亡の方位だけを凶とする。吉の判定を行わないため三盤吉は出ない。",
  },
  {
    id: "environmental",
    label: "環境要因のみ",
    canBeAuspicious: false,
    hint: "五黄殺・暗剣殺・破など、誰にとっても凶となる要因だけを見る。個人の吉方位を判定しないため三盤吉は出ない。",
  },
  /* 組み合わせ。吉を出すのは本命星の層を含むものだけ（吉の判定は
     本命星との相生でしか行わないため）。 */
  {
    id: "personal_kigaku_environmental",
    label: "本命星 ＋ 環境方位",
    canBeAuspicious: true,
    hint: "本命星の吉凶に、五黄殺・暗剣殺・破を重ねて見る。天中殺は期間・方位とも判定に入れない。",
  },
  {
    id: "personal_kigaku_bazi",
    label: "本命星 ＋ 天中殺",
    canBeAuspicious: true,
    hint: "本命星の吉凶に、空亡の方位と期間を重ねて見る。環境要因（五黄殺など）は入れない。",
  },
  {
    id: "environmental_bazi",
    label: "環境方位 ＋ 天中殺",
    canBeAuspicious: false,
    hint: "五黄殺・暗剣殺・破に、空亡の方位と期間を重ねて見る。個人の吉方位を判定しないため三盤吉は出ない。",
  },
];

function modeInfo(id: string) {
  return FILTER_MODES.find((m) => m.id === id) ?? FILTER_MODES[0];
}

/** 合流先（県）の保存先。物件スキャナーには無い項目なので別の鍵。 */
const DEST_PREF_KEY = "timing_dest_pref_v1";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-stone-800">{title}</h2>
      <p className="mt-0.5 mb-4 text-xs leading-relaxed text-stone-500">
        {subtitle}
      </p>
      {children}
    </section>
  );
}

export default function TimingAnalyticsPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<TimelineDay[] | null>(null);
  const [profile, setProfile] = useState<{
    honmeiStar: number;
    voidZodiacs: string[];
  } | null>(null);

  // 走査範囲。過去も含める（自分の過去の移動を評価し直せる）
  const [pastMonths, setPastMonths] = useState(6);
  const [futureMonths, setFutureMonths] = useState(18);
  /*
    API は 1 回の走査を 2 年（730 日）までしか受けない。過去 12 か月＋
    未来 24 か月のように合計が 2 年を超えるときは、**未来を優先して
    過去を縮める。**以前は from（今日−過去）から 730 日ぶんを頼んで
    いたので、過去のぶんだけ未来が削れ、「未来 24 か月」を選んでも
    今日＋12 か月までしか返っていなかった。縮めたときはここに日数を
    入れて画面に出す（黙って削らない）。
  */
  const [pastClippedDays, setPastClippedDays] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  /*
    押したマスの位置。詳細はヒートマップの下にも出るが、見通しは 21 か月
    ぶんあるので、上のほうのマスを押すと画面外までスクロールしないと
    見えなかった（利用者報告）。押した場所に吹き出しを出す。
  */
  const [cellPopover, setCellPopover] = useState<{
    x: number;
    y: number;
    below: boolean;
    width: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusDir, setFocusDir] = useState<string | null>(null);
  // ヒートマップの絞り込み。既定は全選択＝絞り込み前と同じ見た目。
  // 段階と暦注は軸が違うので別々に持ち、AND で重ねる。
  const [tierFilter, setTierFilter] = useState<Set<DayCategory>>(allCategories);
  const [luckyOnly, setLuckyOnly] = useState(false);

  /*
    同行者・合流する人。物件スキャナーと同じ人を同じ鍵から読む
    （lib/partyMemberInput）。合流先は県で選び、各人の出発地からその県の
    代表点への方位で、人ごとの段階を引いて 1 本にまとめる
    （lib/partyTimeline）。走査は本人と同じ範囲（2 年まで）を人数ぶん。
    物件スキャナーの同行者は 90 日までなので、「合流する人と 2 年ぶん
    見たい」（利用者の要望 2026-09-17）はこちらで受ける。
  */
  const [partyMembers, setPartyMembers] = useState<PartyMemberInput[]>([]);
  const [partyPolicy, setPartyPolicy] =
    useState<PartyPolicy>(DEFAULT_PARTY_POLICY);
  const [savedProfiles, setSavedProfiles] = useState<ProfilePreset[]>([]);
  const [destPref, setDestPref] = useState("");
  /** API が返した同行者ぶんの走査。本人の days と同じ範囲。 */
  const [memberTimelines, setMemberTimelines] = useState<MemberTimeline[]>([]);
  /** 直近の走査に載せた同行者。変えたら走査し直しが要ることを出す。 */
  const [scannedParty, setScannedParty] = useState("");

  useEffect(() => {
    try {
      const shared = readSharedParty(localStorage);
      setPartyMembers(shared.members);
      setPartyPolicy(shared.policy);
      setDestPref(localStorage.getItem(DEST_PREF_KEY) || "");
    } catch {
      // 読めなければ空のまま
    }
    loadProfilePresets(fetch, localStorage)
      .then((r) => setSavedProfiles(r.presets))
      .catch(() => {
        /* 未ログイン・オフラインなら手入力してもらう */
      });
  }, []);

  // 保存は変えた瞬間に。効果で書くと、読み込み前の空の値で一度
  // 上書きしてしまう（物件スキャナーで足した人が消える）。
  const changeParty = (members: PartyMemberInput[]) => {
    setPartyMembers(members);
    writeSharedParty(localStorage, { members, policy: partyPolicy });
  };
  const changePolicy = (policy: PartyPolicy) => {
    setPartyPolicy(policy);
    writeSharedParty(localStorage, { members: partyMembers, policy });
  };
  const changeDest = (pref: string) => {
    setDestPref(pref);
    try {
      localStorage.setItem(DEST_PREF_KEY, pref);
    } catch {
      // 保存できなくても動作には影響しない
    }
  };

  const [settings, setSettings] = useState<{
    birthDate: string;
    baseLat: string;
    baseLon: string;
    tenchusatsuMode: string;
    involuntaryMove: boolean;
    directionFilterMode: string;
  } | null>(null);

  useEffect(() => {
    // 設定はスキャナーと共有する。ここに入力欄を二重に持つと、
    // どちらが正か分からなくなる。
    //
    // 出発地と生年月日はスキャナーが localStorage に即時保存しており、
    // 天中殺の扱いなどは共有設定（userSettings）側にある。まず
    // localStorage で描き始め、共有設定が読めたら上書きする。
    const ls = (k: string) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    };
    const base = {
      // 既定値を置かない。以前は運営者の生年月日が入っていて、
      // 未設定の人にも本命殺・天中殺の判定が出ていた。空なら
      // canScan が false になり、下で「何が足りないか」を出す。
      birthDate: ls("arb_birthDate") || "",
      baseLat: ls("arb_baseLat") || "",
      baseLon: ls("arb_baseLon") || "",
      tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE as string,
      involuntaryMove: false,
      directionFilterMode: "composite",
    };
    setSettings(base);
    loadSettings()
      .then(({ settings: cfg }) => {
        if (!cfg) return;
        setSettings({
          birthDate: (cfg.birth_date as string) || base.birthDate,
          baseLat: cfg.base_lat ? String(cfg.base_lat) : base.baseLat,
          baseLon: cfg.base_lon ? String(cfg.base_lon) : base.baseLon,
          tenchusatsuMode:
            (cfg.tenchusatsu_mode as string) || base.tenchusatsuMode,
          involuntaryMove: Boolean(cfg.involuntary_move),
          directionFilterMode:
            (cfg.direction_filter_mode as string) || base.directionFilterMode,
        });
      })
      .catch(() => {
        /* 未ログインなら localStorage のままでよい */
      });
  }, []);

  /**
   * 走査に必要なものが揃っているか。
   *
   * 条件を runScan の中だけに置くと、画面は「読み込み中」を出したまま
   * 何も起きない状態になる。走査の可否と画面の出し分けが同じ条件を見る。
   */
  const canScan = Boolean(settings?.baseLon && settings?.birthDate);

  /** 足りないものの名前。そのまま画面に出す。 */
  const missingLabel = [
    settings?.baseLon ? null : "出発地",
    settings?.birthDate ? null : "生年月日",
  ]
    .filter(Boolean)
    .join("と");

  const runScan = useCallback(async () => {
    if (!settings?.baseLon || !settings?.birthDate) {
      setError(
        "出発地と生年月日が未設定です。先に物件スキャナーで設定してください。",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const MAX_DAYS = 730;
      const to = new Date();
      to.setMonth(to.getMonth() + futureMonths);
      let from = new Date();
      from.setMonth(from.getMonth() - pastMonths);
      const spanDays = Math.round((to.getTime() - from.getTime()) / 86_400_000);
      let clipped: number | null = null;
      if (spanDays > MAX_DAYS) {
        from = new Date(to.getTime() - MAX_DAYS * 86_400_000);
        clipped = Math.round((Date.now() - from.getTime()) / 86_400_000);
      }
      const params = new URLSearchParams({
        birthDate: settings.birthDate,
        lon: settings.baseLon,
        tenchusatsuMode: settings.tenchusatsuMode,
        involuntaryMove: String(settings.involuntaryMove),
        directionFilterMode: settings.directionFilterMode,
        mode: "timeline",
        from: iso(from),
        to: iso(to),
      });
      const party = partyParam(partyMembers);
      if (party) params.set("party", party);
      const res = await fetch(`/api/relocation/auspicious-days?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (!Array.isArray(json?.days)) throw new Error("empty");
      setDays(json.days);
      setMemberTimelines(Array.isArray(json.members) ? json.members : []);
      setScannedParty(party);
      setPastClippedDays(clipped);
      setProfile({
        honmeiStar: json.honmeiStar,
        voidZodiacs: json.voidZodiacs ?? [],
      });
      setSelectedDate(null);
    } catch {
      setError("走査に失敗しました。設定を確認してもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }, [settings, pastMonths, futureMonths, partyMembers]);

  // 設定が読めたら自動で 1 回走らせる。このページは分析が主役なので、
  // ボタンを押させてから待たせる理由がない。
  useEffect(() => {
    if (settings?.baseLon && settings?.birthDate && days === null && !busy) {
      runScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const todayIso = iso(new Date());

  /** 方位ごとの集計。構成比・窓・最速の候補 */
  const perDirection = useMemo(() => {
    if (!days) return [];
    return ALL_DIRECTIONS.map((dir) => {
      const counts: Record<DayTier, number> = {
        S: 0,
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        X: 0,
      };
      let blocked = 0;
      const futureOpen: string[] = [];
      for (const d of days) {
        const t = d.tiers[dir] as DayTier;
        counts[t] = (counts[t] ?? 0) + 1;
        if (d.blocked && t !== "X") blocked++;
        if (d.date >= todayIso && t !== "X" && !d.blocked) {
          futureOpen.push(`${t}|${d.date}`);
        }
      }
      // 最良段階と、その段階の未来日
      let best: DayTier | null = null;
      for (const t of TIERS) {
        if (t === "X") continue;
        if (futureOpen.some((x) => x.startsWith(`${t}|`))) {
          best = t;
          break;
        }
      }
      const bestDates = best
        ? futureOpen
            .filter((x) => x.startsWith(`${best}|`))
            .map((x) => x.slice(2))
            .sort()
        : [];
      return {
        dir,
        label: DIRECTION_LABELS[dir],
        counts,
        blocked,
        bestTier: best,
        firstDate: bestDates[0] ?? null,
        windows: summarizeWindows(bestDates),
        totalOpen: bestDates.length,
      };
    }).sort((a, b) => {
      const ar = a.bestTier ? TIERS.indexOf(a.bestTier) : 99;
      const br = b.bestTier ? TIERS.indexOf(b.bestTier) : 99;
      return ar !== br ? ar - br : b.totalOpen - a.totalOpen;
    });
  }, [days, todayIso]);

  /**
   * 積み上げ棒グラフ用（構成比）。
   *
   * 以前は段階ごとに toFixed(1) してから積み上げていたので、6 段階ぶんの
   * 丸め誤差が足し合わさって合計が 100.1 になり、Recharts が横軸を
   * そこまで伸ばして `100.100000000000019%` と表示していた（利用者報告）。
   * 丸めてから足すのをやめ、合計がちょうど 100 になる整数に配り直す。
   */
  const stackData = useMemo(
    () =>
      perDirection.map((p) => {
        const percent = toPercentStack(p.counts, TIERS);
        const row: Record<string, string | number> = { name: p.label };
        for (const t of TIERS) row[t] = percent[t];
        return row;
      }),
    [perDirection],
  );

  /** 月 × 方位のカレンダー行 */
  const monthRows = useMemo(() => {
    if (!days) return [];
    const map = new Map<string, TimelineDay[]>();
    for (const d of days) {
      const m = d.date.slice(0, 7);
      const arr = map.get(m);
      if (arr) arr.push(d);
      else map.set(m, [d]);
    }
    return [...map.entries()].map(([month, list]) => ({ month, list }));
  }, [days]);

  const selected = useMemo(
    () => days?.find((d) => d.date === selectedDate) ?? null,
    [days, selectedDate],
  );

  /**
   * 選択日の県別の吉凶。地図をその日の意思決定面にする。
   * 判定は timeline の結果を使い回すので追加計算は方位の割り当てだけ。
   */
  const soloPrefKigaku = useMemo(() => {
    if (!selected || !settings?.baseLat || !settings?.baseLon) return undefined;
    const lat = Number(settings.baseLat);
    const lon = Number(settings.baseLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
    const out: Record<
      string,
      {
        direction: string;
        directionLabel: string;
        tier: string;
        blocked: boolean;
      }
    > = {};
    /* 県の代表点は面積重心（lib/prefectureDirection）。arbitrage の
       県塗りと同じ割り当て関数を使う（利用者報告 2026-08-27）。 */
    const prefDirs = prefectureDirections(lat, lon, "traditional");
    for (const [name, dir] of Object.entries(prefDirs)) {
      const tier = selected.tiers[dir];
      if (!tier) continue;
      out[name] = {
        direction: dir,
        directionLabel: DIRECTION_LABELS[dir] ?? dir,
        tier,
        blocked: selected.blocked,
      };
    }
    return out;
  }, [selected, settings]);

  /**
   * 8 方位 → 選択日の段階。地図の扇形と右下の凡例が読む。
   *
   * これを渡していなかったため、県塗りは出ているのに右下の凡例が
   * 「方位の吉凶は出していません（生年月日と出発地を入れると…）」と
   * 矛盾した案内を出していた（利用者のスクリーンショットで発覚）。
   */
  const dirKigakuForMap = useMemo(() => {
    if (!selected) return undefined;
    const out: Record<
      string,
      {
        direction: string;
        directionLabel: string;
        tier: string;
        blocked: boolean;
      }
    > = {};
    for (const dir of ALL_DIRECTIONS) {
      const tier = selected.tiers[dir];
      if (!tier) continue;
      out[dir] = {
        direction: dir,
        directionLabel: DIRECTION_LABELS[dir] ?? dir,
        tier,
        blocked: selected.blocked,
      };
    }
    return out;
  }, [selected]);

  /**
   * 本人＋同行者の走査結果。本人は "self" として先頭に置く。
   * 出発地の緯度が無ければ方位が出せないので空。
   */
  const allTimelines = useMemo<MemberTimeline[]>(() => {
    if (!days || !settings) return [];
    const lat = Number(settings.baseLat);
    const lon = Number(settings.baseLon);
    if (!settings.baseLat || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return [];
    }
    return [
      {
        id: "self",
        name: "あなた",
        stationary: false,
        weight: 1,
        baseLat: lat,
        baseLon: lon,
        days,
      },
      ...memberTimelines,
    ];
  }, [days, settings, memberTimelines]);

  const destination = destPref ? PREFECTURE_CENTERS[destPref] : undefined;
  const partyStale = days !== null && partyParam(partyMembers) !== scannedParty;
  // 同行者を変えたあとは、前の人たちで出した合成を出さない（走査し直す
  // まで空にする）。消した人の名前が「次に全員で動ける日」に残っていた。
  const partyActive =
    memberTimelines.length > 0 && allTimelines.length > 0 && !partyStale;

  /** 合流先に向けた日ごとの合成。合流先が未選択なら空。 */
  const partyDaily = useMemo(
    () =>
      partyActive && destination
        ? jointTimeline(allTimelines, destination, partyPolicy)
        : [],
    [partyActive, destination, allTimelines, partyPolicy],
  );
  const partyReport = useMemo(
    () =>
      partyDaily.length > 0 ? partyTimingReport(partyDaily, todayIso) : null,
    [partyDaily, todayIso],
  );
  /** 月ごとの「全員で動ける日」の数と最初の日。2 年ぶんを一覧にする。 */
  const partyMonths = useMemo(() => {
    if (!partyReport) return [];
    const map = new Map<string, { count: number; first: string }>();
    for (const d of partyDaily) {
      if (d.date < todayIso) continue;
      const m = d.date.slice(0, 7);
      const cur = map.get(m) ?? { count: 0, first: "" };
      if (d.joint.everyoneSafe) {
        cur.count++;
        if (!cur.first) cur.first = d.date;
      }
      map.set(m, cur);
    }
    return [...map.entries()].map(([month, v]) => ({ month, ...v }));
  }, [partyReport, partyDaily, todayIso]);

  /**
   * **どこで合流できるか。**合流先を選ばせる前に候補を出す。
   *
   * 利用者の指摘（2026-09-18）。人ごとに出発地が違うので、同じ合流先でも
   * 方位が違って答えが予想できない。選ばせる作りだと、どこなら全員で
   * 動けるかを知るのに 47 回選び直すことになる。
   *
   * 暦は引き直さない（人ごとの「日 × 方位」は走査済み）。県ごとに変わる
   * のは各人の方位だけ。47 県 × 2 年で 4 人でも 46ms（lib 側で実測）。
   */
  const partyCandidates = useMemo(
    () =>
      partyActive
        ? destinationCandidates(
            allTimelines,
            PREFECTURE_CENTERS,
            partyPolicy,
            todayIso,
          )
        : [],
    [partyActive, allTimelines, partyPolicy, todayIso],
  );
  /** 候補を全部出すか（既定は上位だけ）。 */
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  /**
   * 選択日の県塗りを全員ぶんにする。県ごとに「各人の出発地からその県への
   * 方位」で人ごとの段階を引き、まとめ方で 1 つにする。合流先を選んで
   * いなくても出す（どの県なら全員で動けるか、を地図で探す用）。
   */
  const partyPrefKigaku = useMemo(() => {
    if (!selected || !partyActive || !soloPrefKigaku) return undefined;
    const narrowed = allTimelines.map((m) => ({
      ...m,
      days: m.days.filter((d) => d.date === selected.date),
    }));
    const out: typeof soloPrefKigaku = {};
    for (const [name, center] of Object.entries(PREFECTURE_CENTERS)) {
      const jd = jointTimeline(narrowed, center, partyPolicy)[0];
      const mine = soloPrefKigaku[name];
      if (!jd || !mine) continue;
      out[name] = {
        direction: mine.direction,
        directionLabel: `${mine.directionLabel}（全員）`,
        tier: jd.tier,
        blocked: jd.blocked,
      };
    }
    return out;
  }, [selected, partyActive, soloPrefKigaku, allTimelines, partyPolicy]);
  const prefKigaku = partyPrefKigaku ?? soloPrefKigaku;

  const climatology = useMemo(() => {
    if (!profile) return null;
    /* 読む枝だけの型（#149）。この画面が読むのは
       directions[方位].perYear[段階] だけ。JSON import のリテラル型は
       「1|子丑」のような具体キーしか持たず、テンプレート文字列で
       引けないので、索引で引ける形に広げて受ける（構造的に代入できる
       のでキャストは要らない）。 */
    const profiles: Record<
      string,
      | { directions?: Record<string, { perYear?: Record<string, number> }> }
      | undefined
    > = calendarClimatology.profiles;
    const joined = profile.voidZodiacs.join("");
    return (
      profiles[`${profile.honmeiStar}|${joined}`] ??
      profiles[
        `${profile.honmeiStar}|${[...profile.voidZodiacs].reverse().join("")}`
      ] ??
      null
    );
  }, [profile]);

  const activeDir = focusDir ?? perDirection[0]?.dir ?? null;

  /** 絞り込みに残った日数。0 のときは「該当なし」と出す。 */
  const matchedCount = useMemo(() => {
    if (!days) return 0;
    return days.filter((d) =>
      matchesTimingFilter(d, activeDir, tierFilter, luckyOnly),
    ).length;
  }, [days, activeDir, tierFilter, luckyOnly]);

  /** 絞り込み中か。既定（全選択・暦注オフ）なら false。 */
  const filtering = !isUnfiltered(tierFilter, luckyOnly);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 p-4 font-sans text-stone-800 md:p-8">
      {/* 上限は max-w-6xl（1152px）だった。日ごと・方位ごとの升目を
          一望する画面なので、幅があるほど一度に見渡せる。
          ホーム（1700px）に揃える。 */}
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header>
          <h1 className="text-xl font-bold">引っ越し時期の全期間分析</h1>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            過去から未来まで、日ごと・方位ごとの吉凶を一望します。判定は暦から決まる計算なので、何度走らせても同じ答えが返ります。
            <Link
              href="/relocation/arbitrage"
              className="mx-1 font-semibold text-indigo-600 underline"
            >
              物件スキャナー
            </Link>
            の設定（生年月日・出発地・天中殺の扱い）をそのまま使います。
          </p>
          {/* 「時期を選ぶ」道具は 2 本ある。役割の違いを両方の冒頭に
              書かないと、どちらを開けばいいか初見で分からない（導線の
              棚卸しで判明。/calendar 側にも対になる案内がある）。 */}
          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            ここは<b>方位ごとの段階評価で候補日を絞る</b>
            画面です。絞った日を六曜・天赦日・一粒万倍日などの暦注で確かめるときは
            <Link
              href="/calendar"
              className="mx-1 font-semibold text-indigo-600 underline"
            >
              日取りカレンダー
            </Link>
            を使ってください。
          </p>
        </header>
        {/* どのプロフィールで時期を出しているかを頭に 1 行（利用者の指摘、
            2026-09-12。「このプロフィールでこの時期です」と分かるように） */}
        <ActiveProfileBadge purpose="時期の吉凶" />

        {/* 走査範囲 */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-[10px] font-semibold text-stone-500">
              過去
              <select
                value={pastMonths}
                onChange={(e) => setPastMonths(Number(e.target.value))}
                className="ml-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs"
              >
                {[0, 3, 6, 12].map((m) => (
                  <option key={m} value={m}>
                    {m}か月
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-semibold text-stone-500">
              未来
              <select
                value={futureMonths}
                onChange={(e) => setFutureMonths(Number(e.target.value))}
                className="ml-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs"
              >
                {[6, 12, 18, 24].map((m) => (
                  <option key={m} value={m}>
                    {m}か月
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-semibold text-stone-500">
              方位の判定
              <select
                value={settings?.directionFilterMode ?? "composite"}
                onChange={(e) => {
                  // 表示中の結果は前のモードのもの。ラベルと中身が
                  // 食い違わないよう、切り替えたら結果を捨てて
                  // 自動再走査に任せる。
                  const next = e.target.value;
                  setSettings((prev) =>
                    prev ? { ...prev, directionFilterMode: next } : prev,
                  );
                  setDays(null);
                }}
                className="ml-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs"
              >
                {FILTER_MODES.map((m) => (
                  <option key={m.id} value={m.id} title={m.hint}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={runScan}
              disabled={busy}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:bg-stone-300"
            >
              {busy ? "走査中…" : "この範囲で走査"}
            </button>
            {profile && (
              <span className="text-[10px] text-stone-600">
                本命星 {profile.honmeiStar}・天中殺{" "}
                {profile.voidZodiacs.join("")}
                {days && `・${days.length}日を評価`}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-stone-600">
            {modeInfo(settings?.directionFilterMode ?? "composite").hint}
          </p>
          {pastClippedDays !== null && (
            <p
              role="status"
              className="mt-1 text-[10px] leading-relaxed text-amber-700"
            >
              {`1 回の走査は 2 年までなので、未来 ${futureMonths}か月を優先して過去を ${pastClippedDays} 日ぶんに縮めています。`}
            </p>
          )}
          {!modeInfo(settings?.directionFilterMode ?? "composite")
            .canBeAuspicious && (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
              <b>
                このモードでは三盤吉（S）が 0
                件になります。めったに無いからではありません。
              </b>
              <span className="ml-1">
                「{modeInfo(settings?.directionFilterMode ?? "composite").label}
                」は凶の判定だけを行い、吉方位の判定をしないためです。三盤吉を見るには「総合（既定）」か「本命星のみ」に切り替えて走査し直してください。
              </span>
              <button
                onClick={() => {
                  setSettings((prev) =>
                    prev ? { ...prev, directionFilterMode: "composite" } : prev,
                  );
                  setDays(null);
                }}
                className="ml-1 font-bold text-indigo-700 underline"
              >
                総合に切り替える
              </button>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        </section>

        {/* 同行者・合流する人。走査の前でも人を足せるように、結果の外に置く */}
        <Section
          title="同行者・合流する人（いつなら全員で動けるか）"
          subtitle="別の場所に住む親族と合流するなど、一緒に動く人を足すと、合流先に向けた全員ぶんの方位を人数ぶん走査して重ねます。走査は本人と同じ範囲（2 年まで）。同行者は物件スキャナーと共有で、あちらの「時期の走査」は 90 日までです。"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
            <PartyMembersEditor
              members={partyMembers}
              onChange={changeParty}
              policy={partyPolicy}
              onPolicyChange={changePolicy}
              savedProfiles={savedProfiles}
            />
            <div className="space-y-3">
              <label className="block text-[11px] font-semibold text-stone-600">
                合流先（県）
                <select
                  value={destPref}
                  onChange={(e) => changeDest(e.target.value)}
                  className="ml-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-normal"
                >
                  <option value="">選んでください</option>
                  {Object.keys(PREFECTURE_CENTERS).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {partyMembers.length === 0 && (
                <p className="text-xs leading-relaxed text-stone-500">
                  左で同行者を足すと、ここに「次に全員で動ける日」と月ごとの日数が出ます。
                </p>
              )}
              {partyStale && (
                <p
                  role="status"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900"
                >
                  同行者を変えました。
                  <button
                    type="button"
                    onClick={runScan}
                    disabled={busy || !canScan}
                    className="mx-1 font-bold text-indigo-700 underline disabled:text-stone-400"
                  >
                    {busy ? "走査中…" : "この範囲で走査し直す"}
                  </button>
                  と、同行者ぶんも同じ範囲で走査します。
                </p>
              )}
              {days &&
                memberTimelines.length > 0 &&
                allTimelines.length === 0 && (
                  <p className="text-xs leading-relaxed text-rose-600">
                    あなたの出発地の緯度が未設定なので、合流先への方位が出せません。物件スキャナーで出発地を入れ直してください。
                  </p>
                )}
              {/*
                **選ばせる前に候補を出す。**利用者の指摘（2026-09-18）。
                人ごとに出発地が違うので、同じ合流先でも方位が違って
                答えが予想できない。選ばせる作りだと「どこなら全員で
                動けるか」を知るのに 47 回選び直すことになる。

                並びは lib（destinationCandidates）が決める。ここでは
                出す本数だけを絞る。
              */}
              {partyCandidates.length > 0 && (
                <div
                  className="rounded-xl border border-stone-200 bg-white p-2.5"
                  data-party-candidates
                >
                  <p className="text-xs font-bold text-stone-700">
                    どこで合流できるか
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                    今日以降で、移動する全員が避けるべき判定に当たらない日数の多い順です。押すと合流先に入ります。
                  </p>
                  {partyCandidates[0].allClearDays === 0 ? (
                    /* どこも 0 日。隠すと「期間を延ばすか人を減らすか」の
                       判断ができないので、一覧の前に言い切る。 */
                    <p className="mt-1.5 text-xs leading-relaxed text-amber-800">
                      この範囲では、<b>全員で動ける日がどの県にもありません</b>
                      。期間を延ばすか、まとめ方を変えるか、同行者を分けて動くかの判断になります。
                    </p>
                  ) : null}
                  <ul className="mt-1.5 space-y-1">
                    {(showAllCandidates
                      ? partyCandidates
                      : partyCandidates.slice(0, 8)
                    ).map((c) => (
                      <li key={c.name}>
                        <button
                          type="button"
                          onClick={() => changeDest(c.name)}
                          aria-pressed={destPref === c.name}
                          className={`flex min-h-[24px] w-full items-baseline gap-2 rounded-lg px-1.5 py-1 text-left text-xs hover:bg-indigo-50 ${
                            destPref === c.name
                              ? "bg-indigo-50 font-bold text-indigo-900"
                              : "text-stone-700"
                          }`}
                        >
                          <span className="w-16 shrink-0">{c.name}</span>
                          <span className="w-12 shrink-0 text-right font-bold">
                            {c.allClearDays} 日
                          </span>
                          <span className="w-20 shrink-0 text-stone-500">
                            {c.nextAllClearDate ?? "—"}
                          </span>
                          <span className="truncate text-stone-500">
                            {TIER_LABELS[c.bestTier]}
                          </span>
                        </button>
                        <p className="px-1.5 text-xs leading-relaxed text-stone-500">
                          {c.legs
                            .filter((l) => l.direction)
                            .map(
                              (l) =>
                                `${l.name}は${DIRECTION_LABELS[l.direction!] ?? l.direction}`,
                            )
                            .join("・")}
                          {c.hasUnstableLeg && (
                            <b className="ml-1 text-amber-700">
                              近すぎて方位が定まりません
                            </b>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {partyCandidates.length > 8 && (
                    <button
                      type="button"
                      onClick={() => setShowAllCandidates((v) => !v)}
                      className="mt-1 inline-flex min-h-[24px] items-center text-xs font-bold text-indigo-700 underline"
                    >
                      {showAllCandidates
                        ? "上位だけ表示"
                        : `47 県すべて見る（残り ${partyCandidates.length - 8}）`}
                    </button>
                  )}
                </div>
              )}
              {partyActive && !destination && (
                <p className="text-xs leading-relaxed text-stone-500">
                  上の候補を押すか、県を選ぶと、各人の出発地からその県への方位で全員ぶんを重ねます。地図（カレンダーの日を選ぶと出ます）は合流先を選ばなくても全員ぶんの塗りになります。
                </p>
              )}
              {partyReport && (
                <div className="space-y-3" data-party-report>
                  <p className="text-xs leading-relaxed text-stone-600">
                    {allTimelines
                      .filter((m) => !m.stationary)
                      .map(
                        (m) =>
                          `${m.name}: ${DIRECTION_LABELS[memberDirection(m, destination!)] ?? ""}`,
                      )
                      .join("　")}
                    {allTimelines.some((m) => m.stationary) &&
                      `　移動しない: ${allTimelines
                        .filter((m) => m.stationary)
                        .map((m) => m.name)
                        .join("・")}`}
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-[11px] text-stone-500">
                        次に全員で動ける日
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-bold text-stone-800">
                        {partyReport.nextAllClearDate ?? "範囲内に無し"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-[11px] text-stone-500">
                        全員で動ける日数
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-bold text-stone-800">
                        {partyReport.allClearDays} / {partyReport.scannedDays}日
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-[11px] text-stone-500">窓の数</div>
                      <div className="mt-0.5 font-mono text-sm font-bold text-stone-800">
                        {summarizeWindows(partyReport.clearDates)?.count ?? 0}回
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-[11px] text-stone-500">
                        窓の平均の長さ
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-bold text-stone-800">
                        {summarizeWindows(partyReport.clearDates)?.avgLen ??
                          "—"}
                        日
                      </div>
                    </div>
                  </div>
                  {partyReport.alwaysBlockedBy.length > 0 && (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs leading-relaxed text-rose-900">
                      {partyReport.alwaysBlockedBy
                        .map(
                          (b) => `${b.name}は走査した全ての日で「${b.status}」`,
                        )
                        .join("。")}
                      。期間を延ばしても変わらないので、合流先の県を変えるか、年を改めるかの判断になります。
                    </p>
                  )}
                  <p className="text-xs leading-relaxed text-stone-500">
                    「全員で動ける日」は、移動する全員が凶なし（C
                    以上）で天中殺にも当たらない日。まとめ方は日ごとの段階（下の地図の塗り）に効き、この日数には効きません。
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-[10px] tracking-wider text-stone-600">
                          <th className="py-1.5 pr-2">月</th>
                          <th className="py-1.5 pr-2 text-right">
                            全員で動ける日数
                          </th>
                          <th className="py-1.5 text-right">最初の日</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partyMonths.map((m) => (
                          <tr
                            key={m.month}
                            className="border-b border-gray-100 last:border-0"
                          >
                            <td className="py-1 pr-2 font-mono">{m.month}</td>
                            <td className="py-1 pr-2 text-right font-mono">
                              {m.count === 0 ? (
                                <span className="text-stone-300">0日</span>
                              ) : (
                                `${m.count}日`
                              )}
                            </td>
                            <td className="py-1 text-right font-mono">
                              {m.first ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedDate(m.first)}
                                  className="font-semibold text-indigo-600 underline"
                                >
                                  {m.first.slice(5)}
                                </button>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Section>

        {days && days.length > 0 && (
          <>
            {/* 方位別サマリー */}
            <Section
              title="方位別サマリー（未来の候補）"
              subtitle={`今日以降で到達できる最良の段階と、その日数・最速日・窓の統計。行をクリックすると下のカレンダーと帯グラフがその方位に切り替わります。判定モードは「${modeInfo(settings?.directionFilterMode ?? "composite").label}」です。`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-stone-600">
                      <th className="py-1.5 pr-2">方位</th>
                      <th className="py-1.5 pr-2">最良</th>
                      <th className="py-1.5 pr-2 text-right">該当日数</th>
                      <th className="py-1.5 pr-2 text-right">最速</th>
                      <th className="py-1.5 pr-2 text-right">窓の数</th>
                      <th className="py-1.5 pr-2 text-right">窓の平均</th>
                      <th className="py-1.5 pr-2 text-right">窓の間隔</th>
                      <th className="py-1.5 text-right">天中殺で除外</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perDirection.map((p) => (
                      <tr
                        key={p.dir}
                        onClick={() => setFocusDir(p.dir)}
                        className={`cursor-pointer border-b border-gray-100 last:border-0 ${
                          activeDir === p.dir ? "bg-indigo-50/60" : ""
                        }`}
                      >
                        <td className="py-1.5 pr-2 font-semibold">{p.label}</td>
                        <td className="py-1.5 pr-2">
                          {p.bestTier ? (
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                              style={{ background: TIER_FILL[p.bestTier] }}
                            >
                              {TIER_LABELS[p.bestTier]}
                            </span>
                          ) : (
                            <span className="text-stone-300">候補なし</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono">
                          {p.totalOpen}日
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono">
                          {p.firstDate ? p.firstDate.slice(2) : "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono">
                          {p.windows?.count ?? "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono">
                          {p.windows ? `${p.windows.avgLen}日` : "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono">
                          {p.windows?.avgGapDays !== null &&
                          p.windows?.avgGapDays !== undefined
                            ? `${p.windows.avgGapDays}日`
                            : "—"}
                        </td>
                        <td className="py-1.5 text-right font-mono text-stone-600">
                          {p.blocked}日
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* 構成比 */}
            <Section
              title="段階の構成比（方位別・走査期間全体）"
              subtitle="各方位の日が、どの段階にどれだけ割り振られているか。緑（三盤吉）の帯が長い方位ほど、そもそも動きやすい方位。赤（五大凶殺）が支配的な方位は、期間を延ばしても候補が出にくい。"
            >
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stackData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      unit="%"
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={40}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(v, n) => [
                        `${v}%`,
                        TIER_LABELS[n as DayTier] ?? n,
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 10 }}
                      formatter={(v) => TIER_LABELS[v as DayTier] ?? v}
                    />
                    {TIERS.map((t) => (
                      <Bar
                        key={t}
                        dataKey={t}
                        stackId="a"
                        fill={TIER_FILL[t]}
                        name={t}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            {/*
              月ごとの見通し。

              ここは Q 値（nbaEngine の期待値）を出していたが、指標の意味と
              説明文がずれていた（「その月の質」ではなく「その月に取るべき
              最善手の期待値」で、最善手が撤退でも高く出る）。しかも根拠を
              追える画面がサイトのどこにも無かった。利用者の判断で、
              サイト共通の段階評価に置き換えた。

              走査結果をそのまま渡す。同じ days・同じ方位を使うので、
              下のカレンダーと数字がずれようがない。
            */}
            <YearlyForecast
              days={days}
              direction={activeDir}
              directionLabel={
                activeDir ? DIRECTION_LABELS[activeDir] : "選択中の方位"
              }
              fromIso={todayIso}
            />

            {/* カレンダーヒートマップ */}
            <Section
              title={`カレンダーヒートマップ（${
                activeDir ? DIRECTION_LABELS[activeDir] : ""
              }）`}
              subtitle="1 マスが 1 日。上の表で方位を選ぶと切り替わります。今日より前は薄く表示。マスを押すとその場に判定が出ます（全方位の一覧と地図はこの下）。"
            >
              <div className="space-y-2">
                {/* 段階の絞り込み。段階は既に計算済みなので、ここでやるのは
                    表示を絞ることだけ。判定にも段階の割り当てにも触らない。 */}
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50/60 p-2">
                  <span className="mr-1 text-[10px] font-bold text-stone-500">
                    段階で絞る
                  </span>
                  {DAY_CATEGORIES.map((c) => {
                    const on = tierFilter.has(c);
                    return (
                      <button
                        key={c}
                        onClick={() =>
                          setTierFilter((prev) => toggleCategory(prev, c))
                        }
                        aria-pressed={on}
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                          on
                            ? "border-stone-400 bg-white text-stone-700"
                            : "border-stone-200 bg-transparent text-stone-300"
                        }`}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-sm"
                          style={{
                            background:
                              c === "BLOCKED"
                                ? BLOCKED_FILL
                                : TIER_FILL[c as DayTier],
                            opacity: on ? 1 : 0.3,
                          }}
                        />
                        {c === "BLOCKED" ? "天中殺" : TIER_LABELS[c]}
                      </button>
                    );
                  })}

                  {/* 暦注は方位とは独立に決まる。段階と同じ列に混ぜると
                      「S かつ天赦日」が表現できないので、AND の別トグルにする。 */}
                  <span className="mx-1 h-3 w-px bg-stone-300" />
                  <button
                    onClick={() => setLuckyOnly((v) => !v)}
                    aria-pressed={luckyOnly}
                    className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                      luckyOnly
                        ? "border-amber-400 bg-amber-50 text-amber-800"
                        : "border-stone-200 text-stone-600"
                    }`}
                  >
                    天赦日・一粒万倍日のみ
                  </button>

                  {filtering && (
                    <button
                      onClick={() => {
                        setTierFilter(allCategories());
                        setLuckyOnly(false);
                      }}
                      className="ml-auto rounded-full px-2 py-0.5 text-[10px] text-indigo-600 underline"
                    >
                      絞り込みを外す（{matchedCount}日）
                    </button>
                  )}
                </div>

                {filtering && matchedCount === 0 && (
                  <p className="rounded-lg bg-stone-100 p-3 text-xs text-stone-500">
                    該当なし。選んだ段階の日がこの期間にありません。
                  </p>
                )}

                {/*
                  月の帯を xl 以上で 2 列にする。

                  1 列のままだと、1 マス 14px × 31 日 ＋ 見出しで 550px ほど
                  しか使わず、**1700px の器の右半分が丸ごと空いていた**
                  （利用者の指摘）。器を狭めると同じ頁の表や地図まで
                  巻き添えになるので、中の並べ方を変えて埋める
                  （CLAUDE.md 3 節）。

                  列を増やすだけでなくマスも 14px → 20px にした。余った幅を
                  埋めるためと、クリックの的が小さすぎたため。1 列に戻る
                  幅（lg 以下）でも 31 日 × 22px ＝ 682px で収まる。

                  読む順は列ごとに上から下。前半が左、後半が右になる。
                */}
                <div
                  ref={gridRef}
                  className="relative grid gap-x-8 gap-y-1.5 xl:grid-cols-2"
                >
                  {monthRows.map(({ month, list }) => (
                    <div key={month} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 font-mono text-[10px] text-stone-600">
                        {month.slice(2)}
                      </span>
                      <div className="flex flex-wrap gap-[2px]">
                        {list.map((d) => {
                          const t = (
                            activeDir ? d.tiers[activeDir] : "C"
                          ) as DayTier;
                          const past = d.date < todayIso;
                          const fill = d.blocked
                            ? BLOCKED_FILL
                            : (TIER_FILL[t] ?? "#e7e5e4");
                          const lucky =
                            d.tags.includes("天赦日") ||
                            d.tags.includes("一粒万倍日");
                          // 外れた日もマスは残す。詰めると日付の位置がずれて
                          // 「何日が残ったか」が読めなくなる。塗りだけ落とす。
                          const matched = matchesTimingFilter(
                            d,
                            activeDir,
                            tierFilter,
                            luckyOnly,
                          );
                          return (
                            <button
                              key={d.date}
                              onClick={(e) => {
                                setSelectedDate(d.date);
                                /* 選んだ時点で残す。以前はスキャナーへの
                                   リンクを踏んだときだけ残っていたので、
                                   手引きの手順やサイドバーから入ると
                                   今日に戻っていた（利用者報告）。 */
                                saveWorkingDate(d.date);
                                const box = gridRef.current;
                                if (!box) return;
                                const cell =
                                  e.currentTarget.getBoundingClientRect();
                                const outer = box.getBoundingClientRect();
                                const top = cell.top - outer.top;
                                setCellPopover({
                                  x: cell.left - outer.left + cell.width / 2,
                                  y: top,
                                  /* 上に置くと器からはみ出す最初の数行だけ
                                     下に出す。吹き出しの高さは中身で変わる
                                     ので、余裕を見て 150px で切る。 */
                                  below: top < 150,
                                  width: outer.width,
                                });
                              }}
                              title={`${d.date}（${WEEKDAY_JP[d.weekday]}）${
                                TIER_LABELS[t] ?? t
                              }${d.blocked ? " / 天中殺" : ""}${
                                d.tags.length ? " / " + d.tags.join("・") : ""
                              }${matched ? "" : " / 絞り込みから外れています"}`}
                              className={`h-5 w-5 rounded-[2px] transition-transform hover:scale-125 ${
                                selectedDate === d.date
                                  ? "ring-2 ring-indigo-600 ring-offset-1"
                                  : ""
                              } ${
                                matched && lucky ? "ring-1 ring-amber-400" : ""
                              } ${matched ? "" : "border border-dashed border-stone-300"}`}
                              style={{
                                background: matched ? fill : "transparent",
                                opacity: matched ? (past ? 0.28 : 1) : 0.5,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {cellPopover && selected && (
                    <DayCellPopover
                      day={selected}
                      tier={
                        (activeDir ? selected.tiers[activeDir] : "C") as DayTier
                      }
                      directionLabel={
                        activeDir ? DIRECTION_LABELS[activeDir] : null
                      }
                      filteredOut={
                        !matchesTimingFilter(
                          selected,
                          activeDir,
                          tierFilter,
                          luckyOnly,
                        )
                      }
                      x={cellPopover.x}
                      y={cellPopover.y}
                      below={cellPopover.below}
                      containerWidth={cellPopover.width}
                      onClose={() => setCellPopover(null)}
                      onShowAll={() => {
                        setCellPopover(null);
                        document
                          .getElementById("day-detail")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-2 text-[10px] text-stone-500">
                  {TIERS.map((t) => (
                    <span key={t} className="flex items-center gap-1">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ background: TIER_FILL[t] }}
                      />
                      {TIER_LABELS[t]}
                    </span>
                  ))}
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: BLOCKED_FILL }}
                    />
                    天中殺
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm ring-1 ring-amber-400" />
                    天赦日・一粒万倍日
                  </span>
                </div>
              </div>
            </Section>

            {/* 選択日の詳細（全方位）。吹き出しの「全方位を見る」の行き先 */}
            {selected && (
              <div id="day-detail" className="scroll-mt-4">
                <Section
                  title={`${selected.date}（${WEEKDAY_JP[selected.weekday]}）の全方位`}
                  subtitle={`${selected.rokuyo}${
                    selected.tags.length ? " / " + selected.tags.join("・") : ""
                  }${selected.blocked ? " / この日は天中殺で移転不可の設定です" : ""}`}
                >
                  <div className="flex flex-wrap gap-2">
                    {ALL_DIRECTIONS.map((dir) => {
                      const t = selected.tiers[dir] as DayTier;
                      return (
                        <div
                          key={dir}
                          className="flex min-w-20 flex-col items-center rounded-xl border border-gray-200 p-2"
                        >
                          <span className="text-xs font-bold">
                            {DIRECTION_LABELS[dir]}
                          </span>
                          <span
                            className="mt-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                            style={{
                              background: selected.blocked
                                ? BLOCKED_FILL
                                : TIER_FILL[t],
                            }}
                          >
                            {selected.blocked ? "天中殺" : TIER_LABELS[t]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <Link
                    href={`/relocation/arbitrage?targetDate=${selected.date}&view=overview`}
                    className="mt-3 inline-block text-[11px] font-semibold text-indigo-600 underline"
                  >
                    この日で物件スキャナーを開く（物件も一緒に見る）
                  </Link>
                </Section>
              </div>
            )}

            {/* 選択日の地図。どの県へなら動けるかを色で見る */}
            {selected && prefKigaku && (
              <Section
                title={`${selected.date} にどの県へ動けるか`}
                subtitle={
                  partyPrefKigaku
                    ? "県ごとに、あなたと同行者それぞれの出発地からその県への方位で選択日の判定を引き、まとめ方で 1 つにして塗っています。緑（三盤吉）から赤（五大凶殺）、灰は誰かが天中殺。カレンダーのマスを選び直すと塗りが変わります。"
                    : "出発地から見た各県の方位に、選択日の判定を当てて塗り分けています。緑（三盤吉）から赤（五大凶殺）、灰は天中殺。カレンダーのマスを選び直すと塗りが変わります。"
                }
              >
                <div className="h-[420px] overflow-hidden rounded-2xl border border-gray-200">
                  <ArbitrageMap
                    properties={[]}
                    baseLat={Number(settings!.baseLat)}
                    baseLon={Number(settings!.baseLon)}
                    mapCenter={[36.2048, 138.2529]}
                    useTrueNorth={false}
                    layerMode="final"
                    radiusKm="all"
                    prefecture="all"
                    keepWideView
                    prefKigaku={prefKigaku}
                    dirKigaku={dirKigakuForMap}
                    targetDate={selected.date}
                    /* 扇形の区切りを県塗り（prefKigaku の traditional）と
                       同じにする。渡さないと既定の 45 度等分で描かれ、
                       境目近くの県で扇形と塗りが別の方位を指す。 */
                    useClassical
                  />
                </div>
              </Section>
            )}

            {/* 平年比。平年値は composite で計算してあるので、他モードの
                結果と並べると比較にならない。素直にその旨を出す。 */}
            {climatology && (
              <Section
                title="平年比（9年平均との比較）"
                subtitle={
                  modeInfo(settings?.directionFilterMode ?? "composite")
                    .canBeAuspicious
                    ? "九星の年盤は9年で一巡します。走査期間の年あたり換算を、あなたの命式の9年平均と比べたもの。100%より大きければ当たり期間、小さければ少ない期間。"
                    : "平年値は「総合」で計算した基準値です。いま選んでいる判定モードは吉方位を出さないため、比較になりません（すべて0%と表示されます）。総合に切り替えて走査し直すと意味のある比較になります。"
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-stone-600">
                        <th className="py-1.5 pr-2">方位</th>
                        <th className="py-1.5 pr-2 text-right">
                          三盤吉（年換算）
                        </th>
                        <th className="py-1.5 pr-2 text-right">平年値</th>
                        <th className="py-1.5 text-right">平年比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perDirection.map((p) => {
                        const perYear = (p.counts.S / (days.length || 1)) * 365;
                        const normal =
                          climatology.directions?.[p.dir]?.perYear?.S ?? 0;
                        const ratio = normal > 0 ? perYear / normal : 0;
                        return (
                          <tr
                            key={p.dir}
                            className="border-b border-gray-100 last:border-0"
                          >
                            <td className="py-1.5 pr-2 font-semibold">
                              {p.label}
                            </td>
                            <td className="py-1.5 pr-2 text-right font-mono">
                              {perYear.toFixed(1)}日
                            </td>
                            <td className="py-1.5 pr-2 text-right font-mono">
                              {normal.toFixed(1)}日
                            </td>
                            <td
                              className={`py-1.5 text-right font-mono ${
                                ratio >= 1.05
                                  ? "text-emerald-700"
                                  : ratio <= 0.95
                                    ? "text-rose-700"
                                    : ""
                              }`}
                            >
                              {normal > 0
                                ? `${(ratio * 100).toFixed(0)}%`
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            <Section
              title="読み方と限界"
              subtitle="この分析が何を言っていて、何を言っていないか。"
            >
              <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-stone-600">
                {/*
                  この画面は「日取りを選ぶ」道具なので、先に日付を決めて
                  から方位を探す読み方をされやすい。**年盤で塞がった方位は
                  月日をどう選んでも段階が上がらない**ので、その順序では
                  候補が 1 日も出ない方位に入り込む。順序の理由と実測
                  （365 日 × 8 方位）は記事に分けてある。
                */}
                <li>
                  <b>方位が先、日取りが後です。</b>
                  年盤で塞がった方位は、月日をどう選んでも段階が上がりません。順序の理由と実測は
                  <Link
                    href="/blog/direction-or-timing-which-matters"
                    className="mx-1 font-semibold text-indigo-600 underline"
                  >
                    方位と日取りはどちらが重いのか
                  </Link>
                  に書きました。
                </li>
                <li>
                  段階は S（三盤吉）→ A（吉2盤）→ B（吉1盤）→ C（凶なし）→
                  D（軽い凶）の順。
                  <b>X（五大凶殺）は候補として提示しません</b>—
                  五黄殺・暗剣殺・破・本命殺・的殺は移転で妥協の対象にならないためです。
                </li>
                <li>
                  天中殺は方位ではなく期間の禁忌なので、段階とは独立に判定しています。「天中殺の扱い」の設定で結果が変わります。
                </li>
                <li>
                  暦は決定的な計算です。ここに統計的な推定や予測は含まれず、分布・比率は「暦の構造の要約」であって観測データの分析ではありません。
                </li>
              </ul>
            </Section>
          </>
        )}

        {/*
          「設定を読み込んでいます…」を出しっぱなしにしない。

          出発地は localStorage（物件スキャナーが保存する）から取るので、
          初めて来た人は空文字になる。空だと自動走査の条件を満たさず、
          days が null のままこの文言が残り続けていた。読み込み中ではなく
          入力待ちなので、待っても何も起きない。このページはサイトマップに
          載っていて検索からも来るため、行き止まりになっていた（本番で実測）。

          設定そのものがまだ来ていない一瞬だけ「読み込み中」、
          来たうえで足りないなら、何が足りないかと次の行き先を出す。
        */}
        {!days && !busy && !error && !settings && (
          <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center text-xs text-stone-500">
            設定を読み込んでいます…
          </div>
        )}

        {!days && !busy && !error && settings && !canScan && (
          <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center">
            <p className="text-sm font-bold text-stone-700">
              {missingLabel}を設定すると、ここに全期間の吉凶が出ます
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-stone-500">
              いつ動くのが良いかは、出発地から見た方位と本命星で決まります。どちらも物件スキャナーの設定と共有しているので、片方で入れればこちらにも反映されます。
            </p>
            <Link
              href="/relocation/arbitrage"
              className="mt-4 inline-block rounded-full bg-stone-800 px-5 py-2 text-xs text-white"
            >
              物件スキャナーで設定する
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
