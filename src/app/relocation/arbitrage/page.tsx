"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  Loader2,
  MapPin,
  TrendingUp,
  Sparkles,
  Filter,
  Download,
  Search,
  Settings,
  RefreshCw,
} from "lucide-react";
import { ArbitrageMap } from "@/components/ArbitrageMap";
import { ArbitrageSidebarSection } from "@/components/relocation/ArbitrageSidebarSection";
import { loadSettings } from "@/lib/userSettings";
import {
  MetaphysicalConfigBar,
  MetaphysicalConfig,
} from "@/components/layout/MetaphysicalConfigBar";
import { AstroGridCalendar } from "@/components/realestate/AstroGridCalendar";
import {
  getRecommendationStarCount,
  getPropertyPinColors,
  isAvoidStatus as isAvoidAstrologyStatus,
} from "@/utils/arbitrageHelpers";
import {
  AXIS_META,
  AXIS_ORDER,
  AxisKey,
  AxisScores,
  CANDIDATE_STRATEGIES,
  DEFAULT_CANDIDATE_STRATEGY,
  DEFAULT_PRESET_ID,
  WEIGHT_PRESETS,
  composeScore,
  getPreset,
  scoreCost,
  slidersToWeights,
  weightsToSliders,
} from "@/utils/arbitrageScoring";
import { DEFAULT_PARTY_POLICY, PARTY_POLICIES } from "@/utils/arbitrageParty";
import {
  DEFAULT_TENCHUSATSU_MODE,
  TENCHUSATSU_MODES,
} from "@/utils/tenchusatsuPolicy";
import type { ProfilePreset } from "@/lib/profilePresetSync";
import { ALL_DIRECTIONS, DIRECTION_LABELS } from "@/utils/auspiciousDays";

/**
 * 吉凶ステータスの日本語表記。
 *
 * 「全員が動ける日が 0 日」の理由を出すときに使う。NOISE_TENCHU のような
 * 内部表記のまま画面に出しても、何を直せばよいのかが伝わらない。
 */
const ASTRO_STATUS_LABELS: Record<string, string> = {
  NOISE_TENCHU: "天中殺（この期間は移転不可）",
  NOISE_VOID: "空亡",
  NOISE_GOU: "五黄殺",
  NOISE_ANKEN: "暗剣殺",
  NOISE_HA: "歳破",
  NOISE_HONMEI: "本命殺",
  NOISE_TEKI: "本命的殺",
  NOISE_GETSUMEI: "月命殺",
  NOISE_GETSUTEKI: "月命的殺",
  NOISE_NODE: "月交点ノイズ",
};

// 吉凶バッジ定義のインターフェース
interface BadgeItem {
  label: string;
  type: "calendar" | "individual"; // 枠線のみ or 塗りつぶし
  colorClass: string;
  priority: number;
}

const getTodayString = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeDateTimeLocal = (dateStr: string): string => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
  } catch (e) {}
  if (dateStr.includes("T")) {
    return dateStr.substring(0, 16);
  }
  return `${dateStr}T12:00`;
};

import dynamic from "next/dynamic";

import prefecturesWithData from "@/data/prefecturesWithData.json";
import {
  SmartFilters,
  hasStructuredFilters,
  parseSmartQuery,
} from "@/utils/smartSearch";
import { SCRAPE_TARGETS } from "@/lib/scrapeTargets";
import {
  DEFAULT_SEARCH_AREA,
  OVERVIEW_CENTER,
  initialViewBounds,
  DEFAULT_RADIUS_KM,
  NEARBY_SEARCH_AREA,
  NATIONWIDE_SEARCH_AREA,
  SEARCH_AREA_STORAGE_KEY,
  filtersForSearchArea,
  geographyParamsForSearch,
  normalizeStoredSearchArea,
  searchAreaForFilters,
  searchAreaFromUrl,
} from "@/utils/arbitrageSearchArea";

/**
 * スキャナーで選べる都道府県と、選択時に地図を寄せる代表座標。
 *
 * 以前はここに県名を直書きし、scripts/purge_rental_properties.ts と手で
 * 揃える運用だった。揃わずに、対象外でパージ済みの岐阜が選択肢に残って0件を
 * 返し、逆に最大在庫の大阪が選べない状態になっていた。対象県は
 * src/lib/scrapeTargets.ts を唯一の情報源にして、ここはそれを引くだけにする。
 *
 * さらに、対象に足したばかりでまだ物件を取り切れていない県を出しても0件に
 * なるだけなので、実際にデータが載った県だけに絞る。この一覧は
 * scripts/build_area_dataset.ts が毎晩吐き直すので、取り込みが進めば自動で
 * 増える。areaDirections.json は78KBあり client バンドルに乗せられないため、
 * 県名だけの小さな JSON を別に持っている。
 *
 * 件数はデータが日々動くので出さない（古い数字が残ると誤解のもとになる）。
 */
const PREFS_WITH_DATA = new Set<string>(prefecturesWithData.prefs);
const TARGET_PREFECTURES = SCRAPE_TARGETS.filter(
  // 生成が一度も走っていない場合に選択肢が空になるのは避ける
  (t) => PREFS_WITH_DATA.size === 0 || PREFS_WITH_DATA.has(t.name),
).map((t) => ({ name: t.name, lat: t.lat, lon: t.lon }));

/**
 * スキャン半径の既定値（km）。
 *
 * 以前は "all"（無制限）が既定で、出発地を設定した初回検索が必ず全国 45 万行の
 * 名寄せに入っていた。実測 18.4 秒（2026-08-09、prefecture=all・半径なし）。
 * これが「スキャンが終わらない」の正体で、絞り込みが効けば行数に比例して速い
 * （兵庫県 3.1 秒 / 神戸 30km 4.0 秒 / 名古屋 50km＋愛知 2.6 秒）。
 *
 * 150km はエリア別ページの対象範囲に合わせられるかを測ったが、関西起点で
 * 在庫の 6 割（26.5 万行）を拾って 10.9 秒になるため既定にできない。
 * 50km なら最悪ケースでも数秒に収まる。
 *
 * 画面では「都道府県指定なし（出発地から50km）」と「全国検索」を別項目にする。
 * API ではどちらも prefecture=all なので、radiusKm まで一緒に保存しないと
 * 表示と実際の検索範囲が食い違う。
 */
/** 適用中の絞り込み 1 件ぶんのチップ。× で外す */
function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-50 border border-indigo-200 text-[10px] font-semibold text-indigo-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${label} を外す`}
        className="w-3.5 h-3.5 rounded-full hover:bg-indigo-200 text-indigo-500 leading-none"
      >
        ×
      </button>
    </span>
  );
}

const LocationPickerInner = dynamic(
  () => import("@/components/LocationPickerInner"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-gray-100 dark:bg-stone-100 flex items-center justify-center font-mono text-xs text-stone-400">
        マップを読み込み中...
      </div>
    ),
  },
);

export default function ArbitrageScannerPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isTransitioningDate, setIsTransitioningDate] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Sidebar & Layout views states
  const [showListView, setShowListView] = useState(false);
  const [showTableView, setShowTableView] = useState(false);

  // Relocation & Fortune Settings States
  // 出発地は既定値を持たない。以前は日本の中心（38.0/137.0＝日本海上）を
  // 既定にしていたため、設定しないまま使うと県内の物件がすべて同じ方位に潰れ、
  // 方位の点数が全件同じ＝順位が㎡単価だけで決まる状態になっていた。
  const [baseLat, setBaseLat] = useState("");
  const [baseLon, setBaseLon] = useState("");
  const hasBaseLocation =
    baseLat !== "" &&
    baseLon !== "" &&
    !isNaN(parseFloat(baseLat)) &&
    !isNaN(parseFloat(baseLon));
  const [birthLat, setBirthLat] = useState("34.3952"); // Default Birth Location (Hiroshima)
  const [birthLon, setBirthLon] = useState("132.4482");
  const [birthDate, setBirthDate] = useState("1988-11-25T04:26"); // Default Birth Date with time
  const [targetDate, setTargetDate] = useState(getTodayString()); // Default Target Date
  const [directionFilterMode, setDirectionFilterMode] = useState("composite");
  const [actionIntent, setActionIntent] = useState("MIGRATION");
  const [radiusKm, setRadiusKm] = useState(
    filtersForSearchArea(DEFAULT_SEARCH_AREA).radiusKm,
  ); // Scan Radius (km)
  const [prefecture, setPrefecture] = useState("all"); // Target Prefecture
  const [useClassical, setUseClassical] = useState(false);
  const [layerMode, setLayerMode] = useState("year");
  const [useTrueNorth, setUseTrueNorth] = useState(false);
  const [lunarPhaseModifier, setLunarPhaseModifier] = useState(true);
  const [dataLimit, setDataLimit] = useState(500);
  const [mapCenter, setMapCenter] = useState<[number, number]>([38.0, 137.0]); // Default to Japan center

  // Viewport bounds for map searching
  const [mapBounds, setMapBounds] = useState<{
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    zoom: number;
  } | null>(null);

  // 前回のパラメータを保持して比較する ref
  const prevParamsRef = useRef({
    baseLat,
    baseLon,
    birthLat,
    birthLon,
    birthDate,
    radiusKm,
    prefecture,
    useClassical,
    layerMode,
    useTrueNorth,
    lunarPhaseModifier,
    directionFilterMode,
    actionIntent,
    // 候補の集め方は SQL の並び順を変えるので、変わったら取り直しが要る。
    // この ref は candidateStrategy の state 宣言より前にあるため既定値で埋める。
    candidateStrategy: DEFAULT_CANDIDATE_STRATEGY as string,
    // 同行者・まとめ方・走査期間はサーバ側の判定を変えるので取り直しが要る。
    partyParam: "",
    partyPolicy: DEFAULT_PARTY_POLICY as string,
    horizonDays: 30,
    tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE as string,
    involuntaryMove: false,
    mapBounds,
  });

  // Temporary local inputs to avoid API hammering during typing
  const [localLat, setLocalLat] = useState("");
  const [localLon, setLocalLon] = useState("");
  const [showBaseMapPicker, setShowBaseMapPicker] = useState(false);
  const [localBirthDate, setLocalBirthDate] = useState("1988-11-25T04:26");
  const [localBirthLat, setLocalBirthLat] = useState("34.3952");
  const [localBirthLon, setLocalBirthLon] = useState("132.4482");
  const [showBirthMapPicker, setShowBirthMapPicker] = useState(false);
  const [localTargetDate, setLocalTargetDate] = useState(getTodayString());

  // おすすめ度（星マーク）の描画
  // 星は総合スコアの見た目表現。arbitrageScore は割安さが 6 割を占めるため、
  // 凶方位や天中殺でも安ければ 5 つ星が付き、「移転NG ★★★★★」という
  // 矛盾した表示になっていた。避けるべきものは 1 つ星に倒す。
  const renderStars = (score: number, status?: string) => {
    const count = getRecommendationStarCount(score, status);
    if (count === 1 && status && isAvoidAstrologyStatus(status)) {
      return renderStarRow(1, "避けるべき方位・期間のため評価を下げています");
    }
    return renderStarRow(count, `おすすめ度: ${score.toFixed(1)}`);
  };

  /** 軸スコアの色。50 を境に暖色／寒色へ振り、一目で強弱が分かるようにする。 */
  const axisBarColor = (score: number) => {
    if (score >= 75) return "bg-emerald-500";
    if (score >= 60) return "bg-lime-500";
    if (score >= 45) return "bg-amber-400";
    if (score >= 30) return "bg-orange-400";
    return "bg-rose-400";
  };

  /**
   * 物件 1 件の軸別プロファイル。
   *
   * 総合スコアだけでは「なぜ上位なのか」が分からず、重みを変えても
   * 順位が入れ替わる理由が読めない。重みが乗っている軸だけを、
   * 重みの大きい順に並べて出す。
   */
  const renderAxisBars = (item: any, max = 5) => {
    const axes: AxisScores = item.axes ?? {};
    const shown = AXIS_ORDER.filter((key) => (activeWeights[key] ?? 0) > 0)
      .sort((a, b) => (activeWeights[b] ?? 0) - (activeWeights[a] ?? 0))
      .slice(0, max);

    if (shown.length === 0) return null;

    return (
      <div className="space-y-1">
        {shown.map((key) => {
          const value = axes[key];
          const meta = AXIS_META[key];
          const weightPct = Math.round((activeWeights[key] ?? 0) * 100);
          const missing = value === null || value === undefined;
          return (
            <div
              key={key}
              className="flex items-center gap-1.5"
              title={`${meta.label}（重み ${weightPct}%）: ${meta.hint}`}
            >
              <span className="w-14 shrink-0 text-[9px] text-stone-500 truncate">
                {meta.label}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-stone-200/80 overflow-hidden">
                {!missing && (
                  <div
                    className={`h-full rounded-full ${axisBarColor(value as number)}`}
                    style={{ width: `${Math.max(2, value as number)}%` }}
                  />
                )}
              </div>
              <span className="w-7 shrink-0 text-right text-[9px] font-mono text-stone-500">
                {missing ? "—" : Math.round(value as number)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * 同行者がいるときの内訳。
   *
   * 合成した 1 つの点だけでは「誰にとって良いのか」「誰が引っかかって
   * いるのか」が消える。合流の判断はそこが要なので、人ごとの方位と
   * 判定、そして全員で動ける直近の日をそのまま出す。
   */
  const renderPartyBreakdown = (item: any) => {
    if (!hasParty || !item.party?.members?.length) return null;
    const members = item.party.members as any[];

    return (
      <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-stone-200 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-stone-500">
            全員の方位
          </span>
          {item.party.harmony !== null && (
            <span
              className="text-[9px] font-mono text-stone-400"
              title="移動する人どうしで評価がどれだけ揃っているか。低いと片方だけに良い場所。"
            >
              一致度 {Math.round(item.party.harmony)}
            </span>
          )}
        </div>

        {members.map((m) => (
          <div
            key={m.memberId}
            className="flex items-center justify-between text-[10px]"
          >
            <span className="text-stone-500 truncate max-w-[45%]">
              {m.name}
              {m.direction === null && (
                <span className="ml-1 text-stone-400">(移動なし)</span>
              )}
            </span>
            {m.direction !== null && (
              <span className="flex items-center gap-1.5 font-mono">
                <span className="text-stone-600">{m.direction}</span>
                <span
                  className={
                    m.isAvoid
                      ? "text-rose-500 font-bold"
                      : m.score >= 70
                        ? "text-emerald-600 font-bold"
                        : "text-stone-500"
                  }
                >
                  {Math.round(m.score)}
                </span>
              </span>
            )}
          </div>
        ))}

        {item.party.blockedBy?.length > 0 && (
          <div className="text-[10px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 mt-1">
            この日は {item.party.blockedBy.join("・")} が移転不可
          </div>
        )}

        {item.timing && (
          <div className="text-[10px] text-stone-500 mt-1">
            {item.timing.nextAllClearDate ? (
              <>
                全員で動ける直近日:{" "}
                <span className="font-bold text-emerald-600">
                  {item.timing.nextAllClearDate}
                </span>
                <span className="text-stone-400">
                  {" "}
                  （{item.timing.scannedDays}日中 {item.timing.allClearDays}日）
                </span>
              </>
            ) : item.timing.alwaysBlockedBy?.length > 0 ? (
              // 天中殺のように年単位で塞がっている場合、期間を延ばしても
              // 物件を変えても開かない。「0日」とだけ出すと、どれを
              // 動かせばよいのか分からないので理由まで書く。
              <span className="text-rose-600">
                走査した{item.timing.scannedDays}日はすべて不可（
                {item.timing.alwaysBlockedBy
                  .map(
                    (b: any) =>
                      `${b.name}: ${ASTRO_STATUS_LABELS[b.status] ?? b.status}`,
                  )
                  .join("、")}
                ）。移転先を変えても開かないため、時期そのものを見直す必要があります。
              </span>
            ) : (
              <span className="text-amber-600">
                今後{item.timing.scannedDays}日で全員が動ける日はありません
              </span>
            )}
          </div>
        )}
      </div>
    );
  };
  const renderStarRow = (starCount: number, hint: string) => {
    return (
      <div className="flex gap-0.5 text-amber-600 text-xs" title={hint}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={
              i < starCount
                ? "opacity-100 text-amber-600"
                : "opacity-20 text-stone-400"
            }
          >
            ★
          </span>
        ))}
      </div>
    );
  };

  // 吉凶要因バッジの描画
  const renderFactorBadges = (item: any) => {
    const targetDay = item.dateScores?.[3];
    if (!targetDay) return null;
    const details = targetDay.scoreDetails;

    const badges: BadgeItem[] = [];

    // 1. 大凶要因
    if (item.astrologyStatus === "NOISE_GOU")
      badges.push({
        label: "五黄殺",
        type: "individual",
        colorClass: "bg-red-500/25 text-red-600 border border-red-200",
        priority: 1,
      });
    if (item.astrologyStatus === "NOISE_ANKEN")
      badges.push({
        label: "暗剣殺",
        type: "individual",
        colorClass: "bg-red-500/25 text-red-600 border border-red-200",
        priority: 1,
      });
    if (item.astrologyStatus === "NOISE_HA")
      badges.push({
        label: "歳破",
        type: "individual",
        colorClass: "bg-red-500/25 text-red-600 border border-red-200",
        priority: 1,
      });
    if (item.astrologyStatus === "NOISE_HONMEI")
      badges.push({
        label: "本命殺",
        type: "individual",
        colorClass: "bg-red-500/25 text-red-600 border border-red-200",
        priority: 1,
      });
    if (item.astrologyStatus === "NOISE_TEKI")
      badges.push({
        label: "本命的殺",
        type: "individual",
        colorClass: "bg-red-500/25 text-red-600 border border-red-200",
        priority: 1,
      });

    // 2. 最大吉要因
    if (item.isTendo)
      badges.push({
        label: "天道方位",
        type: "individual",
        colorClass:
          "bg-gradient-to-br from-amber-400/25 to-yellow-500/25 text-amber-600 border border-amber-200 font-bold",
        priority: 2,
      });
    if (targetDay.luckyDays?.isTensho)
      badges.push({
        label: "天赦日",
        type: "calendar",
        colorClass:
          "border border-yellow-400/50 text-yellow-300 bg-yellow-400/5",
        priority: 2,
      });

    // 3. 通常の吉要因
    if (targetDay.rokuyo?.includes("大安"))
      badges.push({
        label: "大安",
        type: "calendar",
        colorClass: "border border-indigo-200 text-indigo-600 bg-indigo-400/5",
        priority: 3,
      });
    if (targetDay.luckyDays?.isIchiryumanbai)
      badges.push({
        label: "一粒万倍",
        type: "calendar",
        colorClass:
          "border border-emerald-200 text-emerald-600 bg-emerald-400/5",
        priority: 3,
      });
    if (item.astroFlags?.includes("JUPITER_LINE"))
      badges.push({
        label: "木星ライン",
        type: "individual",
        colorClass:
          "bg-emerald-500/15 text-emerald-600 border border-emerald-200",
        priority: 3,
      });
    if (item.astroFlags?.includes("VENUS_LINE"))
      badges.push({
        label: "金星ライン",
        type: "individual",
        colorClass: "bg-blue-500/15 text-blue-600 border border-blue-200",
        priority: 3,
      });
    if (item.astroFlags?.includes("SUN_LINE"))
      badges.push({
        label: "太陽ライン",
        type: "individual",
        colorClass: "bg-purple-500/15 text-purple-600 border border-purple-200",
        priority: 3,
      });

    // 4. 軽い凶や警告
    if (
      targetDay.status === "NOISE_VOID" ||
      (details && details.voidPenalty < 0) ||
      item.astroFlags?.includes("VOID_TIME_HAZARD")
    ) {
      const isBlocker = item.maxAstroFactor === "天中殺期間 (移転NG)";
      badges.push({
        label: isBlocker ? "天中殺 (移転NG)" : "天中殺",
        type: "individual",
        colorClass: isBlocker
          ? "bg-red-500/25 text-red-600 border border-red-200 font-bold"
          : "bg-orange-500/10 text-orange-600 border border-orange-200",
        priority: isBlocker ? 1 : 4,
      });
    }
    if (
      item.astroFlags?.includes("DOYOU_HAZARD") ||
      (details && details.doyouPenalty < 0)
    )
      badges.push({
        label: "土用期間",
        type: "calendar",
        colorClass: "border border-stone-300 text-stone-500 bg-stone-100/60",
        priority: 4,
      });
    if (item.astrologyStatus === "NOISE_GETSUMEI")
      badges.push({
        label: "月命殺",
        type: "individual",
        colorClass: "bg-stone-100 text-stone-500 border border-stone-200",
        priority: 4,
      });
    if (item.astrologyStatus === "NOISE_GETSUTEKI")
      badges.push({
        label: "月命的殺",
        type: "individual",
        colorClass: "bg-stone-100 text-stone-500 border border-stone-200",
        priority: 4,
      });
    if (item.astrologyStatus === "NOISE_NODE")
      badges.push({
        label: "月交点",
        type: "individual",
        colorClass: "bg-stone-100 text-stone-500 border border-stone-200",
        priority: 4,
      });
    if (item.astroFlags?.includes("DECLINATION_WARNING"))
      badges.push({
        label: "偏角ズレ",
        type: "individual",
        colorClass:
          "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
        priority: 4,
      });

    // 優先度順、かつ同じ優先度なら「カレンダー共通（暦）」を左、「個別」を右に配置
    badges.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.type !== b.type) return a.type === "calendar" ? -1 : 1;
      return 0;
    });

    const displayLimit = 5;
    const visibleBadges = badges.slice(0, displayLimit);
    const hiddenCount = badges.length - displayLimit;

    return (
      <div className="flex flex-wrap gap-1.5 items-center mt-2.5">
        {visibleBadges.map((badge, idx) => (
          <span
            key={idx}
            className={`px-2 py-0.5 rounded text-[9.5px] font-medium leading-none ${badge.colorClass}`}
          >
            {badge.label}
          </span>
        ))}
        {hiddenCount > 0 && (
          <div className="group relative">
            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-stone-100 text-stone-500 border border-stone-200 hover:bg-stone-200 hover:text-stone-700 cursor-help leading-none">
              +{hiddenCount}
            </span>
            {/* ポップオーバー */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-48 bg-white/80 border border-stone-200 rounded-lg p-2.5 shadow-xl text-[10px] text-stone-600 hidden group-hover:block z-50 backdrop-blur-sm">
              <div className="font-bold text-stone-500 border-b border-stone-200 pb-1 mb-1.5">
                すべての吉凶要因:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {badges.map((badge, idx) => (
                  <span
                    key={idx}
                    className={`px-1.5 py-0.5 rounded text-[8.5px] font-medium leading-none ${badge.colorClass}`}
                  >
                    {badge.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 全体ロード時のカード型スケルトン
  const renderCardSkeletons = () => {
    return Array.from({ length: 4 }).map((_, idx) => (
      <tr
        key={idx}
        className="border-b border-gray-100 dark:border-stone-200 animate-pulse"
      >
        <td className="px-6 py-4">
          <div className="w-16 h-4 bg-stone-100/80 rounded-md" />
        </td>
        <td className="px-6 py-4 space-y-2">
          <div className="w-48 h-4 bg-stone-100/80 rounded-md" />
          <div className="w-32 h-3 bg-stone-100/80 rounded-md" />
          <div className="w-40 h-8 bg-stone-100/80 rounded-md mt-2" />
        </td>
        <td className="px-6 py-4 space-y-1.5">
          <div className="w-20 h-4 bg-stone-100/80 rounded-md" />
          <div className="w-24 h-3 bg-stone-100/80 rounded-md" />
        </td>
        <td className="px-6 py-4 text-right">
          <div className="w-16 h-4 bg-stone-100/80 rounded-md ml-auto" />
        </td>
        <td className="px-6 py-4 text-right">
          <div className="w-12 h-4 bg-stone-100/80 rounded-md ml-auto" />
        </td>
        <td className="px-6 py-4 text-right">
          <div className="w-24 h-3 bg-stone-100/80 rounded-md ml-auto" />
        </td>
      </tr>
    ));
  };

  // Pagination & Filtering state
  const [currentPage, setCurrentPage] = useState(1);
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  /**
   * 方位で絞る。吉日カレンダーから「この日にこの方位へ」と渡ってくる導線で使う。
   * 方位が決まってから物件を見るとき、他の方位が混ざっていると選べない。
   */
  const [filterDirection, setFilterDirection] = useState("ALL");
  const [filterMaxRent, setFilterMaxRent] = useState<string>("");
  const [filterMinYield, setFilterMinYield] = useState<string>("");
  const [filterMaxAge, setFilterMaxAge] = useState<string>("5");
  const [filterMaxStation, setFilterMaxStation] = useState<string>("");
  const [filterMinSize, setFilterMinSize] = useState<string>("");
  const [filterMinTotal, setFilterMinTotal] = useState<string>("");
  // 間取り。スマート検索から入る。手で選ぶ UI は無い（チップで外せる）
  const [filterLayouts, setFilterLayouts] = useState<string[]>([]);
  // 凶（NOISE 系）を除外。「吉方位のみ」の解釈先
  const [filterLuckyOnly, setFilterLuckyOnly] = useState(false);
  // スマート検索の入力と、LLM 解釈の実行中表示
  const [smartQuery, setSmartQuery] = useState("");
  const [smartBusy, setSmartBusy] = useState(false);
  // 詳細パネルに出している物件。カード・表・TOP5 のクリックで入る
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const itemsPerPage = 50;

  // 評価軸の重み。
  //
  // 同じ候補集合でも、通勤で選ぶ人と開運で選ぶ人では見るべき順位が違う。
  // 重み付けは画面側で行うので、切り替えても再スキャン（DBアクセス）は起きない。
  const [weightPresetId, setWeightPresetId] =
    useState<string>(DEFAULT_PRESET_ID);
  const [customSliders, setCustomSliders] = useState<Record<AxisKey, number>>(
    () => weightsToSliders(getPreset(DEFAULT_PRESET_ID).weights),
  );
  const [showWeightPanel, setShowWeightPanel] = useState(false);
  // 予算（万円/月）。cost 軸の基準になる。空なら cost 軸は使わない。
  const [budgetManYen, setBudgetManYen] = useState<string>("");
  // 候補を DB から切り出すときの角度。重みだけ変えても母集合が変わらないため。
  const [candidateStrategy, setCandidateStrategy] = useState<string>(
    DEFAULT_CANDIDATE_STRATEGY,
  );
  // 避けるべき方位・期間の物件を最下位に沈めるか。
  // 既定は沈める。外すと「凶だが条件は最高」の物件も比較対象にできる。
  const [sinkAvoidStatus, setSinkAvoidStatus] = useState(true);

  /**
   * 天中殺（空亡）の効かせ方。
   *
   * 年天中殺は 2 年続くため、既定の厳格な扱いだとその間はどの方位・どの日も
   * 移転不可になり、物件を探す意味がなくなる。禁止則として扱うかどうかは
   * 流派によって違い、転勤などやむを得ない移動は影響を受けないとする
   * 考え方もあるので、選べるようにする。
   */
  const [tenchusatsuMode, setTenchusatsuMode] = useState<string>(
    DEFAULT_TENCHUSATSU_MODE,
  );
  const [involuntaryMove, setInvoluntaryMove] = useState(false);

  /**
   * 同行者。合流する親族のように、別の出発地から同じ移転先へ動く人。
   *
   * 出発地が違えば同じ物件でも方位が違うので、片方に吉でももう片方に凶、
   * ということが起きる。1 人分の判定だけではその衝突が見えない。
   * 座標や日付は入力途中の文字列で持ち、送信時に数値へ直す。
   */
  interface PartyMemberInput {
    id: string;
    name: string;
    birthDate: string;
    birthLat: string;
    birthLon: string;
    baseLat: string;
    baseLon: string;
    weight: number;
    stationary: boolean;
  }
  const [partyMembers, setPartyMembers] = useState<PartyMemberInput[]>([]);
  const [partyPolicy, setPartyPolicy] = useState<string>(DEFAULT_PARTY_POLICY);
  // 「いつなら全員で動けるか」を何日先まで見るか。
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [showPartyPanel, setShowPartyPanel] = useState(false);
  /** 他画面で保存済みのプロフィール。同行者の入力元にする。 */
  const [savedProfiles, setSavedProfiles] = useState<ProfilePreset[]>([]);

  useEffect(() => {
    try {
      const raw =
        localStorage.getItem("profile_presets_v1") ||
        localStorage.getItem("wealth_presets");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setSavedProfiles(parsed);
    } catch {
      // 壊れていれば手入力してもらう
    }
  }, []);

  /** API に渡す形。座標が数値にならない人は送らない（方位が決まらないため）。 */
  const partyParam = useMemo(() => {
    const payload = partyMembers
      .filter((m) => m.birthDate && (m.stationary || (m.baseLat && m.baseLon)))
      .map((m) => ({
        id: m.id,
        name: m.name,
        birthDate: m.birthDate,
        birthLat: m.birthLat === "" ? null : Number(m.birthLat),
        birthLon: m.birthLon === "" ? null : Number(m.birthLon),
        baseLat: m.baseLat === "" ? null : Number(m.baseLat),
        baseLon: m.baseLon === "" ? null : Number(m.baseLon),
        weight: m.weight,
        stationary: m.stationary,
      }));
    return payload.length > 0 ? JSON.stringify(payload) : "";
  }, [partyMembers]);

  const hasParty = partyParam !== "";

  const addPartyMember = (preset?: ProfilePreset) => {
    setPartyMembers((prev) => [
      ...prev,
      {
        id: preset?.id || `member-${Date.now()}`,
        name: preset?.name || `同行者${prev.length + 1}`,
        birthDate: preset?.birthDate || "",
        birthLat: preset?.birthLat != null ? String(preset.birthLat) : "",
        birthLon: preset?.birthLon != null ? String(preset.birthLon) : "",
        baseLat: preset?.baseLat != null ? String(preset.baseLat) : "",
        baseLon: preset?.baseLon != null ? String(preset.baseLon) : "",
        weight: 1,
        stationary: false,
      },
    ]);
  };

  const updatePartyMember = (id: string, patch: Partial<PartyMemberInput>) => {
    setPartyMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  };

  const activeWeights = useMemo(
    () =>
      weightPresetId === "custom"
        ? slidersToWeights(customSliders)
        : getPreset(weightPresetId).weights,
    [weightPresetId, customSliders],
  );

  /** テーブルに列として出す軸。重みの大きい順に 4 つまで。 */
  const tableAxisColumns = useMemo(
    () =>
      AXIS_ORDER.filter((key) => (activeWeights[key] ?? 0) > 0)
        .sort((a, b) => (activeWeights[b] ?? 0) - (activeWeights[a] ?? 0))
        .slice(0, 4),
    [activeWeights],
  );

  // Sorting state
  type SortColumn =
    | "arbitrage"
    | "yield"
    | "astrology"
    | "rent"
    | "distance"
    | AxisKey;
  interface SortConfig {
    key: SortColumn;
    direction: "desc" | "asc";
  }
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([
    { key: "arbitrage", direction: "desc" },
  ]);

  // 重み・予算・抽出戦略は端末に残す。毎回選び直すのは実用的でない。
  const AXIS_PREFS_KEY = "arb_axis_prefs_v1";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AXIS_PREFS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.weightPresetId === "string")
        setWeightPresetId(saved.weightPresetId);
      if (saved.customSliders && typeof saved.customSliders === "object") {
        const sliders = weightsToSliders(getPreset(DEFAULT_PRESET_ID).weights);
        for (const key of AXIS_ORDER) {
          const value = Number(saved.customSliders[key]);
          if (Number.isFinite(value))
            sliders[key] = Math.max(0, Math.min(100, value));
        }
        setCustomSliders(sliders);
      }
      if (typeof saved.budgetManYen === "string")
        setBudgetManYen(saved.budgetManYen);
      if (typeof saved.candidateStrategy === "string")
        setCandidateStrategy(saved.candidateStrategy);
      if (typeof saved.sinkAvoidStatus === "boolean")
        setSinkAvoidStatus(saved.sinkAvoidStatus);
      if (Array.isArray(saved.partyMembers))
        setPartyMembers(saved.partyMembers);
      if (typeof saved.partyPolicy === "string")
        setPartyPolicy(saved.partyPolicy);
      if (Number.isFinite(Number(saved.horizonDays)))
        setHorizonDays(Math.max(0, Math.min(90, Number(saved.horizonDays))));
      if (typeof saved.tenchusatsuMode === "string")
        setTenchusatsuMode(saved.tenchusatsuMode);
      if (typeof saved.involuntaryMove === "boolean")
        setInvoluntaryMove(saved.involuntaryMove);
    } catch {
      // 壊れた保存値は無視して既定で動かす。
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        AXIS_PREFS_KEY,
        JSON.stringify({
          weightPresetId,
          customSliders,
          budgetManYen,
          candidateStrategy,
          sinkAvoidStatus,
          partyMembers,
          partyPolicy,
          horizonDays,
          tenchusatsuMode,
          involuntaryMove,
        }),
      );
    } catch {
      // 保存できなくても動作には影響しない。
    }
  }, [
    weightPresetId,
    customSliders,
    budgetManYen,
    candidateStrategy,
    sinkAvoidStatus,
    partyMembers,
    partyPolicy,
    horizonDays,
    tenchusatsuMode,
    involuntaryMove,
  ]);

  // Load from localStorage on mount
  useEffect(() => {
    // 未設定は空のままにする。ここに座標を置くと、設定していないユーザーが
    // その地点を出発地として判定された結果を「自分の吉方位」だと思ってしまう。
    let bsLat = "";
    let bsLon = "";
    let bLat = "34.3952";
    let bLon = "132.4482";
    let bDate = "1988-11-25T04:26";
    let tDate = getTodayString();
    let rKm = filtersForSearchArea(DEFAULT_SEARCH_AREA).radiusKm;
    let pref = "all";
    let classical = false;
    let layer = "year";
    let trueNorth = false;

    // Load from unified tactical config
    const tacticalConfig = localStorage.getItem("tactical_config_v1");
    let filter = "composite";
    let intent = "MIGRATION";
    if (tacticalConfig) {
      try {
        const config = JSON.parse(tacticalConfig);
        if (config.birth_date) {
          bDate = config.birth_date;
        }
        if (config.birth_lat !== undefined) bLat = config.birth_lat.toString();
        if (config.birth_lon !== undefined) bLon = config.birth_lon.toString();
        // 出発地は「どの県を見るか」とは独立した設定。
        // 以前は prefecture が "all" のときに保存済みの出発地を捨てていた。
        // 既定が "all" なので常に捨てられ、プロフィールで設定していても
        // 「出発地を設定してください」から先に進めなかった。
        if (config.base_lat !== undefined && config.base_lat !== null)
          bsLat = config.base_lat.toString();
        if (config.base_lon !== undefined && config.base_lon !== null)
          bsLon = config.base_lon.toString();
        if (config.use_classical_board !== undefined)
          classical = config.use_classical_board;
        if (config.use_true_north !== undefined)
          trueNorth = config.use_true_north;
        if (config.layer_mode !== undefined) layer = config.layer_mode;
        if (config.target_date) tDate = config.target_date;
        if (config.direction_filter_mode !== undefined)
          filter = config.direction_filter_mode;
        if (config.action_intent !== undefined) intent = config.action_intent;
        // 旧設定の都道府県指定は維持する。all/all は旧既定値と利用者の
        // 明示選択を区別できないので、下の新しい保存キーが無ければ50kmにする。
        if (
          typeof config.prefecture === "string" &&
          config.prefecture !== "all"
        ) {
          pref = config.prefecture;
          rKm = "all";
        } else if (config.radius_km && config.radius_km !== "all") {
          rKm = String(config.radius_km);
        }
      } catch (e) {}
    } else {
      // Fallback to legacy isolated keys
      const storedLat = localStorage.getItem("arb_baseLat");
      const storedLon = localStorage.getItem("arb_baseLon");
      const storedBirth = localStorage.getItem("arb_birthDate");
      const storedTarget = localStorage.getItem("arb_targetDate");
      const storedRadius = localStorage.getItem("arb_radiusKm");
      const storedPrefecture = localStorage.getItem("arb_prefecture");
      const storedClassical = localStorage.getItem("arb_useClassical");
      const storedLayer = localStorage.getItem("arb_layerMode");
      const storedTrueNorth = localStorage.getItem("arb_useTrueNorth");

      if (storedPrefecture) pref = storedPrefecture;
      // 半径を選ぶ UI は無いので、保存値の "all" は旧既定値の残骸か、
      // 県を選んだときに連動で入った値のどちらか。県が無いのに "all" が
      // 残っている組み合わせは誰も選んでおらず、これを復元すると全国
      // 45 万行のスキャン（実測 18.4 秒）に戻るので、既定値に置き換える。
      if (storedRadius && !(storedRadius === "all" && pref === "all")) {
        rKm = storedRadius;
      }

      // 出発地は「どの県を見るか」とは独立した設定。以前は pref === "all" のとき
      // 保存済みの出発地を捨てていたため、全国表示にした瞬間に方位の基準が
      // 既定値へ戻り、判定が変わっていた。
      if (storedLat) bsLat = storedLat;
      if (storedLon) bsLon = storedLon;

      if (storedBirth) bDate = storedBirth;
      if (storedTarget) tDate = storedTarget;
      if (storedClassical) classical = storedClassical === "true";
      if (storedLayer) layer = storedLayer;
      if (storedTrueNorth) trueNorth = storedTrueNorth === "true";
    }

    // 新しい検索範囲の選択値があれば、都道府県と半径を必ずそこから一緒に
    // 復元する。旧形式の all/all には「利用者が全国を選んだ」という情報が
    // 無いため、キーが無い場合は従来どおり安全な50kmへ移行する。
    const storedSearchArea = localStorage.getItem(SEARCH_AREA_STORAGE_KEY);
    const validPrefectureNames = TARGET_PREFECTURES.map((p) => p.name);
    const restoredSearchArea = normalizeStoredSearchArea(
      storedSearchArea,
      pref,
      validPrefectureNames,
    );
    const storedFilters = filtersForSearchArea(restoredSearchArea);
    pref = storedFilters.prefecture;
    rKm = storedFilters.radiusKm;

    // URL に出発地が乗っていればそれを最優先する。
    // /houi/area/* から「この街を出発地にして探す」で来た人が、
    // 保存済みの設定に上書きされて別の場所の結果を見ることがないようにする。
    // useSearchParams だと Suspense 境界が要るので location から直接読む。
    try {
      const qs = new URLSearchParams(window.location.search);
      const qLat = parseFloat(qs.get("baseLat") || "");
      const qLon = parseFloat(qs.get("baseLon") || "");
      if (!isNaN(qLat) && !isNaN(qLon)) {
        bsLat = String(qLat);
        bsLon = String(qLon);
        localStorage.setItem("arb_baseLat", bsLat);
        localStorage.setItem("arb_baseLon", bsLon);
      }
      const qPref = qs.get("prefecture");
      const qRadius = qs.get("radiusKm");
      const urlSearchArea = searchAreaFromUrl(
        qPref,
        qRadius,
        validPrefectureNames,
      );
      if (urlSearchArea) {
        const urlFilters = filtersForSearchArea(urlSearchArea);
        pref = urlFilters.prefecture;
        rKm = urlFilters.radiusKm;
      }

      // 吉日カレンダー（/calendar）からの受け渡し。
      // 「この日に、この方位で」を選んで来ているので、対象日・方位・
      // 天中殺の扱いをそのまま引き継ぐ。ここで引き継がないと、
      // 遷移した先で別の前提の一覧を見ることになる。
      const qDate = qs.get("targetDate");
      if (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)) {
        tDate = qDate;
        // 保存側にも書く。MetaphysicalConfigBar がマウント時に
        // 保存済みの設定で metaphysical-config-updated を投げるため、
        // ここで state に入れるだけだと直後に上書きされて元の日付に戻る。
        // baseLat/baseLon を同じ理由で保存しているのと同じ扱いにする。
        localStorage.setItem("arb_targetDate", qDate);
        try {
          const raw = localStorage.getItem("tactical_config_v1");
          const cfg = raw ? JSON.parse(raw) : {};
          cfg.target_date = qDate;
          localStorage.setItem("tactical_config_v1", JSON.stringify(cfg));
        } catch {
          /* 保存済み設定が壊れていても URL の日付は使う */
        }
      }
      const qDir = qs.get("direction");
      if (qDir && ALL_DIRECTIONS.includes(qDir as any)) {
        setFilterDirection(qDir);
      }
      const qTenchu = qs.get("tenchusatsuMode");
      if (qTenchu && TENCHUSATSU_MODES.some((m) => m.id === qTenchu)) {
        setTenchusatsuMode(qTenchu);
      }
      if (qs.get("involuntaryMove") === "true") setInvoluntaryMove(true);
    } catch {
      /* URL の解釈に失敗しても保存済みの設定で動かす */
    }

    setBaseLat(bsLat);
    setLocalLat(bsLat);
    setBaseLon(bsLon);
    setLocalLon(bsLon);
    // 出発地が未設定でも地図は開けるように、表示中心だけは日本全体にしておく
    if (bsLat !== "" && bsLon !== "") {
      const lat0 = parseFloat(bsLat);
      const lon0 = parseFloat(bsLon);
      setMapCenter([lat0, lon0]);
      // 地図は moveend / zoomend でしか表示範囲を報告しないので、最初の検索は
      // 範囲が未確定のまま走る。既定が上限なしになったぶん、そこだけ全国
      // 45万行のスキャン（実測18.4秒）に落ちる。出発地の周りの矩形を先に
      // 置いて、初回から見えている範囲だけを検索する。
      setMapBounds(initialViewBounds(lat0, lon0));
    }
    setBirthLat(bLat);
    setLocalBirthLat(bLat);
    setBirthLon(bLon);
    setLocalBirthLon(bLon);
    setBirthDate(bDate);
    setLocalBirthDate(normalizeDateTimeLocal(bDate));
    setTargetDate(tDate);
    setLocalTargetDate(tDate);
    setRadiusKm(rKm);
    setPrefecture(pref);
    setUseClassical(classical);
    setLayerMode(layer);
    setUseTrueNorth(trueNorth);
    setDirectionFilterMode(filter);
    setActionIntent(intent);

    setInitialLoaded(true);

    // localStorage が空の端末（別のブラウザ、履歴を消した後など）では、
    // プロフィールに出発地を保存していても「設定してください」から進めない。
    // ここまでで出発地が決まらなかったときだけ、保存済みの設定を取りに行く。
    if (bsLat === "" || bsLon === "") {
      (async () => {
        try {
          const { settings: cfg } = await loadSettings();
          const lat = parseFloat(cfg?.base_lat);
          const lon = parseFloat(cfg?.base_lon);
          if (isNaN(lat) || isNaN(lon)) return;
          setBaseLat(String(lat));
          setLocalLat(String(lat));
          setBaseLon(String(lon));
          setLocalLon(String(lon));
          setMapCenter([lat, lon]);
          localStorage.setItem("arb_baseLat", String(lat));
          localStorage.setItem("arb_baseLon", String(lon));
        } catch {
          /* 取得できなくても入力欄から設定できる */
        }
      })();
    }

    const handleGlobalConfigUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      if (customEvent.detail) {
        const detail = customEvent.detail;

        const newTargetDate = detail.targetDate || detail.target_date;
        const newUseClassical =
          detail.useClassicalBoard !== undefined
            ? detail.useClassicalBoard
            : detail.use_classical_board;
        const newFilterMode =
          detail.directionFilterMode || detail.direction_filter_mode;
        const newIntent = detail.actionIntent || detail.action_intent;
        const newBirthDate = detail.birthDate || detail.birth_date;
        const newBirthLat =
          detail.birthLat !== undefined
            ? detail.birthLat.toString()
            : detail.birth_lat !== undefined
              ? detail.birth_lat.toString()
              : undefined;
        const newBirthLon =
          detail.birthLon !== undefined
            ? detail.birthLon.toString()
            : detail.birth_lon !== undefined
              ? detail.birth_lon.toString()
              : undefined;
        const newBaseLat =
          detail.baseLat !== undefined
            ? detail.baseLat.toString()
            : detail.base_lat !== undefined
              ? detail.base_lat.toString()
              : undefined;
        const newBaseLon =
          detail.baseLon !== undefined
            ? detail.baseLon.toString()
            : detail.base_lon !== undefined
              ? detail.base_lon.toString()
              : undefined;

        if (newTargetDate) {
          setTargetDate(newTargetDate);
          setLocalTargetDate(newTargetDate);
        }
        if (newUseClassical !== undefined) {
          setUseClassical(newUseClassical);
        }
        if (newFilterMode) {
          setDirectionFilterMode(newFilterMode);
        }
        if (newIntent) {
          setActionIntent(newIntent);
        }
        if (newBirthDate) {
          setBirthDate(newBirthDate);
          setLocalBirthDate(normalizeDateTimeLocal(newBirthDate));
        }
        if (newBirthLat) {
          setBirthLat(newBirthLat);
          setLocalBirthLat(newBirthLat);
        }
        if (newBirthLon) {
          setBirthLon(newBirthLon);
          setLocalBirthLon(newBirthLon);
        }
        // 片方だけ入力した途中の状態では、この通知に "NaN" という文字列が乗る。
        // 文字列は truthy なのでそのまま state に書き戻され、出発地が
        // 永久に未設定扱いのままになっていた。数値として妥当なときだけ反映する。
        const lat = parseFloat(newBaseLat ?? "");
        const lon = parseFloat(newBaseLon ?? "");
        if (!isNaN(lat) && !isNaN(lon)) {
          setBaseLat(String(lat));
          setLocalLat(String(lat));
          setBaseLon(String(lon));
          setLocalLon(String(lon));
          setMapCenter([lat, lon]);
        }
      }
    };

    window.addEventListener(
      "metaphysical-config-updated",
      handleGlobalConfigUpdate,
    );
    return () => {
      window.removeEventListener(
        "metaphysical-config-updated",
        handleGlobalConfigUpdate,
      );
    };
  }, []);

  // 30days / 12months の吉凶を、その物件の方位で実際に計算して取り直す。
  // 一覧APIが返す dateScores は対象日±3日の7日ぶんしかないため、
  // 以前はそれを使い回した値が長期表示に出ていた。
  const fetchTimeline = useCallback(
    async (lat: number | null, lon: number | null, range: string) => {
      if (lat == null || lon == null) return [];
      const params = new URLSearchParams();
      params.append("range", range);
      params.append("propLat", String(lat));
      params.append("propLon", String(lon));
      params.append("baseLat", baseLat);
      params.append("baseLon", baseLon);
      params.append("birthLat", birthLat);
      params.append("birthLon", birthLon);
      if (birthDate) params.append("birthDate", birthDate);
      if (targetDate) params.append("targetDate", targetDate);
      params.append("useClassical", useClassical.toString());
      params.append("layerMode", layerMode);
      params.append("useTrueNorth", useTrueNorth.toString());
      params.append("lunarPhaseModifier", lunarPhaseModifier.toString());
      params.append("directionFilterMode", directionFilterMode);
      params.append("actionIntent", actionIntent);
      // 一覧と同じ同行者構成で見ないと、カレンダーだけ 1 人分の判定になり、
      // 一覧では避けるべきとされた日が「動ける日」として出てしまう。
      if (partyParam) params.append("party", partyParam);
      params.append("partyPolicy", partyPolicy);
      params.append("tenchusatsuMode", tenchusatsuMode);
      params.append("involuntaryMove", String(involuntaryMove));

      const res = await fetch(
        `/api/rentals/arbitrage/timeline?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`timeline ${res.status}`);
      const json = await res.json();
      return json.dateScores || [];
    },
    [
      baseLat,
      baseLon,
      birthLat,
      birthLon,
      birthDate,
      targetDate,
      useClassical,
      layerMode,
      useTrueNorth,
      lunarPhaseModifier,
      directionFilterMode,
      actionIntent,
      partyParam,
      partyPolicy,
      tenchusatsuMode,
      involuntaryMove,
    ],
  );

  const fetchData = async (isDateChange = false) => {
    if (!initialLoaded) return;
    // 出発地が無いまま走らせると、方位が決まらないので順位が㎡単価だけになる。
    // 黙って結果を出すより、設定を促して止めるほうが正しい。
    if (!hasBaseLocation) {
      setLoading(false);
      setIsTransitioningDate(false);
      return;
    }
    // 俯瞰（県も半径も無しでズーム10未満）では検索しない。
    //
    // この組み合わせだけが全国 45 万行の名寄せ（実測 18.4 秒）に入る。
    // 俯瞰の地図は県別の色分けと掲載数ラベルを静的データから描くので、
    // 物件 500 件を取っても使い道が無い。物件はズームインしたときに、
    // そのとき見えている範囲だけを検索して出す。
    // 県が選ばれていれば母数が県に収まるので、ズームに関係なく検索する。
    if (
      prefecture === "all" &&
      radiusKm === "all" &&
      mapBounds !== null &&
      mapBounds.zoom < 10
    ) {
      setLoading(false);
      setIsTransitioningDate(false);
      return;
    }
    if (isDateChange) {
      setIsTransitioningDate(true);
    } else {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams();
      params.append("limit", dataLimit.toString());
      params.append("baseLat", baseLat);
      params.append("baseLon", baseLon);
      params.append("birthLat", birthLat);
      params.append("birthLon", birthLon);
      if (birthDate) params.append("birthDate", birthDate);
      if (targetDate) params.append("targetDate", targetDate);

      // 地図境界は選択中の検索範囲へ追加する絞り込みとして送る。
      // 近隣50kmを選んでいるとき、ズーム操作で半径を解除しない。
      const geographyParams = geographyParamsForSearch(
        { prefecture, radiusKm },
        mapBounds,
      );
      Object.entries(geographyParams).forEach(([key, value]) => {
        params.append(key, value);
      });
      params.append("useClassical", useClassical.toString());
      params.append("layerMode", layerMode);
      params.append("useTrueNorth", useTrueNorth.toString());
      params.append("lunarPhaseModifier", lunarPhaseModifier.toString());
      params.append("directionFilterMode", directionFilterMode);
      params.append("actionIntent", actionIntent);
      if (filterMaxAge) {
        params.append("maxBuildingAge", filterMaxAge);
      }
      // 予算はここでは渡さない。cost 軸は総家賃と予算だけで決まるので画面側で
      // 計算でき、入力するたびに DB を叩き直す必要がない。
      // 候補の切り出し方。重みを変えても母集合が同じでは角度が変わらない。
      params.append("candidateStrategy", candidateStrategy);
      // 同行者。方位は出発地ごとに違うので、人ぶんまとめてサーバへ渡す。
      if (partyParam) params.append("party", partyParam);
      params.append("partyPolicy", partyPolicy);
      params.append("horizonDays", String(horizonDays));
      params.append("tenchusatsuMode", tenchusatsuMode);
      params.append("involuntaryMove", String(involuntaryMove));

      setSearchError(null);
      const res = await fetch(`/api/rentals/arbitrage?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.properties || []);
        setMetadata(json.metadata || null);
      } else {
        setData([]);
        setMetadata(null);
        setSearchError(
          "物件を取得できませんでした。条件を確認して、もう一度スキャンしてください。",
        );
      }
    } catch (err) {
      console.error(err);
      setData([]);
      setMetadata(null);
      setSearchError(
        "通信エラーで物件を取得できませんでした。接続を確認して、もう一度スキャンしてください。",
      );
    } finally {
      setLoading(false);
      setIsTransitioningDate(false);
    }
  };

  const handleDateChange = (newDateStr: string) => {
    setTargetDate(newDateStr);
    setLocalDateChange(newDateStr);
  };

  const setLocalDateChange = (newDateStr: string) => {
    setTargetDate(newDateStr);
    setLocalTargetDate(newDateStr);
    localStorage.setItem("arb_targetDate", newDateStr);
    saveUnifiedConfig({ target_date: newDateStr });

    // Dispatch global event for instant sync
    const event = new CustomEvent("metaphysical-config-updated", {
      detail: {
        targetDate: newDateStr,
        useClassicalBoard: useClassical,
        directionFilterMode: directionFilterMode,
        actionIntent: actionIntent,
      },
    });
    window.dispatchEvent(event);
  };

  // Re-fetch data whenever params change
  useEffect(() => {
    if (!initialLoaded) return;

    const prev = prevParamsRef.current;
    const isOtherChanged =
      prev.baseLat !== baseLat ||
      prev.baseLon !== baseLon ||
      prev.birthLat !== birthLat ||
      prev.birthLon !== birthLon ||
      prev.birthDate !== birthDate ||
      prev.radiusKm !== radiusKm ||
      prev.prefecture !== prefecture ||
      prev.useClassical !== useClassical ||
      prev.layerMode !== layerMode ||
      prev.useTrueNorth !== useTrueNorth ||
      prev.lunarPhaseModifier !== lunarPhaseModifier ||
      prev.directionFilterMode !== directionFilterMode ||
      prev.actionIntent !== actionIntent ||
      prev.candidateStrategy !== candidateStrategy ||
      prev.partyParam !== partyParam ||
      prev.partyPolicy !== partyPolicy ||
      prev.horizonDays !== horizonDays ||
      prev.tenchusatsuMode !== tenchusatsuMode ||
      prev.involuntaryMove !== involuntaryMove ||
      JSON.stringify(prev.mapBounds) !== JSON.stringify(mapBounds);

    prevParamsRef.current = {
      baseLat,
      baseLon,
      birthLat,
      birthLon,
      birthDate,
      radiusKm,
      prefecture,
      useClassical,
      layerMode,
      useTrueNorth,
      lunarPhaseModifier,
      directionFilterMode,
      actionIntent,
      candidateStrategy,
      partyParam,
      partyPolicy,
      horizonDays,
      tenchusatsuMode,
      involuntaryMove,
      mapBounds,
    };

    fetchData(!isOtherChanged);
  }, [
    baseLat,
    baseLon,
    birthLat,
    birthLon,
    birthDate,
    targetDate,
    radiusKm,
    prefecture,
    useClassical,
    layerMode,
    useTrueNorth,
    lunarPhaseModifier,
    directionFilterMode,
    actionIntent,
    candidateStrategy,
    partyParam,
    partyPolicy,
    horizonDays,
    tenchusatsuMode,
    involuntaryMove,
    mapBounds,
    initialLoaded,
  ]);

  const saveUnifiedConfig = async (updatedFields: any) => {
    try {
      const localData = localStorage.getItem("tactical_config_v1");
      let currentLocal: any = {};
      if (localData) {
        try {
          currentLocal = JSON.parse(localData);
        } catch (e) {}
      }

      const mergedConfig = {
        ...currentLocal,
        ...updatedFields,
      };

      localStorage.setItem("tactical_config_v1", JSON.stringify(mergedConfig));

      await fetch("/api/user-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields),
      });

      // Dispatch global config update event for instant sync
      const event = new CustomEvent("metaphysical-config-updated", {
        detail: {
          targetDate: mergedConfig.target_date || targetDate,
          useClassicalBoard:
            mergedConfig.use_classical_board !== undefined
              ? mergedConfig.use_classical_board
              : useClassical,
          directionFilterMode:
            mergedConfig.direction_filter_mode || directionFilterMode,
          actionIntent: mergedConfig.action_intent || actionIntent,
          birthDate: mergedConfig.birth_date || birthDate,
          birthLat:
            mergedConfig.birth_lat !== undefined
              ? mergedConfig.birth_lat
              : parseFloat(birthLat),
          birthLon:
            mergedConfig.birth_lon !== undefined
              ? mergedConfig.birth_lon
              : parseFloat(birthLon),
          baseLat:
            mergedConfig.base_lat !== undefined
              ? mergedConfig.base_lat
              : parseFloat(baseLat),
          baseLon:
            mergedConfig.base_lon !== undefined
              ? mergedConfig.base_lon
              : parseFloat(baseLon),
        },
      });
      window.dispatchEvent(event);
    } catch (e) {
      console.error("Failed to sync config in arbitrage page:", e);
    }
  };

  // Handle manual submit of location/birth date
  const handleSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBaseLat(localLat);
    setBaseLon(localLon);
    setBirthDate(localBirthDate);
    const submitLat = parseFloat(localLat);
    const submitLon = parseFloat(localLon);
    if (!isNaN(submitLat) && !isNaN(submitLon))
      setMapCenter([submitLat, submitLon]);

    localStorage.setItem("arb_baseLat", localLat);
    localStorage.setItem("arb_baseLon", localLon);
    localStorage.setItem("arb_birthDate", localBirthDate);

    saveUnifiedConfig({
      base_lat: parseFloat(localLat),
      base_lon: parseFloat(localLon),
      birth_date: localBirthDate,
    });
  };

  /**
   * 全国を俯瞰している状態か。
   *
   * 「上限なし」は既定でもあるので、県も半径も all というだけでは足りない。
   * 利用者が検索範囲で「全国」を選んだときだけ表示中心を OVERVIEW_CENTER へ
   * 動かしているので、そこを見て区別する。既定のまま出発地を中心にしている
   * 場合は俯瞰ではなく、物件へズームしたままでよい。
   */
  const isNationwideOverview =
    prefecture === "all" &&
    radiusKm === "all" &&
    mapCenter[0] === OVERVIEW_CENTER[0] &&
    mapCenter[1] === OVERVIEW_CENTER[1];

  /** スマート検索の解釈結果を、既存のフィルタ state へ流し込む */
  const applySmartFilters = (f: SmartFilters) => {
    if (f.maxRentMan !== undefined) setFilterMaxRent(String(f.maxRentMan));
    if (f.maxBuildingAge !== undefined)
      setFilterMaxAge(String(f.maxBuildingAge));
    if (f.maxStationMin !== undefined)
      setFilterMaxStation(String(f.maxStationMin));
    if (f.minSizeSqm !== undefined) setFilterMinSize(String(f.minSizeSqm));
    if (f.direction !== undefined) setFilterDirection(f.direction);
    if (f.status !== undefined) setFilterStatus(f.status);
    if (f.luckyOnly) setFilterLuckyOnly(true);
    if (f.layouts.length > 0) setFilterLayouts(f.layouts);
    setFilterName(f.keywords.join(" "));
    setCurrentPage(1);
  };

  /**
   * スマート検索の実行。
   *
   * まず決定的パーサ（正規表現）で解釈する。定型表現はこれで即時・無料で
   * 決まる。構造が 1 つも取れない純粋な自然文（「静かで広めの部屋」など）
   * のときだけ /api/rentals/parse-query の LLM に投げ、それも使えない
   * 環境ではキーワード検索として扱う。検索自体はどの経路でも成立する。
   */
  const handleSmartSearch = async () => {
    const q = smartQuery.trim();
    if (!q) return;
    const local = parseSmartQuery(q);
    if (hasStructuredFilters(local) || q.length < 8) {
      applySmartFilters(local);
      return;
    }
    setSmartBusy(true);
    try {
      const res = await fetch("/api/rentals/parse-query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.available && data?.filters) {
          applySmartFilters(data.filters as SmartFilters);
          return;
        }
      }
    } catch {
      /* 解釈できないだけ。検索は下のフォールバックで続ける */
    } finally {
      setSmartBusy(false);
    }
    applySmartFilters(local);
  };

  // 検索範囲の表示値とAPI条件は、変更経路にかかわらず一緒に保存する。
  const applySearchAreaState = (newSearchArea: string) => {
    const nextFilters = filtersForSearchArea(newSearchArea);
    const normalizedSearchArea = searchAreaForFilters(
      nextFilters.prefecture,
      nextFilters.radiusKm,
    );
    setPrefecture(nextFilters.prefecture);
    setRadiusKm(nextFilters.radiusKm);
    localStorage.setItem(SEARCH_AREA_STORAGE_KEY, normalizedSearchArea);
    localStorage.setItem("arb_prefecture", nextFilters.prefecture);
    localStorage.setItem("arb_radiusKm", nextFilters.radiusKm);
    setCurrentPage(1);
    return nextFilters;
  };

  const handleSearchAreaChange = (newSearchArea: string) => {
    const nextFilters = applySearchAreaState(newSearchArea);

    let nextCenter: [number, number] = mapCenter;
    const target = TARGET_PREFECTURES.find(
      (p) => p.name === nextFilters.prefecture,
    );
    if (target) {
      nextCenter = [target.lat, target.lon];
    } else if (newSearchArea === NATIONWIDE_SEARCH_AREA) {
      nextCenter = OVERVIEW_CENTER;
    } else {
      const lat = parseFloat(baseLat);
      const lon = parseFloat(baseLon);
      if (!isNaN(lat) && !isNaN(lon)) nextCenter = [lat, lon];
    }

    setMapCenter(nextCenter);
    saveUnifiedConfig({
      prefecture: nextFilters.prefecture,
      radius_km: nextFilters.radiusKm,
    });
  };

  const applyPreset = (
    presetName: string,
    lat: string,
    lon: string,
    pref: string,
  ) => {
    const nextFilters = applySearchAreaState(pref);
    setLocalLat(lat);
    setLocalLon(lon);
    setBaseLat(lat);
    setBaseLon(lon);
    localStorage.setItem("arb_baseLat", lat);
    localStorage.setItem("arb_baseLon", lon);
    saveUnifiedConfig({
      base_lat: parseFloat(lat),
      base_lon: parseFloat(lon),
      prefecture: nextFilters.prefecture,
      radius_km: nextFilters.radiusKm,
    });
  };

  // Sync toggles instantly
  const handleClassicalToggle = (val: boolean) => {
    setUseClassical(val);
    localStorage.setItem("arb_useClassical", val.toString());
    setCurrentPage(1);
    saveUnifiedConfig({ use_classical_board: val });

    // Dispatch global event for instant sync
    const event = new CustomEvent("metaphysical-config-updated", {
      detail: {
        targetDate: targetDate,
        useClassicalBoard: val,
        directionFilterMode: directionFilterMode,
        actionIntent: actionIntent,
      },
    });
    window.dispatchEvent(event);
  };

  const handleTrueNorthToggle = (val: boolean) => {
    setUseTrueNorth(val);
    localStorage.setItem("arb_useTrueNorth", val.toString());
    setCurrentPage(1);
    saveUnifiedConfig({ use_true_north: val });
  };

  const handleLayerModeChange = (val: string) => {
    setLayerMode(val);
    localStorage.setItem("arb_layerMode", val);
    setCurrentPage(1);
    saveUnifiedConfig({ layer_mode: val });
  };

  // Geolocation trigger
  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latStr = position.coords.latitude.toFixed(5);
          const lonStr = position.coords.longitude.toFixed(5);
          setLocalLat(latStr);
          setLocalLon(lonStr);
          setBaseLat(latStr);
          setBaseLon(lonStr);
          localStorage.setItem("arb_baseLat", latStr);
          localStorage.setItem("arb_baseLon", lonStr);
        },
        (error) => {
          alert("位置情報の取得に失敗しました: " + error.message);
        },
      );
    } else {
      alert("お使いのブラウザは位置情報をサポートしていません。");
    }
  };

  // Filters logic
  const handleFilterNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterName(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterStatusChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1);
  };

  const budgetYen = useMemo(() => {
    const value = Number(budgetManYen) * 10000;
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [budgetManYen]);

  /**
   * 重みを当てて総合スコアを出し直す。
   *
   * サーバは既定の重みで付けた点を返すが、重みを変えるたびに DB を叩き直すのは
   * 無駄なうえ体感も悪い。軸ごとの点はサーバが返しているので、合成だけ
   * ここでやる。予算（cost 軸）も総家賃だけで決まるのでここで計算する。
   */
  const scoredData = useMemo(() => {
    return data.map((d) => {
      const axes: AxisScores = {
        ...(d.axes ?? {}),
        cost: scoreCost(d.totalRent, budgetYen),
      };
      const composed = composeScore(axes, activeWeights);
      return {
        ...d,
        axes,
        totalScore: composed.score,
        axisCoverage: composed.coverage,
        axisContributions: composed.contributions,
        axisMissing: composed.missing,
      };
    });
  }, [data, activeWeights, budgetYen]);

  const safeData = scoredData.filter((d) => d.astrologyScore >= 0);

  const filteredData = safeData.filter((d) => {
    if (
      filterStatus !== "ALL" &&
      (!d.astrologyStatus || !d.astrologyStatus.includes(filterStatus))
    )
      return false;

    if (filterMaxRent) {
      const maxRent = Number(filterMaxRent) * 10000;
      if (d.totalRent > maxRent) return false;
    }

    if (filterMinYield) {
      const minYield = Number(filterMinYield);
      if (d.yieldScore < minYield) return false;
    }

    if (filterMaxAge) {
      const maxAge = Number(filterMaxAge);
      if (
        d.building_age === null ||
        d.building_age === undefined ||
        d.building_age > maxAge
      )
        return false;
    }

    if (filterDirection !== "ALL" && d.direction !== filterDirection)
      return false;

    if (filterMaxStation) {
      const maxStation = Number(filterMaxStation);
      // 徒歩分数が未取得の物件は「条件を満たす保証が無い」ので外す。
      if (
        d.minutes_to_station === null ||
        d.minutes_to_station === undefined ||
        d.minutes_to_station > maxStation
      )
        return false;
    }

    if (filterMinSize) {
      const minSize = Number(filterMinSize);
      if (!d.size_sqm || Number(d.size_sqm) < minSize) return false;
    }

    if (filterMinTotal) {
      if (d.totalScore < Number(filterMinTotal)) return false;
    }

    if (filterLayouts.length > 0) {
      const layout = (d.layout || "").toUpperCase();
      if (!filterLayouts.some((l) => layout.includes(l))) return false;
    }

    // 凶の除外。ステータス未算出は「凶と断定できない」ので残す。
    if (
      filterLuckyOnly &&
      d.astrologyStatus &&
      d.astrologyStatus.includes("NOISE")
    )
      return false;

    if (filterName) {
      // 空白区切りは AND。スマート検索が複数の地名を残せるようにする。
      const terms = filterName.toLowerCase().split(/\s+/).filter(Boolean);
      const addr = (d.address || "").toLowerCase();
      const name = (d.property_name || "").toLowerCase();
      for (const term of terms) {
        if (!addr.includes(term) && !name.includes(term)) return false;
      }
    }
    return true;
  });

  const sortedTableData = [...filteredData].sort((a, b) => {
    // 避けるべき方位・期間のものは、どれだけ条件が良くても上には出さない。
    // 総合スコアは重み次第で方位の比重が下がるため、順位のほうで担保する。
    if (sinkAvoidStatus) {
      const aAvoid = isAvoidAstrologyStatus(a.astrologyStatus) ? 1 : 0;
      const bAvoid = isAvoidAstrologyStatus(b.astrologyStatus) ? 1 : 0;
      if (aAvoid !== bAvoid) return aAvoid - bAvoid;
    }

    for (const config of sortConfigs) {
      let result = 0;
      const key = config.key;
      if (key === "arbitrage") result = b.totalScore - a.totalScore;
      else if (key === "yield") result = b.yieldScore - a.yieldScore;
      else if (key === "astrology")
        result = b.astrologyScore - a.astrologyScore;
      else if (key === "rent") result = b.totalRent - a.totalRent;
      else if (key === "distance")
        result = (a.distanceKm || 0) - (b.distanceKm || 0);
      else {
        // 軸そのものでの並べ替え。未算出（null）は常に後ろに置く。
        const av = a.axes?.[key as AxisKey];
        const bv = b.axes?.[key as AxisKey];
        const aMissing = av === null || av === undefined;
        const bMissing = bv === null || bv === undefined;
        if (aMissing && bMissing) result = 0;
        else if (aMissing) return 1;
        else if (bMissing) return -1;
        else result = (bv as number) - (av as number);
      }

      if (result !== 0) {
        return config.direction === "desc" ? result : -result;
      }
    }
    return 0;
  });

  /**
   * 「アービトラージ物件 TOP 5」の中身。
   *
   * 以前は filteredData の先頭 5 件を出していた。filteredData は絞り込んだだけで
   * 並べ替えていないので、実際に出ていたのは API が返した順――SQL が㎡単価の
   * 安い順に切り出した候補の先頭――で、総合スコアとは無関係だった。
   * 「最強」と名乗る以上、総合スコアで選ぶ。
   *
   * 表の並べ替えには追従させない。家賃順に並べ替えたときにここまで家賃順に
   * なると、パネルの見出しと中身が食い違う。
   */
  const topArbitrage = [...filteredData]
    .sort((a, b) => {
      // 表と同じく、避けるべき方位・期間のものは上に出さない。
      if (sinkAvoidStatus) {
        const aAvoid = isAvoidAstrologyStatus(a.astrologyStatus) ? 1 : 0;
        const bAvoid = isAvoidAstrologyStatus(b.astrologyStatus) ? 1 : 0;
        if (aAvoid !== bAvoid) return aAvoid - bAvoid;
      }
      return b.totalScore - a.totalScore;
    })
    .slice(0, 5);

  // 詳細パネルに出す物件。絞り込みで消えても、選択中は出し続ける
  // （フィルタを触った瞬間に読んでいた詳細が消えるのは不親切）。
  const selectedProperty = useMemo(
    () => (selectedId ? safeData.find((d) => d.id === selectedId) : undefined),
    [selectedId, safeData],
  );

  const propertiesInBounds = useMemo(() => {
    if (!mapBounds) return sortedTableData;
    return sortedTableData.filter((d) => {
      if (d.lat === null || d.lon === null) return false;
      return (
        d.lat >= mapBounds.minLat &&
        d.lat <= mapBounds.maxLat &&
        d.lon >= mapBounds.minLon &&
        d.lon <= mapBounds.maxLon
      );
    });
  }, [sortedTableData, mapBounds]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterName !== "") count++;
    if (filterStatus !== "ALL") count++;
    if (filterMaxRent !== "") count++;
    if (filterMinYield !== "") count++;
    if (filterMaxAge !== "") count++;
    if (filterDirection !== "ALL") count++;
    if (filterMaxStation !== "") count++;
    if (filterMinSize !== "") count++;
    if (filterMinTotal !== "") count++;
    if (filterLayouts.length > 0) count++;
    if (filterLuckyOnly) count++;
    return count;
  }, [
    filterLayouts,
    filterLuckyOnly,
    filterName,
    filterStatus,
    filterMaxRent,
    filterMinYield,
    filterMaxAge,
    filterDirection,
    filterMaxStation,
    filterMinSize,
    filterMinTotal,
  ]);

  const totalPages = Math.ceil(sortedTableData.length / itemsPerPage);
  const currentTableData = sortedTableData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  /**
   * 見出しクリックでの並べ替え。Shift 併用で第 2 キー以降を足す。
   *
   * 以前はここで並び順を組み立てずに元の配列をそのまま返していたため、
   * どの見出しを押しても順序が変わらなかった。軸ごとの列を足す以上、
   * 「この軸で並べ直す」が効かないと軸を増やす意味が無い。
   */
  const handleSortChange = (newSort: SortColumn, e: React.MouseEvent) => {
    setSortConfigs((prev) => {
      const isMultiSort = e.shiftKey;
      const existing = prev.find((config) => config.key === newSort);

      if (!isMultiSort) {
        // 同じ列を押し直したときだけ昇順・降順を入れ替える。
        const direction =
          existing && existing.direction === "desc" ? "asc" : "desc";
        return [{ key: newSort, direction }];
      }

      if (existing) {
        return prev.map((config) =>
          config.key === newSort
            ? {
                ...config,
                direction: config.direction === "desc" ? "asc" : "desc",
              }
            : config,
        );
      }
      return [...prev, { key: newSort, direction: "desc" }];
    });
    setCurrentPage(1);
  };

  const renderSortIndicator = (key: SortColumn) => {
    const configIndex = sortConfigs.findIndex((c) => c.key === key);
    if (configIndex === -1)
      return (
        <span className="inline-block w-4 text-transparent group-hover:text-stone-500">
          ↑
        </span>
      );
    const config = sortConfigs[configIndex];
    return (
      <span className="inline-flex items-center text-indigo-500">
        <span className="w-3">{config.direction === "desc" ? "↓" : "↑"}</span>
        {sortConfigs.length > 1 && (
          <span className="text-[10px] ml-0.5 opacity-70 font-mono">
            {configIndex + 1}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 p-4 md:p-8 font-sans">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header Title Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur-xl border border-rose-100/80 p-6 rounded-3xl shadow-xl shadow-rose-100/30">
          <div>
            {/* ナビ・サイトマップ・メタデータは「物件を方位で探す」で統一している。
                ここだけ英語の機能名が出ていると、検索から来た人には別のページに
                見える。h1 は各所の呼び名と一致させる。 */}
            <h1 className="text-xl font-bold font-serif text-stone-900 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-amber-500" />
              物件を方位で探す
            </h1>
            <p className="text-stone-600 mt-1 text-xs max-w-2xl font-normal">
              今住んでいる場所から見た方位の吉凶と、同じ地域の家賃相場からの割安度を
              あわせて並べます。凶方位の物件は下に送ります。
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
            {/* 物件データそのものの鮮度。「再スキャン」は算出のやり直しであって
                DB は更新されないため、取り込みがいつ回ったのかを別に示す。 */}
            {metadata?.dataUpdatedAt && (
              <span className="text-[10px] text-stone-500 font-mono leading-tight text-right">
                <span className="block text-stone-400">物件データ最終取込</span>
                {new Date(metadata.dataUpdatedAt).toLocaleString("ja-JP", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            <button
              onClick={() => fetchData()}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-stone-900 rounded-xl text-xs font-semibold transition-all shadow-sm"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
              再スキャン
            </button>
          </div>
        </div>

        {searchError && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm font-medium">{searchError}</p>
            <button
              type="button"
              onClick={() => fetchData()}
              disabled={loading}
              className="shrink-0 rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-800 disabled:opacity-50"
            >
              もう一度スキャン
            </button>
          </div>
        )}

        {/* 2-Column Split Dashboard Layout */}
        {/* 出発地が未設定のときは結果を出さずに設定を促す。
            方位は出発地からの向きで決まるため、ここが無いと判定が成立しない。 */}
        {!hasBaseLocation && (
          <div className="mb-5 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-bold text-amber-900 mb-1">
              出発地を設定してください
            </h2>
            <p className="text-xs text-amber-800 leading-relaxed">
              吉方位は「今お住まいの場所から見てどの向きか」で決まります。
              出発地が未設定のままでは方位が定まらず、割安さだけの並びになってしまうため、
              スキャンを停止しています。左の「出発地座標」から現在のお住まいを指定してください。
            </p>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-5 items-stretch min-h-[600px] relative">
          {/* Left Column: Sidebar (expands from 30% to 50% in Table Mode) */}
          <div
            className={`transition-all duration-300 ease-in-out ${
              showTableView && showListView
                ? "w-full lg:w-[50%]"
                : "w-full lg:w-[30%]"
            } bg-gray-50 dark:bg-stone-50 rounded-3xl border border-gray-200 dark:border-stone-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-220px)] min-h-[600px] relative z-10`}
          >
            {/* Sticky Header */}
            <div className="sticky top-0 bg-gray-50/95 dark:bg-stone-50/95 backdrop-blur border-b border-gray-200 dark:border-stone-200 p-3 flex items-center justify-between z-30 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-50 text-indigo-600 dark:text-indigo-600 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800/40">
                  条件 ({activeFiltersCount})
                </span>
                <span className="text-[11px] font-semibold text-stone-400 dark:text-stone-500">
                  表示範囲内:{" "}
                  <b className="text-gray-900 dark:text-stone-900 font-mono text-xs">
                    {propertiesInBounds.length}
                  </b>{" "}
                  件
                </span>
              </div>

              {/* Toggle Button for Filter/List View (Only when <= 100 properties) */}
              {propertiesInBounds.length <= 100 ? (
                <button
                  onClick={() => setShowListView(!showListView)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    showListView
                      ? "bg-zinc-200 dark:bg-stone-100 hover:bg-zinc-300 dark:hover:bg-stone-200 text-gray-700 dark:text-stone-600"
                      : "bg-teal-500 hover:bg-teal-600 text-stone-900 shadow-sm"
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {showListView ? "絞込に戻る" : "一覧を表示"}
                </button>
              ) : (
                <span className="text-[10px] text-stone-400 font-medium">
                  ※100件以下で一覧表示可能
                </span>
              )}
            </div>

            {/* Sidebar Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* 物件の詳細。カード・表・TOP5 のクリックで開く。
                  絞込画面と一覧画面のどちらでも最上部に出す。地図はクリック
                  時点でこの物件へ寄っている。 */}
              {selectedProperty && (
                <div className="bg-white dark:bg-stone-50 rounded-2xl border-2 border-indigo-200 shadow-md overflow-hidden">
                  <div className="flex items-start justify-between gap-2 p-3.5 pb-2">
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mb-0.5">
                        物件の詳細
                      </div>
                      {selectedProperty.url ? (
                        <a
                          href={selectedProperty.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-sm text-gray-900 dark:text-stone-900 leading-snug hover:text-indigo-600 hover:underline break-words"
                        >
                          {selectedProperty.property_name}
                        </a>
                      ) : (
                        <div className="font-bold text-sm text-gray-900 dark:text-stone-900 leading-snug break-words">
                          {selectedProperty.property_name}
                        </div>
                      )}
                      <div className="text-[10px] text-stone-500 mt-0.5 break-words">
                        {selectedProperty.address}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      aria-label="詳細を閉じる"
                      className="shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-white hover:bg-gray-200 text-stone-500 text-sm leading-none"
                    >
                      ×
                    </button>
                  </div>

                  <div className="px-3.5 pb-2 flex items-baseline gap-2">
                    <span className="font-mono text-xl font-bold text-indigo-600">
                      {((selectedProperty.totalRent || 0) / 10000).toFixed(1)}
                      <span className="text-xs">万円</span>
                    </span>
                    <span className="text-[9px] text-stone-400">
                      管理費込み
                      {selectedProperty.size_sqm
                        ? ` / ㎡単価 ${Math.round(
                            (selectedProperty.totalRent || 0) /
                              Number(selectedProperty.size_sqm),
                          ).toLocaleString()}円`
                        : ""}
                    </span>
                    <span className="ml-auto">
                      {renderStars(
                        selectedProperty.totalScore,
                        selectedProperty.astrologyStatus,
                      )}
                    </span>
                  </div>

                  {/* 基本スペック。不動産アプリの物件概要と同じ並び */}
                  <div className="mx-3.5 mb-2 grid grid-cols-3 gap-px bg-gray-100 dark:bg-stone-200 rounded-xl overflow-hidden text-center">
                    {[
                      ["間取り", selectedProperty.layout || "—"],
                      [
                        "広さ",
                        selectedProperty.size_sqm
                          ? `${Number(selectedProperty.size_sqm)}㎡`
                          : "—",
                      ],
                      [
                        "築年数",
                        selectedProperty.building_age !== null &&
                        selectedProperty.building_age !== undefined
                          ? `築${selectedProperty.building_age}年`
                          : "—",
                      ],
                      ["階", selectedProperty.floor || "—"],
                      [
                        "駅徒歩",
                        selectedProperty.minutes_to_station !== null &&
                        selectedProperty.minutes_to_station !== undefined
                          ? `${selectedProperty.minutes_to_station}分`
                          : "—",
                      ],
                      [
                        "掲載",
                        `${selectedProperty.axisInputs?.listingCount ?? 1}社`,
                      ],
                    ].map(([k, v]) => (
                      <div
                        key={k as string}
                        className="bg-white dark:bg-stone-50 py-1.5"
                      >
                        <div className="text-[8px] text-stone-400">{k}</div>
                        <div className="text-[11px] font-bold text-stone-800">
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 方位。このサイトの本体 */}
                  <div className="mx-3.5 mb-2 rounded-xl bg-indigo-50/60 dark:bg-indigo-50 border border-indigo-100 px-3 py-2 text-[10px] text-stone-700">
                    出発地から見て
                    <span className="font-bold text-indigo-700 mx-1">
                      {selectedProperty.direction ?? "方位不明"}
                    </span>
                    {selectedProperty.maxAstroFactor && (
                      <span className="font-semibold">
                        （{selectedProperty.maxAstroFactor}）
                      </span>
                    )}
                    {typeof selectedProperty.distanceKm === "number" && (
                      <span className="text-stone-500 ml-1">
                        ・約{Math.round(selectedProperty.distanceKm)}km
                      </span>
                    )}
                  </div>

                  {/* 総合スコアの内訳。全軸出す */}
                  <div className="mx-3.5 mb-3 pt-2 border-t border-gray-100 dark:border-stone-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-bold text-stone-500">
                        評価の内訳
                      </span>
                      <span className="text-[9px] font-mono text-stone-500">
                        総合 {selectedProperty.totalScore.toFixed(1)}
                      </span>
                    </div>
                    {renderAxisBars(selectedProperty, AXIS_ORDER.length)}
                    {renderPartyBreakdown(selectedProperty)}
                  </div>
                </div>
              )}
              {!showListView ? (
                // VIEW 1: Filter Screen & Settings
                <>
                  {/* Geographic & Calculations Settings */}
                  <ArbitrageSidebarSection
                    title="スキャン地域と計算方式"
                    summary={
                      !hasBaseLocation
                        ? "出発地未設定"
                        : searchAreaForFilters(prefecture, radiusKm) ===
                            NATIONWIDE_SEARCH_AREA
                          ? "地図の表示範囲"
                          : searchAreaForFilters(prefecture, radiusKm) ===
                              NEARBY_SEARCH_AREA
                            ? "出発地から50km"
                            : searchAreaForFilters(prefecture, radiusKm)
                    }
                  >
                    {/* Search Area Selection */}
                    <div className="space-y-1">
                      <label
                        htmlFor="arb-search-area"
                        className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block"
                      >
                        検索範囲
                      </label>
                      <select
                        id="arb-search-area"
                        value={searchAreaForFilters(prefecture, radiusKm)}
                        onChange={(e) => handleSearchAreaChange(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer focus:border-indigo-500"
                      >
                        {/* 既定はこちら。上限を置かず、地図に見えている範囲を
                            検索する。ズームを引いて日本全体を映すと全国検索に
                            なり、そのときだけ十数秒かかる。 */}
                        <option value={NATIONWIDE_SEARCH_AREA}>
                          範囲を限定しない（地図に見えている範囲）
                        </option>
                        <option value={NEARBY_SEARCH_AREA}>
                          出発地から50km以内に絞る
                        </option>
                        {TARGET_PREFECTURES.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Birth Date */}
                    <div className="space-y-1">
                      <label
                        htmlFor="arb-birth"
                        className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block flex items-center justify-between"
                      >
                        <span>生年月日 (吉方位用)</span>
                        <span className="text-[9px] text-stone-400 font-normal">
                          時間指定可
                        </span>
                      </label>
                      <input
                        id="arb-birth"
                        type="datetime-local"
                        value={localBirthDate}
                        onChange={(e) => {
                          setLocalBirthDate(e.target.value);
                          setBirthDate(e.target.value);
                          localStorage.setItem("arb_birthDate", e.target.value);
                          saveUnifiedConfig({ birth_date: e.target.value });
                        }}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    {/* 出発地。方位はここからの向きで決まるので最重要の設定。
                        以前は入力欄自体が無く、既定の座標が黙って使われていた。 */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-stone-400 dark:text-stone-500">
                          出発地座標 (現在のお住まい・方位の基準)
                          {!hasBaseLocation && (
                            <span className="ml-1 text-amber-600 font-bold">
                              未設定
                            </span>
                          )}
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setShowBaseMapPicker(!showBaseMapPicker)
                          }
                          className={`text-[8px] px-1.5 py-0.5 rounded border transition-colors ${showBaseMapPicker ? "bg-indigo-50 dark:bg-indigo-50 text-indigo-600 dark:text-indigo-600 border-indigo-200 dark:border-indigo-800" : "bg-gray-100 dark:bg-white text-stone-400 dark:text-stone-500 border-gray-200 dark:border-stone-200"}`}
                        >
                          {showBaseMapPicker ? "閉じる" : "地図で検索"}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.00001"
                          value={localLat}
                          onChange={(e) => {
                            setLocalLat(e.target.value);
                            setBaseLat(e.target.value);
                            localStorage.setItem("arb_baseLat", e.target.value);
                            saveUnifiedConfig({
                              base_lat: parseFloat(e.target.value),
                            });
                          }}
                          className="w-1/2 px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-mono"
                          placeholder="緯度"
                        />
                        <input
                          type="number"
                          step="0.00001"
                          value={localLon}
                          onChange={(e) => {
                            setLocalLon(e.target.value);
                            setBaseLon(e.target.value);
                            localStorage.setItem("arb_baseLon", e.target.value);
                            saveUnifiedConfig({
                              base_lon: parseFloat(e.target.value),
                            });
                          }}
                          className="w-1/2 px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-mono"
                          placeholder="経度"
                        />
                      </div>
                    </div>

                    {showBaseMapPicker && (
                      <div className="w-full h-48 rounded-xl overflow-hidden border border-gray-200 dark:border-stone-200 relative z-20">
                        <LocationPickerInner
                          initialLat={Number(baseLat) || 35.1815}
                          initialLon={Number(baseLon) || 136.9066}
                          onSelect={(newLat: number, newLon: number) => {
                            const latStr = newLat.toFixed(5);
                            const lonStr = newLon.toFixed(5);
                            setLocalLat(latStr);
                            setBaseLat(latStr);
                            setLocalLon(lonStr);
                            setBaseLon(lonStr);
                            setMapCenter([newLat, newLon]);
                            localStorage.setItem("arb_baseLat", latStr);
                            localStorage.setItem("arb_baseLon", lonStr);
                            saveUnifiedConfig({
                              base_lat: newLat,
                              base_lon: newLon,
                            });
                          }}
                        />
                      </div>
                    )}

                    {/* Birth Location coordinates */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-stone-400 dark:text-stone-500">
                          出生地座標 (天体ライン用)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setShowBirthMapPicker(!showBirthMapPicker)
                          }
                          className={`text-[8px] px-1.5 py-0.5 rounded border transition-colors ${showBirthMapPicker ? "bg-indigo-50 dark:bg-indigo-50 text-indigo-600 dark:text-indigo-600 border-indigo-200 dark:border-indigo-800" : "bg-gray-100 dark:bg-white text-stone-400 dark:text-stone-500 border-gray-200 dark:border-stone-200"}`}
                        >
                          {showBirthMapPicker ? "閉じる" : "地図で検索"}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.00001"
                          value={localBirthLat}
                          onChange={(e) => {
                            setLocalBirthLat(e.target.value);
                            setBirthLat(e.target.value);
                            saveUnifiedConfig({
                              birth_lat: parseFloat(e.target.value),
                            });
                          }}
                          className="w-1/2 px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-mono"
                          placeholder="緯度"
                        />
                        <input
                          type="number"
                          step="0.00001"
                          value={localBirthLon}
                          onChange={(e) => {
                            setLocalBirthLon(e.target.value);
                            setBirthLon(e.target.value);
                            saveUnifiedConfig({
                              birth_lon: parseFloat(e.target.value),
                            });
                          }}
                          className="w-1/2 px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-mono"
                          placeholder="経度"
                        />
                      </div>
                    </div>

                    {showBirthMapPicker && (
                      <div className="w-full h-48 rounded-xl overflow-hidden border border-gray-200 dark:border-stone-200 relative z-20">
                        <LocationPickerInner
                          initialLat={Number(birthLat) || 34.3952}
                          initialLon={Number(birthLon) || 132.4482}
                          onSelect={(newLat: number, newLon: number) => {
                            const latStr = newLat.toFixed(5);
                            const lonStr = newLon.toFixed(5);
                            setLocalBirthLat(latStr);
                            setBirthLat(latStr);
                            setLocalBirthLon(lonStr);
                            setBirthLon(lonStr);
                            saveUnifiedConfig({
                              birth_lat: newLat,
                              birth_lon: newLon,
                            });
                          }}
                        />
                      </div>
                    )}

                    {/* Layer Mode */}
                    <div className="space-y-1">
                      <label
                        htmlFor="arb-layer"
                        className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block"
                      >
                        方位盤の計算レイヤー
                      </label>
                      <select
                        id="arb-layer"
                        value={layerMode}
                        onChange={(e) => handleLayerModeChange(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer focus:border-indigo-500"
                      >
                        <option value="year">年盤 (長期・引越し向き)</option>
                        <option value="month">月盤 (中期・旅行向き)</option>
                        <option value="day">日盤 (短期・出張向き)</option>
                        <option value="final">
                          総合ベクトル (全レイヤー統合)
                        </option>
                      </select>
                    </div>

                    {/* Options Toggles */}
                    <div className="flex flex-col gap-2 pt-1 border-t border-gray-100 dark:border-stone-200">
                      <label className="flex items-center gap-2 text-[10px] text-stone-400 dark:text-stone-500 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={useTrueNorth}
                          onChange={(e) =>
                            handleTrueNorthToggle(e.target.checked)
                          }
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        真北を使用 (無効時は磁北補正)
                      </label>
                      <label className="flex items-center gap-2 text-[10px] text-stone-400 dark:text-stone-500 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={lunarPhaseModifier}
                          onChange={(e) => {
                            setLunarPhaseModifier(e.target.checked);
                            setCurrentPage(1);
                          }}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        月相タイミング補正 (日単位 +/-10点)
                      </label>
                    </div>
                  </ArbitrageSidebarSection>

                  {/* Filter Criteria Panel */}
                  <ArbitrageSidebarSection
                    title="絞り込みフィルター"
                    summary={
                      activeFiltersCount > 0
                        ? `${activeFiltersCount}条件`
                        : "条件なし"
                    }
                  >
                    {/* スマート検索。1 行で複数条件をまとめて指定する入口。
                        定型表現は端末内の正規表現で即時に解釈し、純粋な
                        自然文だけ LLM（無ければキーワード検索）に回す。 */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="arb-smart-search"
                        className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block"
                      >
                        スマート検索（条件をまとめて入力）
                      </label>
                      <div className="relative">
                        <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-500" />
                        <input
                          id="arb-smart-search"
                          type="text"
                          placeholder="例: 姫路 2LDK 8万円以下 徒歩10分 築15年以内 北東"
                          value={smartQuery}
                          onChange={(e) => setSmartQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSmartSearch();
                            }
                          }}
                          className="w-full pl-9 pr-16 py-2 bg-amber-50/50 dark:bg-white border border-amber-200/70 dark:border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-400 outline-none transition-all"
                        />
                        <button
                          type="button"
                          onClick={handleSmartSearch}
                          disabled={smartBusy}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-stone-800 text-white text-[10px] font-bold hover:bg-stone-700 disabled:opacity-50"
                        >
                          {smartBusy ? "解釈中…" : "検索"}
                        </button>
                      </div>
                      <p className="text-[9px] text-stone-400 leading-relaxed">
                        家賃・間取り・徒歩分・築年数・広さ・方位・「吉方位のみ」を1行で。残りは物件名・住所の検索語になります。
                      </p>
                    </div>

                    {/* 適用中の条件チップ。何で絞れているかを常に見せ、
                        個別に外せるようにする。スマート検索で入った条件も
                        手で入れた条件も、区別せずここに出る。 */}
                    {activeFiltersCount > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {filterName && (
                          <FilterChip
                            label={`「${filterName}」`}
                            onRemove={() => setFilterName("")}
                          />
                        )}
                        {filterMaxRent && (
                          <FilterChip
                            label={`〜${filterMaxRent}万円`}
                            onRemove={() => setFilterMaxRent("")}
                          />
                        )}
                        {filterLayouts.length > 0 && (
                          <FilterChip
                            label={filterLayouts.join("・")}
                            onRemove={() => setFilterLayouts([])}
                          />
                        )}
                        {filterMaxAge && (
                          <FilterChip
                            label={`築${filterMaxAge}年以内`}
                            onRemove={() => setFilterMaxAge("")}
                          />
                        )}
                        {filterMaxStation && (
                          <FilterChip
                            label={`徒歩${filterMaxStation}分以内`}
                            onRemove={() => setFilterMaxStation("")}
                          />
                        )}
                        {filterMinSize && (
                          <FilterChip
                            label={`${filterMinSize}㎡以上`}
                            onRemove={() => setFilterMinSize("")}
                          />
                        )}
                        {filterDirection !== "ALL" && (
                          <FilterChip
                            label={`方位: ${filterDirection}`}
                            onRemove={() => setFilterDirection("ALL")}
                          />
                        )}
                        {filterStatus !== "ALL" && (
                          <FilterChip
                            label={`吉凶: ${filterStatus}`}
                            onRemove={() => setFilterStatus("ALL")}
                          />
                        )}
                        {filterLuckyOnly && (
                          <FilterChip
                            label="凶方位を除外"
                            onRemove={() => setFilterLuckyOnly(false)}
                          />
                        )}
                        {filterMinYield && (
                          <FilterChip
                            label={`利回り${filterMinYield}以上`}
                            onRemove={() => setFilterMinYield("")}
                          />
                        )}
                        {filterMinTotal && (
                          <FilterChip
                            label={`総合${filterMinTotal}点以上`}
                            onRemove={() => setFilterMinTotal("")}
                          />
                        )}
                      </div>
                    )}

                    {/* Search query input */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block">
                        物件名・住所検索
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500" />
                        <input
                          type="text"
                          placeholder="物件名・住所で検索..."
                          value={filterName}
                          onChange={handleFilterNameChange}
                          className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Status Select */}
                    <div className="space-y-1">
                      <label
                        htmlFor="arb-status"
                        className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block"
                      >
                        吉凶ステータス
                      </label>
                      <select
                        id="arb-status"
                        value={filterStatus}
                        onChange={handleFilterStatusChange}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer focus:border-indigo-500"
                      >
                        <option value="ALL">全ステータス</option>
                        <option value="OPTIMAL">OPTIMAL (大吉)</option>
                        <option value="SAFE">SAFE (吉)</option>
                        <option value="NOISE">NOISE (凶)</option>
                      </select>
                    </div>

                    {/* 方位で絞る。吉日カレンダーからの導線でここが埋まる。 */}
                    <div className="space-y-1">
                      <label
                        htmlFor="arb-direction"
                        className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block cursor-help"
                        title="現住地から見た方位で物件を絞ります。方位を決めてから物件を選ぶときに使います。"
                      >
                        方位で絞る
                      </label>
                      <select
                        id="arb-direction"
                        value={filterDirection}
                        onChange={(e) => {
                          setFilterDirection(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer focus:border-indigo-500"
                      >
                        <option value="ALL">全方位</option>
                        {ALL_DIRECTIONS.map((d) => (
                          <option key={d} value={d}>
                            {DIRECTION_LABELS[d]}（{d}）
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Rent & Age & Yield filters */}
                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block">
                          総家賃上限 (万円)
                        </label>
                        <input
                          type="number"
                          placeholder="例: 15"
                          value={filterMaxRent}
                          onChange={(e) => {
                            setFilterMaxRent(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block">
                          築年数上限 (年)
                        </label>
                        <input
                          type="number"
                          placeholder="例: 15"
                          value={filterMaxAge}
                          onChange={(e) => {
                            setFilterMaxAge(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block">
                          駅徒歩上限 (分)
                        </label>
                        <input
                          type="number"
                          placeholder="例: 10"
                          value={filterMaxStation}
                          onChange={(e) => {
                            setFilterMaxStation(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block">
                          専有面積下限 (㎡)
                        </label>
                        <input
                          type="number"
                          placeholder="例: 40"
                          value={filterMinSize}
                          onChange={(e) => {
                            setFilterMinSize(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block">
                          最小利回り偏差値
                        </label>
                        <input
                          type="number"
                          placeholder="例: 60"
                          value={filterMinYield}
                          onChange={(e) => {
                            setFilterMinYield(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block cursor-help"
                          title="現在の重み配分で計算した総合スコアの下限。重みを変えると同じ値でも通る物件が変わる。"
                        >
                          総合スコア下限
                        </label>
                        <input
                          type="number"
                          placeholder="例: 60"
                          value={filterMinTotal}
                          onChange={(e) => {
                            setFilterMinTotal(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </ArbitrageSidebarSection>

                  {/* 同行者パネル。
                      合流する親族のように、別の出発地から同じ移転先へ動く人を
                      足すと、全員ぶんの方位をまとめて判定する。 */}
                  <ArbitrageSidebarSection
                    title="同行者・合流する人"
                    summary={
                      partyMembers.length > 0
                        ? `${partyMembers.length + 1}人`
                        : "本人のみ"
                    }
                  >
                    <p className="text-[10px] text-stone-500 leading-relaxed">
                      出発地が違えば同じ物件でも方位が変わります。登録すると、全員にとっての方位と「いつなら全員で動けるか」を合わせて判定します。
                    </p>

                    <button
                      type="button"
                      onClick={() => setShowPartyPanel((v) => !v)}
                      className="text-[10px] font-semibold text-indigo-600 hover:underline"
                    >
                      {showPartyPanel ? "同行者設定を隠す" : "同行者設定を表示"}
                    </button>

                    {showPartyPanel && (
                      <div className="space-y-3">
                        {savedProfiles.length > 0 && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-stone-400 block">
                              保存済みプロフィールから追加
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {savedProfiles
                                .filter(
                                  (preset) =>
                                    !partyMembers.some(
                                      (m) => m.id === preset.id,
                                    ),
                                )
                                .map((preset) => (
                                  <button
                                    key={preset.id}
                                    onClick={() => addPartyMember(preset)}
                                    className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-gray-50 dark:bg-white text-stone-600 border border-gray-200 dark:border-stone-200 hover:border-indigo-300"
                                  >
                                    ＋ {preset.name}
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => addPartyMember()}
                          className="w-full px-3 py-2 rounded-xl text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                        >
                          ＋ 手入力で同行者を追加
                        </button>

                        {partyMembers.map((member) => (
                          <div
                            key={member.id}
                            className="space-y-2 p-3 rounded-xl bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={member.name}
                                onChange={(e) =>
                                  updatePartyMember(member.id, {
                                    name: e.target.value,
                                  })
                                }
                                placeholder="名前（母、父など）"
                                className="flex-1 px-2 py-1.5 bg-white dark:bg-stone-50 border border-gray-200 dark:border-stone-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                              />
                              <button
                                onClick={() =>
                                  setPartyMembers((prev) =>
                                    prev.filter((m) => m.id !== member.id),
                                  )
                                }
                                className="px-2 py-1 text-[10px] font-semibold text-rose-500 hover:underline shrink-0"
                              >
                                削除
                              </button>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-semibold text-stone-400 block">
                                生年月日時
                              </label>
                              <input
                                type="datetime-local"
                                value={normalizeDateTimeLocal(member.birthDate)}
                                onChange={(e) =>
                                  updatePartyMember(member.id, {
                                    birthDate: e.target.value,
                                  })
                                }
                                className="w-full px-2 py-1.5 bg-white dark:bg-stone-50 border border-gray-200 dark:border-stone-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                              />
                            </div>

                            <div className="space-y-1">
                              <label
                                className="text-[10px] font-semibold text-stone-400 block cursor-help"
                                title="この人が今住んでいる場所。ここからの向きでこの人の方位が決まる。"
                              >
                                出発地（現住地）の緯度・経度
                              </label>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  step="0.00001"
                                  value={member.baseLat}
                                  onChange={(e) =>
                                    updatePartyMember(member.id, {
                                      baseLat: e.target.value,
                                    })
                                  }
                                  placeholder="緯度"
                                  disabled={member.stationary}
                                  className="w-1/2 px-2 py-1.5 bg-white dark:bg-stone-50 border border-gray-200 dark:border-stone-200 rounded-lg text-xs outline-none focus:border-indigo-500 font-mono disabled:opacity-40"
                                />
                                <input
                                  type="number"
                                  step="0.00001"
                                  value={member.baseLon}
                                  onChange={(e) =>
                                    updatePartyMember(member.id, {
                                      baseLon: e.target.value,
                                    })
                                  }
                                  placeholder="経度"
                                  disabled={member.stationary}
                                  className="w-1/2 px-2 py-1.5 bg-white dark:bg-stone-50 border border-gray-200 dark:border-stone-200 rounded-lg text-xs outline-none focus:border-indigo-500 font-mono disabled:opacity-40"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <label
                                className="flex items-center gap-1.5 text-[10px] text-stone-500 cursor-pointer"
                                title="既に移転先の側に住んでいて動かない人。方位が発生しないので判定から外し、同居する相手として一覧にだけ残す。"
                              >
                                <input
                                  type="checkbox"
                                  checked={member.stationary}
                                  onChange={(e) =>
                                    updatePartyMember(member.id, {
                                      stationary: e.target.checked,
                                    })
                                  }
                                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                                />
                                移動しない（現地在住）
                              </label>
                              <label
                                className="flex items-center gap-1.5 text-[10px] text-stone-500"
                                title="「重み付き」でまとめるときの比重。"
                              >
                                比重
                                <input
                                  type="number"
                                  min={0.5}
                                  max={10}
                                  step={0.5}
                                  value={member.weight}
                                  onChange={(e) =>
                                    updatePartyMember(member.id, {
                                      weight: Number(e.target.value) || 1,
                                    })
                                  }
                                  className="w-14 px-1.5 py-1 bg-white dark:bg-stone-50 border border-gray-200 dark:border-stone-200 rounded-lg text-xs outline-none font-mono"
                                />
                              </label>
                            </div>
                          </div>
                        ))}

                        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100 dark:border-stone-200">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-stone-400 block">
                              まとめ方
                            </label>
                            <select
                              value={partyPolicy}
                              onChange={(e) => {
                                setPartyPolicy(e.target.value);
                                setCurrentPage(1);
                              }}
                              className="w-full px-2 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer focus:border-indigo-500"
                            >
                              {PARTY_POLICIES.map((policy) => (
                                <option
                                  key={policy.id}
                                  value={policy.id}
                                  title={policy.description}
                                >
                                  {policy.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label
                              className="text-[10px] font-semibold text-stone-400 block cursor-help"
                              title="対象日から何日先まで「全員が動ける日」を探すか。0 にすると時期の判定をしない。"
                            >
                              時期の走査 (日先)
                            </label>
                            <select
                              value={horizonDays}
                              onChange={(e) => {
                                setHorizonDays(Number(e.target.value));
                                setCurrentPage(1);
                              }}
                              className="w-full px-2 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer focus:border-indigo-500"
                            >
                              <option value={0}>見ない</option>
                              <option value={14}>14日先まで</option>
                              <option value={30}>30日先まで</option>
                              <option value={60}>60日先まで</option>
                              <option value={90}>90日先まで</option>
                            </select>
                          </div>
                        </div>

                        <p className="text-[10px] text-stone-400 leading-relaxed">
                          {
                            PARTY_POLICIES.find((p) => p.id === partyPolicy)
                              ?.description
                          }
                        </p>
                      </div>
                    )}
                  </ArbitrageSidebarSection>
                  {/* 評価軸パネル。
                      同じ候補集合を別の角度から見直すための操作をここに集める。
                      重みの変更は画面内で完結するので再スキャンは起きない。 */}
                  <ArbitrageSidebarSection
                    title="評価軸の重み"
                    summary={
                      weightPresetId === "custom"
                        ? "手動調整"
                        : getPreset(weightPresetId).label
                    }
                  >
                    <p className="text-[10px] text-stone-500 leading-relaxed">
                      何を重視して順位を付けるかを選びます。切り替えても再スキャンは走りません。
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {WEIGHT_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          title={preset.description}
                          onClick={() => {
                            setWeightPresetId(preset.id);
                            setCurrentPage(1);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                            weightPresetId === preset.id
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                              : "bg-gray-50 dark:bg-white text-stone-600 border-gray-200 dark:border-stone-200 hover:border-indigo-300"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <button
                        title="スライダーで軸ごとの重みを自由に決める"
                        onClick={() => {
                          // 直前に見ていた配分を初期値にすると、
                          // 「今の順位を少しだけ動かす」調整がしやすい。
                          setCustomSliders(weightsToSliders(activeWeights));
                          setWeightPresetId("custom");
                          setShowWeightPanel(true);
                          setCurrentPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                          weightPresetId === "custom"
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                            : "bg-gray-50 dark:bg-white text-stone-600 border-gray-200 dark:border-stone-200 hover:border-indigo-300"
                        }`}
                      >
                        カスタム
                      </button>
                    </div>

                    {weightPresetId !== "custom" && (
                      <p className="text-[10px] text-stone-400 leading-relaxed">
                        {getPreset(weightPresetId).description}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowWeightPanel((v) => !v)}
                      className="text-[10px] font-semibold text-indigo-600 hover:underline"
                    >
                      {showWeightPanel
                        ? "軸ごとのスライダーを隠す"
                        : "軸ごとのスライダーを表示"}
                    </button>

                    {showWeightPanel && (
                      <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-stone-200">
                        {AXIS_ORDER.map((key) => {
                          const meta = AXIS_META[key];
                          const pct = Math.round(
                            (activeWeights[key] ?? 0) * 100,
                          );
                          return (
                            <div key={key} className="space-y-0.5">
                              <div className="flex items-center justify-between">
                                <label
                                  className="text-[10px] font-semibold text-stone-500 cursor-help"
                                  title={meta.hint}
                                >
                                  {meta.label}
                                </label>
                                <span className="text-[10px] font-mono text-stone-400">
                                  {pct}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={
                                  weightPresetId === "custom"
                                    ? (customSliders[key] ?? 0)
                                    : Math.round(
                                        weightsToSliders(activeWeights)[key],
                                      )
                                }
                                onChange={(e) => {
                                  const next = Number(e.target.value);
                                  // プリセットを触った瞬間にカスタムへ移す。
                                  // 元のプリセット名のまま値だけ変わると、
                                  // 何を見ているのか分からなくなる。
                                  setCustomSliders((prev) => {
                                    const base =
                                      weightPresetId === "custom"
                                        ? prev
                                        : weightsToSliders(activeWeights);
                                    return { ...base, [key]: next };
                                  });
                                  setWeightPresetId("custom");
                                  setCurrentPage(1);
                                }}
                                className="w-full h-1 accent-indigo-600 cursor-pointer"
                              />
                            </div>
                          );
                        })}
                        <p className="text-[10px] text-stone-400 pt-1">
                          データが無い軸は 0
                          点ではなく評価対象外として扱い、残りの軸で正規化します（カードの「軸カバー」表示）。
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3.5 pt-1 border-t border-gray-100 dark:border-stone-200">
                      <div className="space-y-1">
                        <label
                          className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block cursor-help"
                          title={AXIS_META.cost.hint}
                        >
                          月額予算 (万円)
                        </label>
                        <input
                          type="number"
                          placeholder="例: 12"
                          value={budgetManYen}
                          onChange={(e) => {
                            setBudgetManYen(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="arb-strategy"
                          className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block cursor-help"
                          title="DB から候補を切り出すときの順序。重みだけを変えても、母集合に入っていない物件は評価されない。"
                        >
                          候補の集め方
                        </label>
                        <select
                          id="arb-strategy"
                          value={candidateStrategy}
                          onChange={(e) => {
                            setCandidateStrategy(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer focus:border-indigo-500"
                        >
                          {CANDIDATE_STRATEGIES.map((strategy) => (
                            <option
                              key={strategy.id}
                              value={strategy.id}
                              title={strategy.description}
                            >
                              {strategy.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 天中殺の扱い。
                        年天中殺は 2 年続くため、既定の厳格な扱いでは
                        その間どの方位・どの日も不可になる。禁止則として
                        扱うかは流派によって違うので選べるようにする。 */}
                    <div className="space-y-1 pt-1 border-t border-gray-100 dark:border-stone-200">
                      <label
                        className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 block cursor-help"
                        title="天中殺（算命学）＝空亡（四柱推命）。九星気学には本来無い概念で、どこまで禁止則として扱うかは流派によって異なる。"
                      >
                        天中殺の扱い
                      </label>
                      <select
                        value={tenchusatsuMode}
                        onChange={(e) => {
                          setTenchusatsuMode(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer focus:border-indigo-500"
                      >
                        {TENCHUSATSU_MODES.map((mode) => (
                          <option
                            key={mode.id}
                            value={mode.id}
                            title={mode.description}
                          >
                            {mode.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-stone-400 leading-relaxed">
                        {
                          TENCHUSATSU_MODES.find(
                            (m) => m.id === tenchusatsuMode,
                          )?.description
                        }
                      </p>
                      <p className="text-[9px] text-stone-400 leading-relaxed">
                        根拠:{" "}
                        {
                          TENCHUSATSU_MODES.find(
                            (m) => m.id === tenchusatsuMode,
                          )?.rationale
                        }
                      </p>
                    </div>

                    <label
                      className="flex items-center gap-2 text-[10px] text-stone-500 cursor-pointer"
                      title="転勤・家庭の事情など、自分の意思では選べない移動。多くの流派が他動的な移動は天中殺の影響を受けないとする。"
                    >
                      <input
                        type="checkbox"
                        checked={involuntaryMove}
                        onChange={(e) => {
                          setInvoluntaryMove(e.target.checked);
                          setCurrentPage(1);
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      やむを得ない移動（転勤など）として扱う
                    </label>

                    <label className="flex items-center gap-2 text-[10px] text-stone-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sinkAvoidStatus}
                        onChange={(e) => {
                          setSinkAvoidStatus(e.target.checked);
                          setCurrentPage(1);
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      避けるべき方位・期間の物件を最下位に沈める
                    </label>
                  </ArbitrageSidebarSection>

                  {/* TOP 5 お買い得アコーディオン */}
                  <ArbitrageSidebarSection
                    title="アービトラージ物件 TOP 5"
                    summary={
                      loading
                        ? "検索中"
                        : `${topArbitrage.length}件・総合スコア順`
                    }
                    icon={
                      <Sparkles className="h-4 w-4 text-amber-500 animate-bounce" />
                    }
                  >
                    <div className="space-y-3.5">
                      {/* 何を根拠に「TOP」なのかが分からない、という指摘への対応。
                          順位の出どころを、開いた時点で読める場所に書く。 */}
                      <div className="rounded-xl bg-amber-50/70 dark:bg-amber-50 border border-amber-200/70 p-2.5 text-[10px] leading-relaxed text-stone-600">
                        <p>
                          <span className="font-bold text-stone-700">
                            アービトラージ
                          </span>
                          とは、ここでは
                          <span className="font-bold">
                            周辺の相場と比べた家賃の歪み
                          </span>
                          のことです。同じ条件なら安く借りられる物件を、方位・暦・住みやすさと合わせて1つの点数にしています。
                        </p>
                        <p className="mt-1.5">
                          並び順は
                          <span className="font-bold">総合スコアの高い順</span>
                          。総合スコアは
                          <span className="font-bold">
                            {AXIS_ORDER.length}つの評価軸の加重平均
                          </span>
                          で、重みは「評価軸の重み」で選んだ配分（現在
                          <span className="font-bold">
                            「
                            {weightPresetId === "custom"
                              ? "手動調整"
                              : getPreset(weightPresetId).label}
                            」
                          </span>
                          ）を使います。各物件の下のバーが、重みの大きい順に上位3軸の得点です。
                        </p>
                        <p className="mt-1.5 text-stone-500">
                          物件リストの並べ替えを変えても、ここは総合スコア順のままです。
                          {sinkAvoidStatus &&
                            "避けるべき方位・期間の物件は最下位に沈めています。"}
                        </p>
                      </div>
                      {loading ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="h-14 rounded-xl bg-gray-100 dark:bg-white animate-pulse"
                            />
                          ))}
                        </div>
                      ) : topArbitrage.length === 0 ? (
                        <div className="p-6 text-center text-stone-400 text-[10px]">
                          合致する物件がありません。
                        </div>
                      ) : (
                        topArbitrage.map((item, rank) => (
                          <div
                            key={item.id}
                            onClick={() => {
                              setSelectedId(item.id);
                              setMapCenter([item.lat, item.lon]);
                            }}
                            className="p-2.5 rounded-xl bg-gray-50 dark:bg-white border border-gray-200/50 dark:border-stone-200 hover:border-indigo-200 cursor-pointer transition-colors shadow-2xs"
                          >
                            <div className="flex justify-between items-center">
                              <div className="truncate pr-2 max-w-[70%] flex-1">
                                {item.url ? (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-bold text-gray-900 dark:text-stone-800 text-[11px] truncate hover:text-indigo-500 transition-colors hover:underline block"
                                  >
                                    {item.property_name}
                                  </a>
                                ) : (
                                  <div className="font-bold text-gray-900 dark:text-stone-800 text-[11px] truncate">
                                    {item.property_name}
                                  </div>
                                )}
                                <div className="text-[10px] text-stone-400 mt-1 flex flex-col gap-0.5">
                                  <span className="font-semibold">
                                    {item.direction
                                      ? `${item.direction} (${item.maxAstroFactor || "計算中"})`
                                      : "方位不明"}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-mono text-indigo-600 dark:text-indigo-600 font-bold text-[11px]">
                                  {Math.round((item.totalRent || 0) / 10000)}
                                  万円
                                </div>
                                <div className="mt-1 flex justify-end">
                                  {renderStars(
                                    item.totalScore,
                                    item.astrologyStatus,
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* なぜこの順位なのか。重みの大きい上位3軸の得点を
                                そのまま出す。カード表示と同じ描画を使う。 */}
                            <div className="mt-2 pt-2 border-t border-gray-200/70 dark:border-stone-200">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] font-bold text-stone-500">
                                  第{rank + 1}位の根拠
                                </span>
                                <span
                                  className="text-[9px] font-mono text-stone-500"
                                  title={
                                    item.axisMissing?.length
                                      ? `未算出の軸: ${item.axisMissing
                                          .map(
                                            (k: AxisKey) => AXIS_META[k].label,
                                          )
                                          .join("、")}`
                                      : "全ての軸にデータあり"
                                  }
                                >
                                  総合 {item.totalScore.toFixed(1)}
                                  {item.axisCoverage < 0.999 && (
                                    <span className="ml-1 text-amber-600">
                                      （軸カバー{" "}
                                      {Math.round(item.axisCoverage * 100)}%）
                                    </span>
                                  )}
                                </span>
                              </div>
                              {renderAxisBars(item, 3)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ArbitrageSidebarSection>
                </>
              ) : (
                // VIEW 2: Property List Screen (Cards or Table)
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-200 dark:border-stone-200 pb-2">
                    <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                      物件リスト ({sortedTableData.length}件中、表示範囲内)
                    </h3>

                    {/* Card vs Table toggle switches */}
                    <div className="flex items-center gap-1 bg-zinc-200 dark:bg-white p-0.5 rounded-lg shrink-0 select-none">
                      <button
                        onClick={() => setShowTableView(false)}
                        className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${!showTableView ? "bg-white dark:bg-stone-100 text-gray-900 dark:text-stone-900 shadow-xs" : "text-stone-400 hover:text-gray-700 dark:hover:text-stone-600"}`}
                      >
                        カード
                      </button>
                      <button
                        onClick={() => setShowTableView(true)}
                        className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${showTableView ? "bg-white dark:bg-stone-100 text-gray-900 dark:text-stone-900 shadow-xs" : "text-stone-400 hover:text-gray-700 dark:hover:text-stone-600"}`}
                      >
                        テーブル
                      </button>
                    </div>
                  </div>

                  {propertiesInBounds.length === 0 ? (
                    <div className="p-12 text-center text-stone-400 text-xs">
                      現在の表示範囲内に条件合致する物件がありません。地図をドラッグするかズームアウトしてください。
                    </div>
                  ) : !showTableView ? (
                    // Card View List inside sidebar
                    <div className="space-y-3.5">
                      {propertiesInBounds.map((item) => {
                        const pinColors = getPropertyPinColors(item);
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              setSelectedId(item.id);
                              setMapCenter([item.lat, item.lon]);
                            }}
                            className="p-3.5 rounded-2xl bg-white dark:bg-stone-50 border border-gray-200/60 dark:border-stone-200 hover:border-indigo-200 cursor-pointer transition-colors shadow-2xs relative group"
                          >
                            <div className="flex justify-between items-start gap-1 mb-1">
                              <h4 className="font-bold text-gray-900 dark:text-stone-800 text-xs leading-snug line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-600 transition-colors">
                                {item.url ? (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:underline"
                                  >
                                    {item.property_name}
                                  </a>
                                ) : (
                                  item.property_name
                                )}
                              </h4>
                              <span
                                className={`text-[8.5px] px-1.5 py-0.5 rounded font-bold shrink-0 leading-none ${pinColors.bgClass} ${pinColors.textClass}`}
                              >
                                {pinColors.label}
                              </span>
                            </div>

                            <div className="text-[10px] text-stone-400 truncate max-w-xs">
                              {item.address || "住所情報なし"}
                            </div>

                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2.5 pt-2 border-t border-gray-100 dark:border-stone-200 text-[10px] text-stone-400 dark:text-stone-500 font-mono">
                              <div className="flex justify-between">
                                <span>総賃料:</span>
                                <span className="font-bold text-gray-900 dark:text-stone-900">
                                  {item.totalRent
                                    ? `${(item.totalRent / 10000).toFixed(1)}万円`
                                    : "不明"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>利回り偏差値:</span>
                                <span
                                  className={`font-bold ${item.yieldScore > 60 ? "text-emerald-500" : "text-gray-900 dark:text-stone-900"}`}
                                >
                                  {item.yieldScore.toFixed(1)}
                                </span>
                              </div>
                              <div className="flex justify-between col-span-2">
                                <span>広さ/築年/徒歩:</span>
                                <span className="font-semibold text-gray-800 dark:text-stone-700">
                                  {item.size_sqm}㎡ / 築{item.building_age || 0}
                                  年 / {item.minutes_to_station || "不明"}分
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>近隣相場比:</span>
                                <span className="font-semibold text-gray-800 dark:text-stone-700">
                                  {item.axisInputs?.localMedianSqmRent
                                    ? `${Math.round(
                                        (item.propSqmRent /
                                          item.axisInputs.localMedianSqmRent -
                                          1) *
                                          100,
                                      )}%`
                                    : "—"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>掲載:</span>
                                <span className="font-semibold text-gray-800 dark:text-stone-700">
                                  {item.axisInputs?.listedDays !== null &&
                                  item.axisInputs?.listedDays !== undefined
                                    ? `${item.axisInputs.listedDays}日 / ${item.axisInputs.listingCount ?? 1}社`
                                    : "—"}
                                </span>
                              </div>
                              <div className="flex justify-between col-span-2 pt-1 border-t border-zinc-100 dark:border-stone-200">
                                <span>方位・吉凶:</span>
                                <span
                                  className={`font-bold ${pinColors.textClass}`}
                                >
                                  {item.direction
                                    ? `${item.direction} (${item.maxAstroFactor})`
                                    : "不明"}
                                </span>
                              </div>
                            </div>

                            {/* 総合スコアの内訳。なぜこの順位なのかを軸ごとに示す。 */}
                            <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-stone-200">
                              {renderAxisBars(item)}
                            </div>

                            {/* 誰にとってどうか、いつなら全員で動けるか。 */}
                            {renderPartyBreakdown(item)}

                            <div className="mt-2.5 flex justify-between items-center bg-gray-50 dark:bg-white/80 rounded-lg px-2 py-1.5">
                              {renderStars(
                                item.totalScore,
                                item.astrologyStatus,
                              )}
                              <span
                                className="text-[8px] text-stone-500 font-semibold"
                                title={
                                  item.axisMissing?.length
                                    ? `未算出の軸: ${item.axisMissing
                                        .map((k: AxisKey) => AXIS_META[k].label)
                                        .join("、")}`
                                    : "全ての軸にデータあり"
                                }
                              >
                                総合 {item.totalScore.toFixed(1)}
                                {item.axisCoverage < 0.999 && (
                                  <span className="ml-1 text-amber-600">
                                    （軸カバー{" "}
                                    {Math.round(item.axisCoverage * 100)}%）
                                  </span>
                                )}
                              </span>
                            </div>

                            {/* Small date calendar row inside card */}
                            <div className="mt-2.5">
                              <AstroGridCalendar
                                dateScores={item.dateScores}
                                onDateChange={handleDateChange}
                                isTransitioning={isTransitioningDate}
                                fetchTimeline={(range) =>
                                  fetchTimeline(item.lat, item.lon, range)
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Table View Mode inside expanded sidebar (55% width)
                    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-stone-200 bg-white dark:bg-stone-50">
                      <table className="w-full text-xs text-left min-w-[500px]">
                        <thead className="text-[10px] text-stone-400 uppercase bg-gray-50 dark:bg-white/80 border-b border-gray-200 dark:border-stone-200">
                          <tr>
                            <th
                              className="px-4 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors font-bold"
                              onClick={(e) => handleSortChange("arbitrage", e)}
                            >
                              おすすめ度 {renderSortIndicator("arbitrage")}
                            </th>
                            <th className="px-4 py-2.5 font-bold">
                              物件名 / 住所
                            </th>
                            <th
                              className="px-4 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors font-bold"
                              onClick={(e) => handleSortChange("astrology", e)}
                            >
                              方位・吉凶 {renderSortIndicator("astrology")}
                            </th>
                            <th
                              className="px-4 py-2.5 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors font-bold"
                              onClick={(e) => handleSortChange("rent", e)}
                            >
                              総家賃 {renderSortIndicator("rent")}
                            </th>
                            <th
                              className="px-4 py-2.5 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors font-bold"
                              onClick={(e) => handleSortChange("yield", e)}
                            >
                              利回り偏差 {renderSortIndicator("yield")}
                            </th>
                            {/* 重みが乗っている軸だけを列にする。全 9 軸を常時出すと
                                横に伸びて読めないうえ、見ていない軸まで判断材料に見える。 */}
                            {tableAxisColumns.map((key) => (
                              <th
                                key={key}
                                title={AXIS_META[key].hint}
                                className="px-3 py-2.5 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors font-bold"
                                onClick={(e) => handleSortChange(key, e)}
                              >
                                {AXIS_META[key].short}{" "}
                                {renderSortIndicator(key)}
                              </th>
                            ))}
                            <th className="px-4 py-2.5 text-right font-bold">
                              平米 / 築年 / 徒歩
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {propertiesInBounds.map((item) => {
                            const pinColors = getPropertyPinColors(item);
                            return (
                              <tr
                                key={item.id}
                                onClick={() => {
                                  setSelectedId(item.id);
                                  setMapCenter([item.lat, item.lon]);
                                }}
                                className="border-b border-gray-100 dark:border-stone-200 hover:bg-gray-50 dark:hover:bg-white/80 transition-colors cursor-pointer"
                              >
                                <td className="px-4 py-3 font-mono">
                                  {renderStars(
                                    item.totalScore,
                                    item.astrologyStatus,
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-bold text-gray-900 dark:text-stone-800 truncate max-w-[180px]">
                                    {item.url ? (
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-600 dark:text-blue-600 hover:underline"
                                      >
                                        {item.property_name}
                                      </a>
                                    ) : (
                                      item.property_name
                                    )}
                                  </div>
                                  <div className="text-[10px] text-stone-500 mt-0.5 truncate max-w-[180px]">
                                    {item.address}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-0.5">
                                    <span
                                      className={`font-semibold ${pinColors.textClass}`}
                                    >
                                      {item.direction
                                        ? `${item.direction} (${item.maxAstroFactor})`
                                        : "不明"}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-semibold">
                                  {item.totalRent.toLocaleString()}円
                                </td>
                                <td className="px-4 py-3 text-right font-mono">
                                  <span
                                    className={
                                      item.yieldScore > 60
                                        ? "text-emerald-500 font-bold"
                                        : ""
                                    }
                                  >
                                    {item.yieldScore.toFixed(1)}
                                  </span>
                                </td>
                                {tableAxisColumns.map((key) => {
                                  const value = item.axes?.[key];
                                  const missing =
                                    value === null || value === undefined;
                                  return (
                                    <td
                                      key={key}
                                      className="px-3 py-3 text-right font-mono"
                                    >
                                      {missing ? (
                                        <span
                                          className="text-stone-300"
                                          title="この物件はこの軸のデータが未取得のため、総合スコアの計算から外しています"
                                        >
                                          —
                                        </span>
                                      ) : (
                                        <span
                                          className={
                                            value >= 70
                                              ? "text-emerald-600 font-bold"
                                              : value < 35
                                                ? "text-rose-500"
                                                : ""
                                          }
                                        >
                                          {Math.round(value)}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-3 text-right text-stone-400 font-mono text-[10px]">
                                  {item.size_sqm}㎡ / 築{item.building_age || 0}
                                  年 / {item.minutes_to_station || "不明"}分
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Leaflet Map (shrinks to 50% width when table mode is expanded) */}
          <div
            className={`transition-all duration-300 ease-in-out ${
              showTableView && showListView
                ? "w-full lg:w-[50%]"
                : "w-full lg:w-[70%]"
            } h-[calc(100vh-220px)] min-h-[600px] rounded-3xl overflow-hidden shadow-lg border border-gray-200 dark:border-stone-200 relative bg-gray-50 dark:bg-white shrink-0`}
          >
            <ArbitrageMap
              properties={filteredData}
              baseLat={hasBaseLocation ? Number(baseLat) : mapCenter[0]}
              baseLon={hasBaseLocation ? Number(baseLon) : mapCenter[1]}
              mapCenter={mapCenter}
              useTrueNorth={useTrueNorth}
              layerMode={layerMode}
              radiusKm={radiusKm}
              prefecture={prefecture}
              keepWideView={isNationwideOverview}
              selectedPropertyId={selectedId}
              isTransitioningDate={isTransitioningDate}
              showListView={showListView}
              useClassical={useClassical}
              onDateChange={handleDateChange}
              onBoundsChange={(b) => {
                setMapBounds((prev) => {
                  if (
                    !prev ||
                    Math.abs(prev.minLat - b.minLat) > 0.001 ||
                    Math.abs(prev.minLon - b.minLon) > 0.001 ||
                    prev.zoom !== b.zoom
                  ) {
                    return b;
                  }
                  return prev;
                });
              }}
            />
            {loading && data.length === 0 ? (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-xs z-[1000] flex flex-col items-center justify-center font-mono text-xs text-stone-600">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                データベースから割安物件を走査中...
              </div>
            ) : null}
            {loading && data.length > 0 && (
              <div className="absolute top-4 right-4 bg-white/70 border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg text-[10px] font-mono flex items-center gap-2 z-[1001] shadow-lg">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                SCANNING...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
