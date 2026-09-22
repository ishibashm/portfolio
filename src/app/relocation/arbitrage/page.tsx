"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Compass } from "lucide-react";
import { ArbitrageMap } from "@/components/ArbitrageMap";
import { MetaphysicalConfigBar } from "@/components/layout/MetaphysicalConfigBar";
import { ArbitrageSidebarSection } from "@/components/relocation/ArbitrageSidebarSection";
import { TransactionsPanel } from "@/components/relocation/TransactionsPanel";
import { LandPriceByDirection } from "@/components/relocation/LandPriceByDirection";
import {
  HousingStatsByDirection,
  type HousingStatsData,
} from "@/components/relocation/HousingStatsByDirection";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";
import { PlaceInput } from "@/components/relocation/PlaceInput";
import { ActiveProfileBadge } from "@/components/profile/ActiveProfileBadge";
import type { DirectionTierRow } from "@/components/relocation/DirectionTierOverview";
import {
  loadSettings,
  readSettingsSync,
  saveSettings,
  settingBoolean,
  settingNumber,
  settingString,
  writeLocalSettings,
} from "@/lib/userSettings";
import { savePlacePoint } from "@/lib/placePoint";
import { nearestMunicipality, nearestPlaceLabel } from "@/lib/nearestPlace";
import { countByDirection } from "@/lib/directionTowns";
import { coreRouteLabel } from "@/lib/siteStructure";
import { saveWorkingDate } from "@/lib/workingDate";
import type { DayKigaku } from "@/lib/dayKigakuClient";
import {
  COMPASS_DIRECTIONS as ALL_DIRECTIONS,
  DIRECTION_LABELS,
  nodeMappingForBoard,
} from "@/utils/directionGeo";
import {
  parseDirectionFilterMode,
  type DirectionFilterMode,
} from "@/utils/directionFilterMode";
import {
  DEFAULT_TENCHUSATSU_MODE,
  TENCHUSATSU_MODES,
  isTenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";
import { OVERVIEW_CENTER } from "@/utils/arbitrageSearchArea";

/*
  暦エンジンをこのファイルから値で import しない。

  ephemerisEngine を値で読むと lunar-javascript と astronomy-engine
  （gzip 約 135 KB）が初回の読み込みに乗る（backlog 17 節）。方位の一覧と
  ラベルは directionGeo（葉）から取り、判定そのものは lib/dayKigakuClient
  を import() で遅延して呼ぶ。見張りは arbitrageBundleLeaf。
*/

/* 方位別の段階の一覧は本命卦（立春基準の年）を引くのでエンジンを
   読む。初回の描画に要らないので、判定と同じく遅延して読む。 */
const DirectionTierOverview = dynamic(
  () =>
    import("@/components/relocation/DirectionTierOverview").then(
      (m) => m.DirectionTierOverview,
    ),
  { ssr: false },
);

/**
 * 方位で街を探す。
 *
 * **2026-09-20 に「物件を方位で探す」から組み替えた。**掲載（スクレイプした
 * 物件）の取り込みは規約に従って止めたので（backlog 29 節）、物件の一覧・
 * ピン・家賃や間取りの絞り込み・お気に入り・スマート検索は全部外した。
 * 残したのは**出発地から見た方位の吉凶**と、**その方位にある市区町村の
 * 水準（e-Stat）**の 2 つ。同行者の判定は時期ツール（2 年ぶん）に寄せ、
 * こちらからは繋ぐだけにする。
 *
 * 判定の入力（生年月日・出発地・対象日・盤・絞り込みの見方）は他の頁と
 * 同じ設定（lib/userSettings）から読む。**画面の初期値を保存に流さない**
 * （CLAUDE.md 3 節。出発地は利用者が入れたときだけ書く）。
 */

/** 「出発地から何 km までの街を見るか」。null は全国（API の上限で切る）。 */
const RADIUS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 50, label: "50km" },
  { value: 100, label: "100km" },
  { value: 200, label: "200km" },
  { value: 500, label: "500km" },
  { value: null, label: "全国" },
];
const DEFAULT_RADIUS_KM = 100;

/**
 * 頁の状態。**マウント時に 1 回で読む**ので 1 つの object にしてある
 * （項目ごとに setState を並べると、読み込みの effect が項目の数だけ
 * set-state-in-effect に掛かる）。
 */
interface PageState {
  birthDate: string;
  baseLat: string;
  baseLon: string;
  targetDate: string;
  useClassical: boolean;
  useTrueNorth: boolean;
  layerMode: string;
  directionFilterMode: DirectionFilterMode;
  tenchusatsuMode: string;
  involuntaryMove: boolean;
  radiusKm: number | null;
  /** "ALL" なら絞り込んでいない */
  selectedDirection: string;
  mapCenter: [number, number];
  /** mapCenter の意味。area=出発地 / spot=調べている地点 */
  mapFocusKind: "area" | "spot";
  /** 全国を俯瞰して開くか（時期ツールから来たとき） */
  openOverview: boolean;
}

/** 設定の座標を文字列にする。数でなければ「無い」ことにする（#1426）。 */
function coordText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}

function radiusFromText(raw: string | null): number | null | undefined {
  if (raw === null) return undefined;
  if (raw === "all") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * 保存済みの設定と URL から初期状態を組む。**生年月日・出発地に既定値を
 * 置かない。**空のままなら「入れると塗り分けます」と出す。
 */
function readInitialState(): PageState {
  const config = readSettingsSync();
  const ls = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const state: PageState = {
    birthDate: "",
    baseLat: "",
    baseLon: "",
    targetDate: "",
    useClassical: true,
    useTrueNorth: true,
    layerMode: "year",
    directionFilterMode: "composite",
    tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE,
    involuntaryMove: false,
    radiusKm: DEFAULT_RADIUS_KM,
    selectedDirection: "ALL",
    mapCenter: OVERVIEW_CENTER,
    mapFocusKind: "area",
    openOverview: false,
  };

  state.birthDate = settingString(config, "birth_date") ?? "";
  state.baseLat = coordText(settingNumber(config, "base_lat"));
  state.baseLon = coordText(settingNumber(config, "base_lon"));
  const classical = settingBoolean(config, "use_classical_board");
  if (classical !== undefined) state.useClassical = classical;
  const trueNorth = settingBoolean(config, "use_true_north");
  if (trueNorth !== undefined) state.useTrueNorth = trueNorth;
  const layer = settingString(config, "layer_mode") ?? ls("arb_layerMode");
  if (layer) state.layerMode = layer;
  const target = settingString(config, "target_date") ?? ls("arb_targetDate");
  if (target) state.targetDate = target;
  const filter = settingString(config, "direction_filter_mode");
  if (filter) state.directionFilterMode = parseDirectionFilterMode(filter);
  const radiusNum = settingNumber(config, "radius_km");
  const radius = radiusFromText(
    settingString(config, "radius_km") ??
      (radiusNum === undefined ? null : String(radiusNum)),
  );
  if (radius !== undefined) state.radiusKm = radius;

  /*
    天中殺の扱いと「やむを得ない移動」も正の設定から読む。以前はこの頁
    だけが旧い塊（arb_axis_prefs_v1）を直に読み書きしていて、**時期
    ツールへ伝わっていなかった**（あちらは tenchusatsu_mode を読むが、
    どこも書いていないので常に既定で走っていた。2026-09-20 に判明）。
    旧い塊しか持っていない端末は readSettingsSync の引き上げが拾う。
  */
  const mode = settingString(config, "tenchusatsu_mode");
  if (mode && isTenchusatsuMode(mode)) state.tenchusatsuMode = mode;
  const involuntary = settingBoolean(config, "involuntary_move");
  if (involuntary !== undefined) state.involuntaryMove = involuntary;

  /*
    URL の値を最優先にする。/houi/area/* の「この街を出発地にして探す」と、
    時期ツールの「この日・この方位で街を見る」から来る。保存済みの設定に
    上書きされて別の場所・別の日の結果を見ることがないようにする。
    useSearchParams だと Suspense 境界が要るので location から直接読む。
  */
  try {
    const qs = new URLSearchParams(window.location.search);
    const qLat = parseFloat(qs.get("baseLat") || "");
    const qLon = parseFloat(qs.get("baseLon") || "");
    if (!isNaN(qLat) && !isNaN(qLon)) {
      state.baseLat = String(qLat);
      state.baseLon = String(qLon);
    }
    const qDate = qs.get("targetDate");
    if (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)) {
      state.targetDate = qDate;
      /* MetaphysicalConfigBar がマウント時に保存済みの日付で
         onConfigChange を投げるので、保存側にも書いておく。 */
      saveWorkingDate(qDate);
    }
    if (qs.get("view") === "overview") state.openOverview = true;
    const qDir = qs.get("direction");
    if (qDir && ALL_DIRECTIONS.some((d) => d === qDir))
      state.selectedDirection = qDir;
    const qTenchu = qs.get("tenchusatsuMode");
    if (qTenchu && isTenchusatsuMode(qTenchu)) state.tenchusatsuMode = qTenchu;
    if (qs.get("involuntaryMove") === "true") state.involuntaryMove = true;
    const qRadius = radiusFromText(qs.get("radiusKm"));
    if (qRadius !== undefined) state.radiusKm = qRadius;
  } catch {
    /* URL の解釈に失敗しても保存済みの設定で動かす */
  }

  const lat = parseFloat(state.baseLat);
  const lon = parseFloat(state.baseLon);
  if (state.openOverview) {
    state.mapCenter = OVERVIEW_CENTER;
  } else if (!isNaN(lat) && !isNaN(lon)) {
    state.mapCenter = [lat, lon];
  }
  return state;
}

export default function DirectionTownsPage() {
  const [state, setState] = useState<PageState | null>(null);
  const patch = useCallback((p: Partial<PageState>) => {
    setState((prev) => (prev ? { ...prev, ...p } : prev));
  }, []);

  /* 端末の保存値と URL は描画のあとでしか読めない（サーバでは無い）。 */
  useEffect(() => {
    const initial = readInitialState();
    setState(initial);

    /*
      端末に出発地が無いとき（別のブラウザ、履歴を消した後など）だけ、
      クラウドの設定を取りに行く。出発地があるのに取りに行くと、URL で
      指定された出発地がクラウドの値に上書きされる。
    */
    if (initial.baseLat === "" || initial.baseLon === "") {
      let alive = true;
      (async () => {
        try {
          const { settings: cfg } = await loadSettings();
          const lat = settingNumber(cfg, "base_lat");
          const lon = settingNumber(cfg, "base_lon");
          if (!alive || lat === undefined || lon === undefined) return;
          setState((prev) =>
            prev && prev.baseLat === ""
              ? {
                  ...prev,
                  baseLat: String(lat),
                  baseLon: String(lon),
                  mapCenter: prev.openOverview ? prev.mapCenter : [lat, lon],
                  mapFocusKind: "area",
                }
              : prev,
          );
        } catch {
          /* 取得できなくても入力欄から設定できる */
        }
      })();
      return () => {
        alive = false;
      };
    }
  }, []);

  const birthDate = state?.birthDate ?? "";
  const baseLat = state?.baseLat ?? "";
  const baseLon = state?.baseLon ?? "";
  const targetDate = state?.targetDate ?? "";
  const useClassical = state?.useClassical ?? true;
  const useTrueNorth = state?.useTrueNorth ?? true;
  const layerMode = state?.layerMode ?? "year";
  const directionFilterMode: DirectionFilterMode =
    state?.directionFilterMode ?? "composite";
  const tenchusatsuMode = state?.tenchusatsuMode ?? DEFAULT_TENCHUSATSU_MODE;
  const involuntaryMove = state?.involuntaryMove ?? false;
  const radiusKm = state === null ? DEFAULT_RADIUS_KM : state.radiusKm;
  const selectedDirection = state?.selectedDirection ?? "ALL";
  const mapCenter = state?.mapCenter ?? OVERVIEW_CENTER;
  const mapFocusKind = state?.mapFocusKind ?? "area";

  const hasBaseLocation =
    baseLat !== "" &&
    baseLon !== "" &&
    !isNaN(parseFloat(baseLat)) &&
    !isNaN(parseFloat(baseLon));
  const baseLatNum = hasBaseLocation ? parseFloat(baseLat) : 0;
  const baseLonNum = hasBaseLocation ? parseFloat(baseLon) : 0;

  /*
    天中殺の扱いは正の設定に残す。時期ツールがここを読んで走査するので、
    **この 2 行が書かれないと、あちらは何を選んでも既定のまま**になる。
    クラウドには送らない（SYNCED_FIELDS に入れていないので _savedAt も
    進まない）。
  */
  useEffect(() => {
    if (!state) return;
    writeLocalSettings({
      tenchusatsu_mode: tenchusatsuMode,
      involuntary_move: involuntaryMove,
    });
  }, [state, tenchusatsuMode, involuntaryMove]);

  /**
   * 出発地を決める。利用者が入れたときだけ保存に流す。
   *
   * **`name` を落とさない。**地名で選んだときの名前を捨てると、前に
   * 登録した地名が `base_label` に残り、同じ画面の帯が別の街の名前を
   * 出し続ける（`lib/placePoint` の冒頭に経緯）。名前が無いとき
   * （現在地ボタン・緯度経度の直接入力）は、向こうで欄ごと消える。
   */
  const setBase = useCallback(
    (lat: number, lon: number, name?: string) => {
      patch({
        baseLat: String(lat),
        baseLon: String(lon),
        mapCenter: [lat, lon],
        mapFocusKind: "area",
        openOverview: false,
      });
      void savePlacePoint("base", lat, lon, name);
      window.dispatchEvent(
        new CustomEvent("metaphysical-config-updated", {
          detail: { baseLat: lat, baseLon: lon },
        }),
      );
    },
    [patch],
  );

  const useCurrentLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setBase(pos.coords.latitude, pos.coords.longitude),
      () => {
        /* 断られたら欄から入れてもらう */
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }, [setBase]);

  const canJudgeDirections = Boolean(
    hasBaseLocation && birthDate && targetDate,
  );

  /** 出せない理由。地図の凡例と街の一覧にそのまま出す。 */
  const kigakuUnavailableReason = useMemo(() => {
    if (canJudgeDirections) return undefined;
    const missing: string[] = [];
    if (!hasBaseLocation) missing.push("出発地");
    if (!birthDate) missing.push("生年月日");
    if (!targetDate) missing.push("対象日");
    return `${missing.join("と")}を入れると方位の吉凶で塗り分けます`;
  }, [canJudgeDirections, hasBaseLocation, birthDate, targetDate]);

  /*
    選択日の盤を 1 回だけ組み、方位別と県別の両方を切り出す。地図の
    扇形・俯瞰の県塗り・街の一覧の並び・地点の判定がすべてこの結果を
    読む。判定に要る入力を 1 つの鍵にまとめ、状態は「どの鍵で出した
    答えか」と一緒に持つ。鍵が変わった瞬間に古い答えを出さない。
  */
  const dayKigakuKey = canJudgeDirections
    ? JSON.stringify([
        birthDate,
        targetDate,
        baseLat,
        baseLon,
        tenchusatsuMode,
        involuntaryMove,
        directionFilterMode,
        useClassical,
      ])
    : "";
  const [dayKigakuState, setDayKigakuState] = useState<{
    key: string;
    value: DayKigaku | undefined;
  }>({ key: "", value: undefined });
  useEffect(() => {
    if (!dayKigakuKey) return;
    let alive = true;
    /* 暦エンジンはここで初めて読む。判定に要る値が揃った人にだけ、
       揃った時点で読み込む。 */
    import("@/lib/dayKigakuClient").then(({ computeDayKigaku }) => {
      if (!alive) return;
      setDayKigakuState({
        key: dayKigakuKey,
        value: computeDayKigaku({
          birthDate,
          targetDate,
          baseLat,
          baseLon,
          tenchusatsuMode,
          involuntaryMove,
          directionFilterMode,
          useClassical,
        }),
      });
    });
    return () => {
      alive = false;
    };
  }, [
    dayKigakuKey,
    birthDate,
    targetDate,
    baseLat,
    baseLon,
    tenchusatsuMode,
    involuntaryMove,
    directionFilterMode,
    useClassical,
  ]);
  const dayKigaku =
    dayKigakuKey !== "" && dayKigakuState.key === dayKigakuKey
      ? dayKigakuState.value
      : undefined;

  /** 方位ごとの街の統計（e-Stat）。届いたら方位の一覧に街の数を入れる。 */
  const [housing, setHousing] = useState<HousingStatsData | null>(null);
  const townCounts = useMemo(
    () => countByDirection(housing?.directions ?? []),
    [housing],
  );

  /**
   * 方位ごとの「その日の段階」と「その方位にある街の数」。判定を出せない
   * ときは空（置くだけで暦エンジンを読む部品なので、行が無ければ置かない）。
   */
  const directionTierRows = useMemo<DirectionTierRow[]>(() => {
    if (!dayKigaku) return [];
    return ALL_DIRECTIONS.map((d) => {
      const cell = dayKigaku.byDirection[d];
      return {
        direction: d,
        directionLabel: cell?.directionLabel ?? DIRECTION_LABELS[d],
        tier: cell?.tier ?? "",
        blocked: cell?.blocked ?? false,
        count: townCounts[d],
      };
    });
  }, [dayKigaku, townCounts]);

  /** 地図でクリックされた地点。seq は同じ場所の押し直しを区別する。 */
  const [spotRequest, setSpotRequest] = useState<{
    lat: number;
    lon: number;
    seq: number;
  } | null>(null);

  const basePlace = useMemo(
    () =>
      hasBaseLocation ? nearestMunicipality(baseLatNum, baseLonNum) : null,
    [hasBaseLocation, baseLatNum, baseLonNum],
  );
  const basePlaceLabel = nearestPlaceLabel(basePlace);

  const selectedDirectionLabel = ALL_DIRECTIONS.some(
    (d) => d === selectedDirection,
  )
    ? DIRECTION_LABELS[selectedDirection as (typeof ALL_DIRECTIONS)[number]]
    : null;

  const tenchusatsuEntry = TENCHUSATSU_MODES.find(
    (m) => m.id === tenchusatsuMode,
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 p-4 md:p-8 font-sans">
      {/* 地図と一覧を左右に並べる画面なので、余った幅はそのまま地図の
          描画面積になる（CLAUDE.md 3 節「頁の横幅」）。 */}
      <div className="max-w-[2560px] mx-auto space-y-6">
        <div className="bg-white/80 backdrop-blur-xl border border-rose-100/80 p-6 rounded-3xl shadow-xl shadow-rose-100/30">
          <h1 className="text-xl font-bold font-serif text-stone-900 flex items-center gap-2">
            <Compass className="w-6 h-6 text-amber-500" />
            {coreRouteLabel("/relocation/arbitrage")}
          </h1>
          <p className="text-stone-600 mt-1 text-xs max-w-[70ch] leading-relaxed">
            いま住んでいる場所から見た八方位の吉凶と、それぞれの方位にある市区町村の家賃の水準・空き家率を並べます。物件の掲載は出しません。
          </p>
          {/* どのプロフィールで方位を出しているかを頭に 1 行 */}
          <ActiveProfileBadge purpose="方位の吉凶と街の並び" className="mt-3" />
          <p className="mt-3 text-xs leading-relaxed text-stone-600 max-w-[70ch]">
            {"日を決めるのが先です。いつなら動けるかは "}
            <Link
              href="/relocation/timing"
              className="inline-flex min-h-[24px] items-center font-bold underline text-indigo-700 hover:text-indigo-900"
            >
              引っ越し時期
            </Link>
            {
              " で見て、その日に開いている方位の街をここで見ます。同行者がいる場合の判定もそちらにあります。"
            }
          </p>
        </div>

        {/* 対象日・盤・絞り込みの見方・目的。他の頁と同じ設定バー。 */}
        <MetaphysicalConfigBar
          onConfigChange={(c) => {
            patch({
              targetDate: c.targetDate,
              useClassical: c.useClassicalBoard,
              directionFilterMode: c.directionFilterMode,
              ...(c.birthDate ? { birthDate: c.birthDate } : {}),
            });
          }}
        />

        {/* 出発地が未設定のときは結果を出さずに設定を促す。
            方位は出発地からの向きで決まるため、ここが無いと判定が成立しない。 */}
        {state !== null && !hasBaseLocation && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 space-y-3">
            <h2 className="text-sm font-bold text-amber-900">
              出発地を入れてください
            </h2>
            <p className="text-xs text-amber-800 leading-relaxed max-w-[70ch]">
              方位は「いま住んでいる場所から見てどの向きか」で決まります。出発地が無いと方位が定まらないので、街の一覧も地図の塗り分けも出しません。
            </p>
            <PlaceInput
              label="いま住んでいるところ"
              lat={null}
              lon={null}
              onChange={setBase}
              onUseCurrentLocation={useCurrentLocation}
              variant="form"
              help="市区町村名や駅名で探せます。判定は座標で決まり、他の道具でも同じ出発地を使います。"
            />
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-5 items-stretch">
          {/* 左: 条件と街の一覧 */}
          <div className="w-full lg:w-[36%] xl:w-[32%] space-y-4">
            {hasBaseLocation && (
              <ArbitrageSidebarSection
                title="出発地と範囲"
                summary={
                  basePlaceLabel
                    ? `${basePlaceLabel} / ${radiusKm === null ? "全国" : `${radiusKm}km`}`
                    : "未設定"
                }
              >
                <PlaceInput
                  label="いま住んでいるところ"
                  lat={baseLatNum}
                  lon={baseLonNum}
                  onChange={setBase}
                  onUseCurrentLocation={useCurrentLocation}
                  help="方位はここから測ります。"
                />
                <div className="space-y-1">
                  <label
                    htmlFor="towns-radius"
                    className="text-xs font-semibold text-stone-600 block"
                  >
                    どこまでの街を見るか
                  </label>
                  <select
                    id="towns-radius"
                    value={radiusKm === null ? "all" : String(radiusKm)}
                    onChange={(e) => {
                      const v = radiusFromText(e.target.value);
                      if (v === undefined) return;
                      patch({ radiusKm: v });
                      void saveSettings({
                        radius_km: v === null ? "all" : String(v),
                      });
                    }}
                    className="w-full min-h-[36px] px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  >
                    {RADIUS_OPTIONS.map((o) => (
                      <option
                        key={o.label}
                        value={o.value === null ? "all" : String(o.value)}
                      >
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                {basePlace && (
                  <p className="text-xs leading-relaxed text-stone-600">
                    <Link
                      href={`/houi/area/${basePlace.code}`}
                      className="inline-flex min-h-[24px] items-center font-bold underline text-indigo-700 hover:text-indigo-900"
                    >
                      {`${basePlace.pref}${basePlace.city}のページ`}
                    </Link>
                    {
                      " には、方位ごとの街と募集を見に行く導線（各社のサイト）があります。"
                    }
                  </p>
                )}
              </ArbitrageSidebarSection>
            )}

            {/* 天中殺の扱い。年天中殺は 2 年続くため、既定の厳格な扱いだと
                その間はどの方位・どの日も動けない判定になる。流派で違うので
                選べるようにしてある（時期ツールと同じ選択肢）。 */}
            {hasBaseLocation && (
              <ArbitrageSidebarSection
                title="天中殺の扱い"
                summary={tenchusatsuEntry?.label ?? tenchusatsuMode}
              >
                <select
                  aria-label="天中殺の扱い"
                  value={tenchusatsuMode}
                  onChange={(e) => {
                    if (isTenchusatsuMode(e.target.value))
                      patch({ tenchusatsuMode: e.target.value });
                  }}
                  className="w-full min-h-[36px] px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                >
                  {TENCHUSATSU_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-relaxed text-stone-600">
                  {tenchusatsuEntry?.description ?? ""}
                </p>
                <label className="flex min-h-[24px] items-center gap-2 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={involuntaryMove}
                    onChange={(e) =>
                      patch({ involuntaryMove: e.target.checked })
                    }
                  />
                  転勤などやむを得ない移動（天中殺の影響を受けないとする立場）
                </label>
              </ArbitrageSidebarSection>
            )}

            {/* どの方位が動ける方位で、そこに街がいくつあるか。
                行が空（判定を出せない）のときは置かない。置くだけで
                その塊（honmeiYear → 暦エンジン）を取りに行く（#883）。 */}
            {directionTierRows.length > 0 && (
              <DirectionTierOverview
                rows={directionTierRows}
                selectedDirection={selectedDirection}
                onSelectDirection={(dir) => patch({ selectedDirection: dir })}
                birthDate={birthDate}
              />
            )}

            {/* 方位ごとの街（e-Stat の市区町村の統計）。判定があれば開いている
                方位の順に並び、段階の札が付く。方位の切り方は地図と同じ
                （#1297・#1298）。 */}
            <div className="rounded-3xl border border-stone-200 bg-white/80 p-4 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-stone-900">
                  方位ごとの街
                </h2>
                {selectedDirectionLabel && (
                  <button
                    type="button"
                    onClick={() => patch({ selectedDirection: "ALL" })}
                    className="min-h-[24px] text-xs font-bold text-indigo-700 underline"
                  >
                    {`${selectedDirectionLabel}だけ表示中 — 全方位に戻す`}
                  </button>
                )}
              </div>
              {kigakuUnavailableReason && hasBaseLocation && (
                <p className="text-xs leading-relaxed text-amber-800">
                  {`${kigakuUnavailableReason}。それまでは八方位の順に並べます。`}
                </p>
              )}
              <HousingStatsByDirection
                lat={baseLatNum}
                lon={baseLonNum}
                radiusKm={radiusKm}
                hasBase={hasBaseLocation}
                nodeMapping={nodeMappingForBoard(useClassical)}
                verdicts={dayKigaku?.byDirection}
                selectedDirection={selectedDirection}
                onData={setHousing}
              />
            </div>

            {/* 一覧に無い場所の判定。これから内見に行く先などを、画面を
                移らずに確かめる。判定は dayKigaku の段階をそのまま使う。
                地図のクリックがここへ届くので、畳める札には入れない
                （畳んだままだと押した結果が見えない）。 */}
            {hasBaseLocation && (
              <div className="rounded-3xl border border-stone-200 bg-white/80 p-4 space-y-3">
                <h2 className="text-sm font-bold text-stone-900">
                  この地点を調べる
                </h2>
                <SpotVerdict
                  baseLat={baseLatNum}
                  baseLon={baseLonNum}
                  useClassical={useClassical}
                  dirKigaku={dayKigaku?.byDirection}
                  kigakuUnavailableReason={kigakuUnavailableReason}
                  requestedPoint={spotRequest}
                  onFocus={(lat, lon) =>
                    patch({ mapCenter: [lat, lon], mapFocusKind: "spot" })
                  }
                />
              </div>
            )}

            {/* 買う人向け。国交省の成約価格と地価公示を方位別に。 */}
            {hasBaseLocation && (
              <ArbitrageSidebarSection
                title="買うときの水準（成約価格・地価）"
                summary="国土交通省の公開データ"
              >
                <TransactionsPanel
                  lat={baseLatNum}
                  lon={baseLonNum}
                  radiusKm={radiusKm}
                  hasBase={hasBaseLocation}
                  nodeMapping={nodeMappingForBoard(useClassical)}
                />
                <LandPriceByDirection
                  lat={baseLatNum}
                  lon={baseLonNum}
                  radiusKm={radiusKm}
                  hasBase={hasBaseLocation}
                  nodeMapping={nodeMappingForBoard(useClassical)}
                />
              </ArbitrageSidebarSection>
            )}
          </div>

          {/* 右: 地図。扇形と県塗りは dayKigaku から。物件は描かない。 */}
          <div className="w-full lg:w-[64%] xl:w-[68%] h-[60vh] lg:h-[calc(100vh-220px)] min-h-[420px] lg:min-h-[600px] rounded-3xl overflow-hidden shadow-lg border border-stone-200 relative bg-stone-50 shrink-0">
            <ArbitrageMap
              baseLat={hasBaseLocation ? baseLatNum : mapCenter[0]}
              baseLon={hasBaseLocation ? baseLonNum : mapCenter[1]}
              mapCenter={mapCenter}
              useTrueNorth={useTrueNorth}
              layerMode={layerMode}
              radiusKm={radiusKm === null ? "all" : String(radiusKm)}
              keepWideView={state?.openOverview ?? false}
              prefKigaku={dayKigaku?.byPrefecture}
              dirKigaku={dayKigaku?.byDirection}
              kigakuUnavailableReason={kigakuUnavailableReason}
              onInspectSpot={(lat, lon) =>
                setSpotRequest((prev) => ({
                  lat,
                  lon,
                  seq: (prev?.seq ?? 0) + 1,
                }))
              }
              targetDate={targetDate}
              hasBase={hasBaseLocation}
              focusKind={mapFocusKind}
              useClassical={useClassical}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
