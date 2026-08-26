"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  Loader2,
  TrendingUp,
  Sparkles,
  Filter,
  Search,
  RefreshCw,
} from "lucide-react";
import { ArbitrageMap } from "@/components/ArbitrageMap";
import { MetaphysicalConfigBar } from "@/components/layout/MetaphysicalConfigBar";
import { ArbitrageSidebarSection } from "@/components/relocation/ArbitrageSidebarSection";
import { TransactionsPanel } from "@/components/relocation/TransactionsPanel";
import { DirectionTierOverview } from "@/components/relocation/DirectionTierOverview";
import { FavoriteButton } from "@/components/relocation/FavoriteButton";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";
import { loadSettings, type Settings } from "@/lib/userSettings";
import type { ScoredProperty } from "@/lib/scoredProperty";
import { AstroGridCalendar } from "@/components/realestate/AstroGridCalendar";
import {
  getPropertyPinColors,
  isAvoidStatus as isAvoidAstrologyStatus,
} from "@/utils/arbitrageHelpers";
import {
  CANDIDATE_STRATEGIES,
  DEFAULT_CANDIDATE_STRATEGY,
} from "@/utils/arbitrageScoring";
import { DEFAULT_PARTY_POLICY, PARTY_POLICIES } from "@/utils/arbitrageParty";
import {
  DEFAULT_TENCHUSATSU_MODE,
  TENCHUSATSU_MODES,
} from "@/utils/tenchusatsuPolicy";
import type { ProfilePreset } from "@/lib/profilePresetSync";
import {
  ALL_DIRECTIONS,
  DIRECTION_LABELS,
  gradeVerdict,
  judgeDayAllDirections,
} from "@/utils/auspiciousDays";
import {
  getHonmeiStar,
  getPersonalVoidZodiac,
  parseDirectionFilterMode,
  type DirectionFilterMode,
} from "@/utils/ephemerisEngine";
import { prefectureDirections } from "@/lib/prefectureDirection";
import {
  expandLayoutSelections,
  matchesLayoutSelection,
} from "@/lib/layoutMatch";

/**
 * 暦の平年値。本命星×天中殺グループごとの、段階別の年平均日数（9年窓）。
 * 「吉日12日」が多いのか少ないのかを読むための基準。決定的な暦の要約で
 * あって観測データではないため、毎晩の再計算はしない。
 */
/**
 * /api/rentals/arbitrage の metadata のうち、この画面が読む枝。
 * 件数まわりは lib/arbitrageCounts の ScanCountsInput が正
 * （欠けても落とさない前提の unknown）なので、それを継承する。
 */
interface ScanMetadata extends ScanCountsInput {
  dataUpdatedAt?: string | null;
  timing?: { dbMs: number; computeMs: number } | null;
}

/**
 * metaphysical-config-updated が運んでくる中身。出し手によって
 * camelCase と snake_case が混在しているので、読む側は両方を見る。
 */
type ConfigUpdateDetail = Partial<{
  targetDate: string;
  target_date: string;
  useClassicalBoard: boolean;
  use_classical_board: boolean;
  directionFilterMode: string;
  direction_filter_mode: string;
  actionIntent: string;
  action_intent: string;
  birthDate: string;
  birth_date: string;
  birthLat: number;
  birth_lat: number;
  birthLon: number;
  birth_lon: number;
  baseLat: number;
  base_lat: number;
  baseLon: number;
  base_lon: number;
}>;

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
  } catch {}
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
import { directionUnstableNote } from "@/lib/directionDistance";
import {
  buildScanCounts,
  type ScanCountsInput,
} from "@/lib/arbitrageCounts";
import { compareKigakuThenRent, kigakuRank } from "@/lib/arbitrageRanking";
import { addFavorite, loadFavorites, removeFavorite } from "@/lib/favorites";
import {
  DEFAULT_SEARCH_AREA,
  OVERVIEW_CENTER,
  initialViewBounds,
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
/**
 * 間取りの選択肢。
 *
 * 値は utils/smartSearch の normalizeLayout が返す形と揃える。スマート
 * 検索に「2LDK」と打った場合と、ここを押した場合で結果が変わってはいけない。
 *
 * 絞り込みは layout の部分一致（"2LDK".includes(選択値)）なので、
 * **S 付き（2SLDK など）はここでは拾えない。**拾うには一致の規則を
 * 変えることになり、既に出ている結果の意味が変わる。今回は入口を足す
 * だけにして、S 付きはスマート検索で「2SLDK」と打つ経路を残す。
 */
const LAYOUT_OPTIONS: { value: string; label: string }[] = [
  { value: "1R", label: "ワンルーム" },
  { value: "1K", label: "1K" },
  { value: "1DK", label: "1DK" },
  { value: "1LDK", label: "1LDK" },
  { value: "2K", label: "2K" },
  { value: "2DK", label: "2DK" },
  { value: "2LDK", label: "2LDK" },
  { value: "3DK", label: "3DK" },
  { value: "3LDK", label: "3LDK" },
  { value: "4LDK", label: "4LDK" },
];

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
      <div className="w-full h-full bg-gray-100 dark:bg-stone-100 flex items-center justify-center font-mono text-xs text-stone-600">
        マップを読み込み中...
      </div>
    ),
  },
);

export default function ArbitrageScannerPage() {
  const [data, setData] = useState<ScoredProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isTransitioningDate, setIsTransitioningDate] = useState(false);
  const [metadata, setMetadata] = useState<ScanMetadata | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  /**
   * 走査の件数。「何件見つかって、そのうち何件を評価したか」。
   *
   * 出ていたのは「物件リスト (N件中、表示範囲内)」だけで、この N は
   * 取得した窓（上限 500 件）を並べ替えたあとの数。全国で走査しても
   * 500 としか出ないので、条件を緩めるべきかどうかが読めなかった。
   */
  const scanCounts = useMemo(() => buildScanCounts(metadata), [metadata]);

  // Sidebar & Layout views states
  const [showListView, setShowListView] = useState(false);
  /*
    スマホの表示切り替え（地図 / 一覧・条件）。**lg 未満だけで効く。**

    スマホでは絞り込み・設定・一覧の入った列が地図の上に積まれ、
    **長くスクロールしないと地図に着かなかった**（利用者の実機）。
    TERIYAKI Archive の「店舗 / 地図」タブと同じ形で、1 度に 1 つだけ
    出す。既定は地図（この頁の主役）。

    lg 以上は従来どおり 2 列を同時に出す。横並びは「余った幅がそのまま
    地図の描画面積になる」ためにこの頁を 2560px にしている理由そのもの
    なので（CLAUDE.md 3 節）、崩さない。
  */
  const [mobilePane, setMobilePane] = useState<"map" | "list">("map");
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
  /**
   * 出生地の座標。**既定値を置かない。**
   *
   * 以前は運営者の出生地が入っていた。
   * 天体ライン（SUN / VENUS / JUPITER_LINE）は出生日時と出生地から
   * 決まるので、一度も入力していない人にも他人の出生地で計算した加点が
   * 乗っていた。生年月日を空にした #202 の片割れで、こちらが残っていた。
   *
   * API 側（/api/rentals/arbitrage）は birthLat が数値でなければ null に
   * 落として天体ラインを計算しない。空文字を送れば正しく止まる。
   */
  const [birthLat, setBirthLat] = useState("");
  const [birthLon, setBirthLon] = useState("");
  /**
   * 生年月日。**既定値を置かない。**
   *
   * 以前は運営者の生年月日が入っていた。本命殺・
   * 本命的殺・天中殺はここから決まるので、一度も入力していない人にも
   * 他人の命式で計算した判定が出ていた（本番で実測）。
   *
   * 未入力を検知する仕組み（kigakuUnavailableReason）は !birthDate を
   * 見ているが、既定値があるせいで永久に発火しなかった。出発地の座標を
   * 空のままにしているのと同じ理由で、ここも空にする。
   */
  const [birthDate, setBirthDate] = useState("");
  const [targetDate, setTargetDate] = useState(getTodayString()); // Default Target Date
  const [directionFilterMode, setDirectionFilterMode] =
    useState<DirectionFilterMode>("composite");
  const [actionIntent, setActionIntent] = useState("MIGRATION");
  const [radiusKm, setRadiusKm] = useState(
    filtersForSearchArea(DEFAULT_SEARCH_AREA).radiusKm,
  ); // Scan Radius (km)
  /**
   * 賃貸（いま契約できる物件のスキャン）か、購入（国交省の成約相場）か。
   * 購入は物件一覧ではなく相場の表示なので、スキャンの状態には触らない。
   */
  const [listingType, setListingType] = useState<"rent" | "buy">("rent");
  const [prefecture, setPrefecture] = useState("all"); // Target Prefecture
  // 既定は古典（一般的な九星気学）。理由は下の読み込み処理のコメントに書いた。
  const [useClassical, setUseClassical] = useState(true);
  const [layerMode, setLayerMode] = useState("year");
  const [useTrueNorth, setUseTrueNorth] = useState(false);
  const [lunarPhaseModifier, setLunarPhaseModifier] = useState(true);
  /** 一覧 API に渡す取得上限。変える手段が画面に無いので定数。 */
  const dataLimit = 500;
  const [mapCenter, setMapCenter] = useState<[number, number]>([38.0, 137.0]); // Default to Japan center
  /**
   * mapCenter の意味。area=検索の起点（半径ぶんのズームで表示）、
   * spot=個別の物件（zoom 13 で寄る）。地図側の FocusController が
   * この区別でズームを決める。物件クリック以外は常に area。
   */
  const [mapFocusKind, setMapFocusKind] = useState<"area" | "spot">("area");

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
    targetDate,
    mapBounds,
  });

  // Temporary local inputs to avoid API hammering during typing
  const [localLat, setLocalLat] = useState("");
  const [localLon, setLocalLon] = useState("");
  const [showBaseMapPicker, setShowBaseMapPicker] = useState(false);
  const [localBirthDate, setLocalBirthDate] = useState("");
  const [localBirthLat, setLocalBirthLat] = useState("");
  const [localBirthLon, setLocalBirthLon] = useState("");
  const [showBirthMapPicker, setShowBirthMapPicker] = useState(false);

  /**
   * 同行者がいるときの内訳。
   *
   * 合成した 1 つの点だけでは「誰にとって良いのか」「誰が引っかかって
   * いるのか」が消える。合流の判断はそこが要なので、人ごとの方位と
   * 判定、そして全員で動ける直近の日をそのまま出す。
   */
  const renderPartyBreakdown = (item: ScoredProperty) => {
    if (!hasParty || !item.party?.members?.length) return null;
    const members = item.party.members;

    return (
      <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-stone-200 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-stone-500">
            全員の方位
          </span>
          {item.party.harmony !== null && (
            <span
              className="text-[9px] font-mono text-stone-600"
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
                <span className="ml-1 text-stone-600">(移動なし)</span>
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
                <span className="text-stone-600">
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
                    (b) =>
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
  // 吉凶要因バッジの描画

  // 全体ロード時のカード型スケルトン

  // Pagination & Filtering state
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  /**
   * 方位で絞る。吉日カレンダーから「この日にこの方位へ」と渡ってくる導線で使う。
   * 方位が決まってから物件を見るとき、他の方位が混ざっていると選べない。
   */
  const [filterDirection, setFilterDirection] = useState("ALL");
  const [filterMaxRent, setFilterMaxRent] = useState<string>("");
  /**
   * 築年数上限。**既定は空（制限なし）。**
   *
   * 以前は "5" が入っていた。件数を最も強く絞る条件がこれで、初めて
   * 開いた人には「この地域にはこれだけしか無い」と見える。使い方
   * ガイドにも「結果が少ないと感じたら築年数上限を空にする（いちばん
   * 効きます）」と書いてあり、既定が絞り込みになっているのが実態と
   * 合っていなかった。絞るかどうかは利用者が決める。
   */
  const [filterMaxAge, setFilterMaxAge] = useState<string>("");
  const [filterMaxStation, setFilterMaxStation] = useState<string>("");
  const [filterMinSize, setFilterMinSize] = useState<string>("");
  // 間取り。スマート検索から入る。手で選ぶ UI は無い（チップで外せる）
  const [filterLayouts, setFilterLayouts] = useState<string[]>([]);
  // 凶（NOISE 系）を除外。「吉方位のみ」の解釈先
  const [filterLuckyOnly, setFilterLuckyOnly] = useState(false);
  /**
   * お気に入りに入れた物件の id。
   *
   * 保存先（ログイン中はクラウド、未ログインは端末）は lib/favorites に
   * 隠してある。ここは「今どれが入っているか」だけを持つ。
   */
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  /** お気に入りだけに絞る。 */
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);
  // スマート検索の入力と、LLM 解釈の実行中表示
  const [smartQuery, setSmartQuery] = useState("");
  const [smartBusy, setSmartBusy] = useState(false);
  // 詳細パネルに出している物件。カード・表・TOP5 のクリックで入る
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 評価軸・重み・総合スコアは廃止した（利用者の指示）。並びは
  // 「吉凶の段階 → 家賃の安い順」（lib/arbitrageRanking）で決まる。
  // 候補を DB から切り出すときの角度。絞り込みだけでは 500 件の窓に
  // 何を入れるかが決まらないため、これは軸ではなく窓の切り方として残す。
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

  /*
    引っ越し時期のスクリーニングは /relocation/timing へ移管した。

    同じ走査（/api/relocation/auspicious-days の ranked）がこの画面と
    /relocation/timing の両方に実装されていて、二重保守になっていた。
    受け渡しは前からある URL（?targetDate=…&view=overview&direction=…）を
    使う。時期の頁で日を選ぶとこの画面がその日付・方位で開くので、
    「いつ動けるかを先に見る → その日の物件を見る」の流れは変わらない。
  */

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

  // Sorting state
  type SortColumn = "kigaku" | "astrology" | "rent" | "distance";
  interface SortConfig {
    key: SortColumn;
    direction: "desc" | "asc";
  }
  /**
   * 既定は「吉凶の段階 → 家賃の安い順」。
   *
   * 以前は総合スコア（11 軸の加重平均）の高い順だった。評価軸と重みは
   * 廃止の方針（利用者の指示）なので、並びの一義は方位の吉凶に戻す。
   * kigaku の desc は「良い段階が上」の意味。
   */
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([
    { key: "kigaku", direction: "desc" },
    { key: "rent", direction: "asc" },
  ]);

  // 抽出戦略・同行者などは端末に残す。毎回選び直すのは実用的でない。
  // 鍵の名前は変えない。変えると他の項目（同行者・天中殺の扱い）まで
  // 巻き添えで初期化される。重みの保存値（weightPresetId 等）は
  // 読まなくなったので、次の保存で自然に消える。
  const AXIS_PREFS_KEY = "arb_axis_prefs_v1";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AXIS_PREFS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
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
    // 出生地も同じ扱い。運営者の出生地が入っていた。
    let bLat = "";
    let bLon = "";
    let bDate = "";
    // 時期分析から「この日の判定で塗られた地図を見たい」と来たときだけ
    // 俯瞰で開く。県別の色分けは zoom < 10 でしか描かれないため。
    let openOverview = false;
    let tDate = getTodayString();
    let rKm = filtersForSearchArea(DEFAULT_SEARCH_AREA).radiusKm;
    let pref = "all";
    // 何も保存されていないときは古典（一般的な九星気学）で始める。
    //
    // MetaphysicalConfigBar の既定も古典で、/houi の表も古典。ここだけ
    // 独自モデルで始まると、バーがマウント時に古典を押し込んで一瞬で
    // 判定が変わる（走査もやり直しになる）。公開している記事と同じ基準に
    // 揃えておく。保存済みの設定がある人はそちらが優先される。
    let classical = true;
    let layer = "year";
    let trueNorth = false;

    // Load from unified tactical config
    const tacticalConfig = localStorage.getItem("tactical_config_v1");
    /* ここも設定ファイル由来の素通しだった。知らない値は composite（#540）。 */
    let filter: DirectionFilterMode = "composite";
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
          filter = parseDirectionFilterMode(config.direction_filter_mode);
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
      } catch {}
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
      // 時期分析（/relocation/timing）からの受け渡し。
      //
      // 県別の色分けは俯瞰（zoom < 10）でしか描かれない。既定の初期表示は
      // 出発地へズームインするため、日付だけ引き継いで飛んでくると
      // 「その日の判定で塗られた地図」が見えないまま物件ピンだけが出る。
      // 意図して俯瞰で開くための指定を受ける。
      if (qs.get("view") === "overview") {
        openOverview = true;
      }
      const qDir = qs.get("direction");
      if (qDir && ALL_DIRECTIONS.some((d) => d === qDir)) {
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
    if (openOverview) {
      // 中心を OVERVIEW_CENTER に置くと isNationwideOverview が真になり、
      // AutoFitBounds が俯瞰のズームへ寄せる。県別の色分けが見える。
      setMapFocusKind("area");
      setMapCenter(OVERVIEW_CENTER);
      setPrefecture("all");
      setRadiusKm("all");
    } else if (bsLat !== "" && bsLon !== "") {
      const lat0 = parseFloat(bsLat);
      const lon0 = parseFloat(bsLon);
      setMapFocusKind("area");
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
    if (!openOverview) {
      setRadiusKm(rKm);
      setPrefecture(pref);
    }
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
          setMapFocusKind("area");
          setMapCenter([lat, lon]);
          localStorage.setItem("arb_baseLat", String(lat));
          localStorage.setItem("arb_baseLon", String(lon));
        } catch {
          /* 取得できなくても入力欄から設定できる */
        }
      })();
    }

    const handleGlobalConfigUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<ConfigUpdateDetail>;
      if (customEvent.detail) {
        const detail = customEvent.detail;

        const newTargetDate = detail.targetDate || detail.target_date;
        const newUseClassical =
          detail.useClassicalBoard !== undefined
            ? detail.useClassicalBoard
            : detail.use_classical_board;
        /* 保存済みプランの値は素の JSON。知らない値は composite（#540）。 */
        const newFilterMode = parseDirectionFilterMode(
          detail.directionFilterMode || detail.direction_filter_mode,
        );
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
          setMapFocusKind("area");
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

  /**
   * 走らせたスキャンの通し番号。**最新でない応答は捨てる。**
   *
   * スキャンは本番で数秒かかる。地図を続けて動かすと要求が重なり、
   * 遅い古い応答が新しい結果を上書きして「動かしたのに前の結果に
   * 戻る」が起きる（順序の保証が無かった）。wealth の
   * fetchRequestIdRef と同じ形。
   */
  const fetchSeqRef = useRef(0);

  const fetchData = async (isDateChange = false) => {
    if (!initialLoaded) return;
    const seq = ++fetchSeqRef.current;
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
      lastFetchedBoundsRef.current = mapBounds;
      const res = await fetch(`/api/rentals/arbitrage?${params.toString()}`);
      /* この応答より新しいスキャンが既に走っているなら、ここで捨てる。
         読み込み表示も新しい方が管理しているので触らない。 */
      if (seq !== fetchSeqRef.current) return;
      if (res.ok) {
        const json = await res.json();
        if (seq !== fetchSeqRef.current) return;
        setData(json.properties || []);
        setMetadata(json.metadata || null);
        lastTotalCountRef.current =
          typeof json.metadata?.totalCount === "number"
            ? json.metadata.totalCount
            : null;
      } else {
        setData([]);
        setMetadata(null);
        setSearchError(
          "物件を取得できませんでした。条件を確認して、もう一度スキャンしてください。",
        );
      }
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      console.error(err);
      setData([]);
      setMetadata(null);
      setSearchError(
        "通信エラーで物件を取得できませんでした。接続を確認して、もう一度スキャンしてください。",
      );
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
        setIsTransitioningDate(false);
      }
    }
  };

  const handleDateChange = (newDateStr: string) => {
    setTargetDate(newDateStr);
    setLocalDateChange(newDateStr);
  };

  const setLocalDateChange = (newDateStr: string) => {
    setTargetDate(newDateStr);
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
  /** 地図の移動だけの取り直しを 1 回にまとめる待ち時間。 */
  const boundsFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 最後にスキャンを投げたときの表示範囲と、その応答の総件数。
   *
   * 表示範囲は**追加の絞り込み**としてサーバに送るだけなので、
   * 前回の範囲に今の範囲が収まっていて、かつ前回が上限（limit）に
   * 当たっていなければ、手元のデータで足りている——取り直しは要らない。
   * 上限に当たっていた場合は、狭めるほど濃い標本が取れるので取り直す。
   */
  const lastFetchedBoundsRef = useRef<typeof mapBounds>(null);
  const lastTotalCountRef = useRef<number | null>(null);
  /**
   * 一度でもスキャンを出したか。値が何も変わらないまま effect が
   * 走り直したときの**同一パラメータの重複要求**を止める
   * （初期表示で同じ要求が 200ms 差で 2 回出ていた。実測）。
   * 初回だけは「何も変わっていない」状態から出す必要があるので分ける。
   */
  const hasFetchedOnceRef = useRef(false);
  useEffect(
    () => () => {
      if (boundsFetchTimer.current) clearTimeout(boundsFetchTimer.current);
    },
    [],
  );

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
      prev.involuntaryMove !== involuntaryMove;
    const boundsChanged =
      JSON.stringify(prev.mapBounds) !== JSON.stringify(mapBounds);
    const targetDateChanged = prev.targetDate !== targetDate;

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
      targetDate,
      mapBounds,
    };

    /*
      地図の表示範囲**だけ**が変わった取り直しは 500ms 待って 1 回に
      まとめる。moveend / zoomend のたびに即スキャンを投げていたため、
      連続パンやホイールズームで要求が数珠つなぎになり、さらに全画面
      切り替え（#600）とスマホのタブ切り替え（#605）は invalidateSize が
      moveend を出すので**押すたびにスキャンが走っていた**。スキャンは
      本番で数秒かかるので、これがそのまま「地図が遅い」になる
      （実測: 30 秒の操作でスキャン 8 回 → まとめて 5 回）。
      条件や日付が変わったときは今までどおり即時。
    */
    if (boundsChanged && !isOtherChanged && !targetDateChanged) {
      /*
        今の範囲が前回スキャンした範囲に収まっていて、前回が上限に
        当たっていなければ、手元のデータで足りている。小さなパンや
        ズームイン、全画面の戻しで毎回スキャンし直さない。
      */
      const last = lastFetchedBoundsRef.current;
      const lastTotal = lastTotalCountRef.current;
      if (
        last &&
        mapBounds &&
        lastTotal !== null &&
        lastTotal <= dataLimit &&
        mapBounds.zoom >= 10 === last.zoom >= 10 &&
        mapBounds.minLat >= last.minLat &&
        mapBounds.maxLat <= last.maxLat &&
        mapBounds.minLon >= last.minLon &&
        mapBounds.maxLon <= last.maxLon
      ) {
        return;
      }
      if (boundsFetchTimer.current) clearTimeout(boundsFetchTimer.current);
      hasFetchedOnceRef.current = true;
      boundsFetchTimer.current = setTimeout(() => fetchData(true), 500);
      return;
    }
    /* 値が 1 つも変わっていないのに effect が走り直しただけなら出さない
       （state の参照だけが入れ替わる再実行がある）。初回だけは出す。 */
    if (
      !isOtherChanged &&
      !targetDateChanged &&
      !boundsChanged &&
      hasFetchedOnceRef.current
    ) {
      return;
    }
    /*
      条件の変更も 100ms だけ待ってまとめる。初期化は複数の effect が
      連鎖して条件を順に確定させるため、即時に出すと**途中の条件での
      スキャンが挟まる**（実測: actionIntent が MIGRATION → DEFAULT と
      変わる 70ms の間に同じ範囲へ 2 回投げていた）。100ms は人には
      知覚されず、確定後の条件 1 回だけが出る。
    */
    if (boundsFetchTimer.current) clearTimeout(boundsFetchTimer.current);
    hasFetchedOnceRef.current = true;
    const isDateChange = !isOtherChanged;
    boundsFetchTimer.current = setTimeout(() => fetchData(isDateChange), 100);
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

  const saveUnifiedConfig = async (updatedFields: Settings) => {
    try {
      const localData = localStorage.getItem("tactical_config_v1");
      let currentLocal: Settings = {};
      if (localData) {
        try {
          currentLocal = JSON.parse(localData);
        } catch {}
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

    setMapFocusKind("area");
    setMapCenter(nextCenter);
    saveUnifiedConfig({
      prefecture: nextFilters.prefecture,
      radius_km: nextFilters.radiusKm,
    });
  };

  // Sync toggles instantly

  const handleTrueNorthToggle = (val: boolean) => {
    setUseTrueNorth(val);
    localStorage.setItem("arb_useTrueNorth", val.toString());
    saveUnifiedConfig({ use_true_north: val });
  };

  const handleLayerModeChange = (val: string) => {
    setLayerMode(val);
    localStorage.setItem("arb_layerMode", val);
    saveUnifiedConfig({ layer_mode: val });
  };

  // Geolocation trigger

  // Filters logic
  const handleFilterNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterName(e.target.value);
  };

  const handleFilterStatusChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    setFilterStatus(e.target.value);
  };

  // 総合スコアの合成は廃止した。API の行をそのまま使う。
  const safeData = data.filter((d) => d.astrologyScore >= 0);

  /**
   * 現在読み込んでいる物件の方位別件数。時期スクリーニングで
   * 「その方位に動くと、いま何件の候補があるか」を添えるために使う。
   * 方位フィルター適用前の集合で数える（適用後だと選んだ方位以外が
   * 常に 0 件に見えてしまう）。
   */
  const directionPropertyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of safeData) {
      if (d.direction) counts[d.direction] = (counts[d.direction] ?? 0) + 1;
    }
    return counts;
  }, [safeData]);

  /**
   * 方位の吉凶を出せる条件。
   *
   * 以前はこの条件が dayKigaku の中にだけあり、満たさないと地図の県塗りが
   * 「方位の吉凶」から「掲載件数」へ無言で切り替わっていた。どちらも同じ
   * 県を色で塗るので、利用者には件数の色が吉凶に見える。
   *
   * 条件をここに 1 つ置いて、判定と凡例の両方がこれを見る。2 か所に書くと
   * 条件を足したときに凡例だけが古くなる。
   */
  const canJudgeDirections = Boolean(
    hasBaseLocation && birthDate && targetDate,
  );

  /** 出せない理由。地図の凡例にそのまま出す。 */
  const kigakuUnavailableReason = useMemo(() => {
    if (canJudgeDirections) return undefined;
    const missing: string[] = [];
    if (!hasBaseLocation) missing.push("出発地");
    if (!birthDate) missing.push("生年月日");
    if (!targetDate) missing.push("対象日");
    return `${missing.join("と")}を入れると方位の吉凶で塗り分けます`;
  }, [canJudgeDirections, hasBaseLocation, birthDate, targetDate]);

  /**
   * 選択日の盤を 1 回だけ組み、方位別と県別の両方を切り出す。
   *
   * ここが「その日・その方位が動けるか」の唯一の情報源。地図の扇形、
   * 俯瞰の県塗り、時期パネルの「選択日」列がすべてこの結果を読む。
   *
   * 以前は地図の扇形だけが別経路だった。扇形は物件の astrologyStatus の
   * 多数決で塗っていて、その status はサーバが layerMode（既定は年盤）
   * だけで出した単盤の判定だった。三盤で見ると凶の方位が、年盤だけ吉
   * なら緑に塗られる——実際「今日は南が緑なのにセルは北西が S」という
   * 食い違いになって出た。物件が 1 件も無い方位が既定の SAFE=通常吉と
   * して緑寄りに出る問題も同じ経路。判定は盤から引き、物件からは引かない。
   *
   * 暦の判定は決定的な計算（実測 4ms/日）なのでクライアントで直接行い、
   * 日付チップを選んだ瞬間に地図が塗り替わる。
   * 本命星は時期スクリーニングと同じく classical を使う。
   */
  const dayKigaku = useMemo(() => {
    if (!canJudgeDirections) return undefined;
    try {
      const bd = new Date(
        birthDate.includes("T") ? birthDate : `${birthDate}T12:00:00+09:00`,
      );
      if (isNaN(bd.getTime())) return undefined;
      const honmei = getHonmeiStar(bd);
      const all = judgeDayAllDirections(
        new Date(`${targetDate}T12:00:00+09:00`),
        {
          honmeiStar: honmei.classical,
          voidZodiacs: getPersonalVoidZodiac(bd),
          lon: Number(baseLon),
          tenchusatsuMode: tenchusatsuMode as never,
          involuntaryMove,
          directionFilterMode,
        },
      );
      type Cell = {
        direction: string;
        directionLabel: string;
        tier: string;
        blocked: boolean;
        doyouSatsu: boolean;
      };
      const byDirection: Record<string, Cell> = {};
      for (const dir of ALL_DIRECTIONS) {
        const v = all[dir];
        if (!v) continue;
        byDirection[dir] = {
          direction: dir,
          directionLabel: DIRECTION_LABELS[dir] ?? dir,
          tier: gradeVerdict(v),
          blocked: v.blockedByTenchusatsu,
          // 段階だけだと「五大凶殺あり」に見えるが、土用殺は五大凶殺では
          // ない。理由を落とさずに渡す（SpotVerdict が 1 行で出す）。
          doyouSatsu: v.isDoyouSatsu,
        };
      }
      /* 県の代表点は巡回起点（概ね県庁所在地）ではなく面積重心
         （lib/prefectureDirection）。県庁は県の端にあることが多く、
         兵庫（神戸=南東端）が京都から「南西」に塗られていた
         （利用者報告 2026-08-27。__tests__/prefectureDirection で固定）。 */
      const prefDirs = prefectureDirections(
        Number(baseLat),
        Number(baseLon),
        useClassical ? "traditional" : "physical",
      );
      const byPrefecture: Record<string, Cell> = {};
      for (const [name, dir] of Object.entries(prefDirs)) {
        const cell = byDirection[dir];
        if (!cell) continue;
        byPrefecture[name] = cell;
      }
      return { byDirection, byPrefecture };
    } catch {
      return undefined;
    }
  }, [
    canJudgeDirections,
    birthDate,
    targetDate,
    baseLat,
    baseLon,
    tenchusatsuMode,
    involuntaryMove,
    directionFilterMode,
    useClassical,
  ]);

  /**
   * 方位ごとの「その日の段階」と「いま出ている物件数」。
   *
   * 一覧は吉凶と家賃の順に並ぶので、「どっちへ動くか」を決める
   * ための全体像が出ていなかった。段階は方位ごとに 1 つなので、方位を
   * 1 行にして件数と段階を並べれば「南東に S が 12 件」が読める。
   *
   * 物件が 1 件も無い方位も残す。「そこには無い」も判断材料になる。
   */
  const directionTierRows = useMemo(() => {
    if (!dayKigaku) return [];
    return Object.values(dayKigaku.byDirection).map((cell) => ({
      direction: cell.direction,
      directionLabel: cell.directionLabel,
      tier: cell.tier,
      blocked: cell.blocked,
      count: directionPropertyCounts[cell.direction] ?? 0,
    }));
  }, [dayKigaku, directionPropertyCounts]);

  // お気に入りは開いたときに一度だけ読む。物件の再スキャンでは変わらない。
  useEffect(() => {
    let alive = true;
    loadFavorites().then(({ ids }) => {
      if (alive) setFavoriteIds(ids);
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * ★ の出し入れ。
   *
   * 画面の状態を先に変えて、保存はそのあとで追う。押した瞬間に色が
   * 変わらないと、効いたのかどうか分からない。保存が失敗しても
   * lib/favorites が端末には残すので、次に開いたときにも出る。
   */
  const toggleFavorite = (propertyId: string) => {
    const wasFavorite = favoriteIds.includes(propertyId);
    setFavoriteIds((prev) =>
      wasFavorite
        ? prev.filter((id) => id !== propertyId)
        : [propertyId, ...prev],
    );
    void (wasFavorite ? removeFavorite : addFavorite)(propertyId);
  };

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

    if (filterMaxAge) {
      const maxAge = Number(filterMaxAge);
      if (
        d.building_age === null ||
        d.building_age === undefined ||
        d.building_age > maxAge
      )
        return false;
    }

    if (filterFavoritesOnly && !favoriteIds.includes(d.id)) return false;

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

    // 一致の規則は lib/layoutMatch の 1 か所。県別の件数へ送る値も
    // 同じところで広げる。片方だけ広げると件数と一覧が食い違う。
    if (!matchesLayoutSelection(d.layout, filterLayouts)) return false;

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

  /**
   * 並べ替えで下に送る度合い。0=送らない、1=軽い凶、2=五大凶殺・天中殺。
   *
   * 盤が組めるときは、ピン・扇形と同じ三盤の段階で決める。以前は
   * サーバの単盤 status で沈めていたので、「赤いピンなのに上位に居る」
   * 「緑のピンなのに沈んでいる」が起き得た。色と順位は同じ物差しで。
   */
  /**
   * 並び順に使う吉凶の重み。段階（S〜X）と天中殺は選択日の盤
   * （dayKigaku）から引く。ピン・扇形・県塗りと同じ唯一の情報源。
   * 盤が組めないとき（生年月日未入力など）は全件が同順位になり、
   * 並びは次の鍵（家賃）で決まる。
   */
  const kigakuRankOf = (direction: string | null): number =>
    kigakuRank(direction ? dayKigaku?.byDirection[direction] : undefined);

  const avoidRank = (p: {
    direction: string | null;
    // 生年月日が未入力のとき、API は判定を返さない（#205）。
    astrologyStatus: string | null;
  }): number => {
    const k = p.direction ? dayKigaku?.byDirection[p.direction] : undefined;
    if (k) {
      if (k.blocked || k.tier === "X") return 2;
      if (k.tier === "D") return 1;
      return 0;
    }
    return isAvoidAstrologyStatus(p.astrologyStatus ?? "") ? 2 : 0;
  };

  const sortedTableData = [...filteredData].sort((a, b) => {
    // 避けるべき方位・期間のものは、どれだけ条件が良くても上には出さない。
    // 並べ替えを家賃や距離に変えても、凶方位が上に混ざらないよう順位で担保する。
    if (sinkAvoidStatus) {
      const r = avoidRank(a) - avoidRank(b);
      if (r !== 0) return r;
    }

    for (const config of sortConfigs) {
      let result = 0;
      const key = config.key;
      if (key === "kigaku")
        // 小さい順位が上。desc（既定）でそのまま「良い段階が上」になる。
        result = kigakuRankOf(a.direction) - kigakuRankOf(b.direction);
      else if (key === "astrology")
        result = b.astrologyScore - a.astrologyScore;
      else if (key === "rent") result = b.totalRent - a.totalRent;
      else if (key === "distance")
        result = (a.distanceKm || 0) - (b.distanceKm || 0);

      if (result !== 0) {
        return config.direction === "desc" ? result : -result;
      }
    }
    return 0;
  });

  /**
   * 「掘り出し物件 TOP 5」の中身。
   *
   * 一覧の既定と同じ「吉凶の段階 → 家賃の安い順」で選ぶ。以前は
   * 総合スコア順だったが、評価軸の廃止で並びの物差しを揃えた。
   *
   * 表の並べ替えには追従させない。家賃順に並べ替えたときにここまで家賃順に
   * なると、パネルの見出しと中身が食い違う。
   */
  const topArbitrage = [...filteredData]
    .sort((a, b) => {
      // 表と同じく、避けるべき方位・期間のものは上に出さない。
      if (sinkAvoidStatus) {
        const r = avoidRank(a) - avoidRank(b);
        if (r !== 0) return r;
      }
      // 一覧の既定と同じ「吉凶の段階 → 家賃の安い順」。以前は総合スコア
      // 順だったが、評価軸の廃止（利用者の指示）で並びの物差しを揃えた。
      return compareKigakuThenRent(
        { kigakuRank: kigakuRankOf(a.direction), totalRent: a.totalRent },
        { kigakuRank: kigakuRankOf(b.direction), totalRent: b.totalRent },
      );
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
    if (filterMaxAge !== "") count++;
    if (filterDirection !== "ALL") count++;
    if (filterMaxStation !== "") count++;
    if (filterMinSize !== "") count++;
    if (filterLayouts.length > 0) count++;
    if (filterLuckyOnly) count++;
    if (filterFavoritesOnly) count++;
    return count;
  }, [
    filterLayouts,
    filterLuckyOnly,
    filterFavoritesOnly,
    filterName,
    filterStatus,
    filterMaxRent,
    filterMaxAge,
    filterDirection,
    filterMaxStation,
    filterMinSize,
  ]);

  /**
   * 全国俯瞰の県別件数を、いまの絞り込みで数え直す。
   *
   * 地図の県ラベルは src/data/prefecturesWithData.json（毎晩作る静的な
   * 値）を読んでおり、**絞り込みをどう変えても数字が動かなかった**。
   * 条件を足したあと「まだこの県にこれだけあるのか」を読み違える。
   *
   * 画面が持っている物件（最大 500 件・安い順）から数えるのでは代わりに
   * ならない。全国で 45 万行あるうちの 500 件なので、母数が県の実勢と
   * まるで違う。DB 側で数え直す口（/api/rentals/arbitrage/prefecture-counts）
   * を叩く。
   *
   * 送るのは SQL で表せる条件だけ。方位・吉凶・
   * お気に入りは出発地と生年月日から画面側で出す値で、DB の列に無い。
   * 反映していないことは地図の凡例に出す（prefCountsFiltered）。
   */
  const countableFilterQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (filterMaxRent) params.set("maxRentMan", filterMaxRent);
    if (filterMaxAge) params.set("maxBuildingAge", filterMaxAge);
    if (filterMaxStation) params.set("maxStationMin", filterMaxStation);
    if (filterMinSize) params.set("minSizeSqm", filterMinSize);
    // 広げた形（2LDK なら 2SLDK も）で送る。API 側の一致規則は変えない。
    if (filterLayouts.length > 0)
      params.set("layouts", expandLayoutSelections(filterLayouts).join(","));
    return params.toString();
  }, [
    filterMaxRent,
    filterMaxAge,
    filterMaxStation,
    filterMinSize,
    filterLayouts,
  ]);

  /**
   * 地図でクリックされた地点。「この地点を調べる」へ送る。
   *
   * seq は「同じ場所をもう一度押した」を区別するための連番。座標だけを
   * 見ていると、押し直しても値が変わらず何も起きない。
   */
  const [spotRequest, setSpotRequest] = useState<{
    lat: number;
    lon: number;
    seq: number;
  } | null>(null);

  /** 数え直した県別件数。null なら静的ファイルの値をそのまま使う。 */
  const [livePrefCounts, setLivePrefCounts] = useState<Record<
    string,
    number
  > | null>(null);

  /**
   * 家賃の分布（総家賃・1万円刻み）。家賃上限を打つ前に「いくつに
   * すれば何件残るか」を見せるための棒グラフの中身。
   *
   * **家賃上限そのものは分布の条件に入れない。**入れると上限より右の
   * 棒が全部 0 になり、上限を上げたら何件増えるかが見えなくなる。
   * それ以外の絞り込み（間取り・築年・徒歩・広さ）と地図の表示範囲は
   * 反映する。見えている範囲の分布でないと、上限を決める材料にならない。
   */
  const [rentBuckets, setRentBuckets] = useState<
    { fromYen: number; toYen: number | null; count: number }[] | null
  >(null);

  const rentHistogramQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (filterMaxAge) params.set("maxBuildingAge", filterMaxAge);
    if (filterMaxStation) params.set("maxStationMin", filterMaxStation);
    if (filterMinSize) params.set("minSizeSqm", filterMinSize);
    if (filterLayouts.length > 0)
      params.set("layouts", expandLayoutSelections(filterLayouts).join(","));
    // 範囲は必須。API も範囲なしは 400 で断る。
    if (!mapBounds) return "";
    params.set("minLat", String(mapBounds.minLat));
    params.set("maxLat", String(mapBounds.maxLat));
    params.set("minLon", String(mapBounds.minLon));
    params.set("maxLon", String(mapBounds.maxLon));
    return params.toString();
  }, [filterMaxAge, filterMaxStation, filterMinSize, filterLayouts, mapBounds]);

  useEffect(() => {
    /*
      **地図が範囲を報告するまで叩かない。**

      最初にこれを入れたとき（#319）は無条件に叩いており、ページを
      開いた瞬間は mapBounds が null なので範囲なしで呼ばれていた。
      範囲が無いと WHERE に座標条件が付かず、全国 100 万行の全表集計に
      なる。それが毎回走って走査本体と食い合い、事故として取り消した
      （#320）。API 側も範囲なしを 400 で断るようにしたが、無駄な
      400 を投げないよう画面側でも止める。
    */
    if (!rentHistogramQuery) {
      setRentBuckets(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/rentals/arbitrage/rent-histogram?${rentHistogramQuery}`)
        .then((res) => res.json())
        .then((body) => {
          if (cancelled) return;
          setRentBuckets(body?.success ? body.data.buckets : null);
        })
        .catch(() => {
          if (!cancelled) setRentBuckets(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rentHistogramQuery]);

  /*
    「この範囲に掲載 N 件」（名寄せ前を viewport-count で数え直す）は
    廃止した。一覧の「候補のうち範囲内」（名寄せ後）と数え方が違い、
    同じ範囲で 2 つの数字が並んで断り書きで埋めていた。地図側が
    候補（名寄せ後）をその場で数えるようになったので、口も要らない。
  */
  useEffect(() => {
    // 絞り込みが空なら静的な値に戻す。同じ数字を数え直す意味が無い。
    if (!countableFilterQuery) {
      setLivePrefCounts(null);
      return;
    }
    let cancelled = false;
    // 入力のたびに叩かない。チップを続けて押すと 1 回にまとまる。
    const timer = setTimeout(() => {
      fetch(`/api/rentals/arbitrage/prefecture-counts?${countableFilterQuery}`)
        .then((res) => res.json())
        .then((body) => {
          if (cancelled) return;
          // 数え直せなかったときは静的な値に戻す。前の条件の数字を
          // 残すと、条件と数字が食い違ったまま画面に出る。
          setLivePrefCounts(body?.success ? body.data.counts : null);
        })
        .catch(() => {
          if (!cancelled) setLivePrefCounts(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [countableFilterQuery]);

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

  /**
   * 物件の詳細。カード・表・TOP5・地図のピンから開く。
   *
   * 以前はサイドバーの最上部に固定で出していた。絞込画面では TOP 5 が
   * 一番下にあるので、そこから選ぶと詳細は画面外の上に出てしまい、
   * 押しても何も起きていないように見えた（利用者からの指摘）。
   *
   * 出す場所を画面ごとに変える。中身は 1 つだけ持つ。
   *
   *   絞込画面  TOP 5 のすぐ下（押した場所の続きに出る）
   *   一覧画面  最上部（カード・表がその下に続く）
   */
  const propertyDetailPanel = selectedProperty && (
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
        {/* お気に入り。閉じるボタンの隣に置く。物件名のすぐ横だと、
            名前が長いときに折り返しの位置で動いて押しにくい。 */}
        <FavoriteButton
          isFavorite={favoriteIds.includes(selectedProperty.id)}
          onToggle={() => toggleFavorite(selectedProperty.id)}
        />
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
        <span className="text-[9px] text-stone-600">
          管理費込み
          {selectedProperty.size_sqm
            ? ` / ㎡単価 ${Math.round(
                (selectedProperty.totalRent || 0) /
                  Number(selectedProperty.size_sqm),
              ).toLocaleString()}円`
            : ""}
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
          ["掲載", `${selectedProperty.axisInputs?.listingCount ?? 1}社`],
        ].map(([k, v]) => (
          <div key={k as string} className="bg-white dark:bg-stone-50 py-1.5">
            <div className="text-[10px] text-stone-600">{k}</div>
            <div className="text-[11px] font-bold text-stone-800">{v}</div>
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
        {/*
          近すぎて方位が定まらないときは、そう書く。

          5km 未満だと、住所のジオコーディングの誤差（数百 m）の
          ほうが方位を決めてしまう。判定は今までどおり出すが、
          「どれだけ当てになるか」を添えないと、同じ市内の物件で
          方位だけが違って並ぶ理由が読めない。

          文言と閾値は lib/directionDistance の 1 か所から引く。
          シミュレータ（#176・#181）が既に同じ注意を出しており、
          画面ごとに違う数字を書くと食い違う。
        */}
        {typeof selectedProperty.distanceKm === "number" &&
          directionUnstableNote(selectedProperty.distanceKm) && (
            <p className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[9px] leading-relaxed text-amber-800">
              {directionUnstableNote(selectedProperty.distanceKm)}
            </p>
          )}
      </div>

      {/* 同行者の内訳。誰にとってどうか、いつなら全員で動けるか */}
      <div className="mx-3.5 mb-3">
        {renderPartyBreakdown(selectedProperty)}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 p-4 md:p-8 font-sans">
      {/* 上限は 1600px だった。地図と一覧を左右に並べる画面なので、余った幅は
          そのまま地図の描画面積と表の列幅になる。読み物の頁と違って行長が
          伸びすぎる心配も無い（左は札状の絞込、右は地図）。4K の 27 インチを
          縦置きすると幅が 2000px を超え、両端が数百 px ずつ空いていた。
          超ワイドで間延びしないよう上限自体は残し、WQHD の幅まで広げる。 */}
      <div className="max-w-[2560px] mx-auto space-y-6">
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
              今住んでいる場所から見た方位の吉凶と、同じ地域の家賃相場からの割安度をあわせて並べます。凶方位の物件は下に送ります。
            </p>

            {/* 走査の件数。「何件見つかって、そのうち何件を評価したか」。
                今まではどこにも出ておらず、全国で走査しても一覧の見出しは
                「500件中」としか言わなかった。条件を緩めるべきなのか、
                これで全部なのかが読めない。

                出すのは名寄せ後の件数（uniqueCount）。生の行数は同じ部屋の
                別の掲載も数えているので、件数として見せると開いたときに
                同じ建物が並ぶ。分からないときは数字を出さない（下の
                matched === null の枝）。 */}
            {!loading && scanCounts.analyzed > 0 && (
              <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {scanCounts.matched !== null && (
                  <span className="text-xs text-stone-600">
                    条件に一致
                    <b className="mx-1 font-mono text-lg text-stone-900">
                      {scanCounts.matched.toLocaleString()}
                    </b>
                    件
                  </span>
                )}
                <span className="text-[10px] text-stone-500">
                  {scanCounts.truncated
                    ? // 打ち切られている＝一覧の外にもっと良い物件が居るかも
                      // しれない。「全部見た上での順位」と読まれないよう断る。
                      `割安な順に上位 ${scanCounts.analyzed.toLocaleString()} 件を評価しています`
                    : `${scanCounts.analyzed.toLocaleString()} 件すべてを評価しています`}
                </span>
                {/* 減らした理由。黙って減らすと「昨日より少ない」の原因が
                    画面から追えない。0 のときは出さない。 */}
                {scanCounts.duplicatesHidden > 0 && (
                  <span className="text-[10px] text-stone-600">
                    同じ部屋の重複{" "}
                    {scanCounts.duplicatesHidden.toLocaleString()} 件をまとめ
                  </span>
                )}
                {scanCounts.staleHidden > 0 && (
                  <span className="text-[10px] text-stone-600">
                    {scanCounts.staleDays
                      ? `${scanCounts.staleDays}日以上見かけない `
                      : "掲載の切れた "}
                    {scanCounts.staleHidden.toLocaleString()} 件を除外
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
            {/* 物件データそのものの鮮度。「再スキャン」は算出のやり直しであって
                DB は更新されないため、取り込みがいつ回ったのかを別に示す。 */}
            {metadata?.dataUpdatedAt && (
              <span className="text-[10px] text-stone-500 font-mono leading-tight text-right">
                <span className="block text-stone-600">物件データ最終取込</span>
                {new Date(metadata.dataUpdatedAt).toLocaleString("ja-JP", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {/* 走査時間の内訳。「遅い」の報告を、Cloud Run のログを開かずに
                数字で受け取るための表示。DB は絞り込みの広さ、判定は
                走査日数と同行者の人数で決まる。ここに無い時間（通信・
                コールドスタート・描画）は体感との差として現れる。 */}
            {metadata?.timing && (
              <span
                className="text-[10px] text-stone-500 font-mono leading-tight text-right"
                title="サーバ側の走査時間。体感との差は通信・起動・描画のぶんです"
              >
                <span className="block text-stone-600">走査時間</span>
                DB {(metadata.timing.dbMs / 1000).toFixed(1)}s / 判定{" "}
                {(metadata.timing.computeMs / 1000).toFixed(1)}s
              </span>
            )}
            <button
              onClick={() => fetchData()}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
              再スキャン
            </button>
          </div>
        </div>

        {/*
          算出方法の切替（古典 / 独自モデル）と、対象日・判定の絞り込み・目的。

          2026-07-26 の 39d4bed（見た目を揃えるコミット）が、このバーごと
          落としていた。以来スキャナー本体から切替ができない状態が続いて
          いたが、/houi の記事は「このサイトのスキャナーには…独自モデルも
          用意しており、設定で切り替えられます」と書いている。記事の側が
          正しいので、バーを戻して仕様を合わせる。

          反映は 2 経路ある。このバーは保存時に metaphysical-config-updated
          を投げ、下の useEffect がそれを拾う。onConfigChange はマウント時
          （まだイベントは飛ばない）にも呼ばれるので、両方つないでおく。
        */}
        <MetaphysicalConfigBar
          onConfigChange={(newConfig) => {
            setTargetDate(newConfig.targetDate);
            setUseClassical(newConfig.useClassicalBoard);
            setDirectionFilterMode(newConfig.directionFilterMode);
            setActionIntent(newConfig.actionIntent);
          }}
        />

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
              吉方位は「今お住まいの場所から見てどの向きか」で決まります。出発地が未設定のままでは方位が定まらず、割安さだけの並びになってしまうため、スキャンを停止しています。左の「出発地座標」から現在のお住まいを指定してください。
            </p>
          </div>
        )}

        {/* スマホのタブ。lg 以上では出さない（2 列が常に見えている） */}
        <div className="lg:hidden sticky top-0 z-40 -mx-1 mb-3 flex gap-1 rounded-xl border border-stone-200 bg-white/95 p-1 backdrop-blur">
          <button
            onClick={() => {
              setMobilePane("map");
              /* Leaflet は display:none の間の大きさの変化を知らない。
                 タブで地図に戻ったとき、描画のあとに resize を流して
                 測り直させる（Leaflet は window の resize を聞いている）。
                 流さないと、隠れている間に向きを変えた端末で地図が
                 元の大きさのまま描かれ、余白が灰色になる。 */
              requestAnimationFrame(() =>
                requestAnimationFrame(() =>
                  window.dispatchEvent(new Event("resize")),
                ),
              );
            }}
            aria-pressed={mobilePane === "map"}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              mobilePane === "map"
                ? "bg-indigo-600 text-white"
                : "text-stone-600"
            }`}
          >
            🗺 地図
          </button>
          <button
            onClick={() => setMobilePane("list")}
            aria-pressed={mobilePane === "list"}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              mobilePane === "list"
                ? "bg-indigo-600 text-white"
                : "text-stone-600"
            }`}
          >
            📋 一覧・条件 ({propertiesInBounds.length})
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-5 items-stretch relative">
          {/* Left Column: Sidebar (expands from 30% to 50% in Table Mode)
              高さは地図に合わせて固定せず、中身に合わせて縮む。絞り込み
              フィルターなどのアコーディオンを全部閉じると中身が短くなるため、
              地図と同じ h-[...] で揃えていると下に大きな空白が残っていた。
              lg 以上では max-h で地図の高さを上限にし、それより中身が
              短ければそのぶん縮む（超えたら今まで通り内部スクロール）。 */}
          <div
            className={`transition-all duration-300 ease-in-out ${
              showTableView && showListView
                ? "w-full lg:w-[50%]"
                : "w-full lg:w-[30%]"
            } ${
              mobilePane === "list" ? "flex" : "hidden lg:flex"
            } bg-gray-50 dark:bg-stone-50 rounded-3xl border border-gray-200 dark:border-stone-200 shadow-sm lg:overflow-hidden flex-col lg:self-start lg:max-h-[calc(100vh-220px)] relative z-10`}
          >
            {/*
                上に貼り付く見出し。**スマホでは貼り付いていなかった。**

                外側に overflow-hidden が付いていたため、sticky の効き先が
                その箱になる。lg 以上は中身が別に内部スクロールするので
                見出しは動かないが、スマホは箱ごと頁と一緒に流れるので、
                「一覧を表示」が画面の外へ出ていた（420px で実測。
                スクロールすると y = -265 まで送られる）。

                利用者から「一覧を表示のボタンを他の場所にも出せないか」と
                相談があったが、**増やす前に、貼り付くはずのものが貼り付いて
                いなかった。**同じボタンを 2 つ置くより、意図どおり追従させる。

                overflow-hidden は角丸で中身を切るためのものなので、内部
                スクロールがある lg 以上だけに付ける。スマホでは見出し側に
                同じ角丸を持たせて見た目を合わせる。
              */}
            <div className="sticky top-0 bg-gray-50/95 dark:bg-stone-50/95 backdrop-blur border-b border-gray-200 dark:border-stone-200 p-3 flex items-center justify-between z-30 shrink-0 rounded-t-3xl lg:rounded-none">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-50 text-indigo-600 dark:text-indigo-600 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800/40">
                  条件 ({activeFiltersCount})
                </span>
                <span
                  className="text-[11px] font-semibold text-stone-600 dark:text-stone-500 cursor-help"
                  title="走査で取得した候補（名寄せ・絞り込み後、上限500件）のうち、地図の表示範囲に入る数。地図に出る「この範囲の候補」と同じ数え方です。"
                >
                  候補のうち範囲内:{" "}
                  <b className="text-gray-900 dark:text-stone-900 font-mono text-xs">
                    {propertiesInBounds.length}
                  </b>{" "}
                  件
                </span>
              </div>

              {/* 一覧と絞込の切り替え。
                  以前は「100 件以下のときだけ一覧を出せる」制限があった。
                  一覧が重くなる前提の名残だが、実際には数百件でも問題なく
                  表示できることを利用者が確認したので、制限ごと外した。
                  候補はもともと 500 件が上限なので、際限なく増えもしない。 */}
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
            </div>

            {/* Sidebar Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!showListView ? (
                // VIEW 1: Filter Screen & Settings
                <>
                  {/* どの方位が動ける方位で、そこに物件がどれだけあるか。
                      一覧は吉凶と家賃の順なので、この全体像が
                      どこにも出ていなかった。判定を出せないときは
                      行が空になるのでコンポーネント側で何も描かない。 */}
                  <DirectionTierOverview
                    rows={directionTierRows}
                    selectedDirection={filterDirection}
                    onSelectDirection={(dir) => {
                      setFilterDirection(dir);
                    }}
                    /* 風水（八宅）の併記に使う。切り替えは /houi と
                       引越し先の試算と同じもので、既定では出ない。 */
                    birthDate={birthDate}
                  />

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
                    {/* 物件種別。購入側は国交省の成約価格（取引の実績）で、
                        賃貸のような「いま契約できる物件」の一覧ではない。
                        混同させないよう、購入の中身は成約相場のパネル
                        （TransactionsPanel）に切り替える。 */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block">
                        物件種別
                      </label>
                      <div className="flex items-center gap-1 bg-zinc-200 dark:bg-white p-0.5 rounded-lg select-none">
                        <button
                          type="button"
                          onClick={() => setListingType("rent")}
                          className={`flex-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                            listingType === "rent"
                              ? "bg-white dark:bg-stone-100 text-gray-900 dark:text-stone-900 shadow-xs"
                              : "text-stone-600 hover:text-stone-800"
                          }`}
                        >
                          賃貸
                        </button>
                        <button
                          type="button"
                          onClick={() => setListingType("buy")}
                          title="国土交通省の成約価格（過去に実際に売買された価格）を方位別に表示します。"
                          className={`flex-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                            listingType === "buy"
                              ? "bg-white dark:bg-stone-100 text-gray-900 dark:text-stone-900 shadow-xs"
                              : "text-stone-600 hover:text-stone-800"
                          }`}
                        >
                          購入（成約相場）
                        </button>
                      </div>
                    </div>

                    {listingType === "buy" && (
                      <TransactionsPanel
                        lat={hasBaseLocation ? parseFloat(baseLat) : 0}
                        lon={hasBaseLocation ? parseFloat(baseLon) : 0}
                        radiusKm={radiusKm === "all" ? null : Number(radiusKm)}
                        hasBase={hasBaseLocation}
                      />
                    )}

                    {/* Search Area Selection */}
                    <div className="space-y-1">
                      <label
                        htmlFor="arb-search-area"
                        className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block"
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
                        className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block flex items-center justify-between"
                      >
                        <span>生年月日 (吉方位用)</span>
                        <span className="text-[9px] text-stone-600 font-normal">
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
                        <label className="text-[10px] font-semibold text-stone-600 dark:text-stone-500">
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
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${showBaseMapPicker ? "bg-indigo-50 dark:bg-indigo-50 text-indigo-600 dark:text-indigo-600 border-indigo-200 dark:border-indigo-800" : "bg-gray-100 dark:bg-white text-stone-600 dark:text-stone-500 border-gray-200 dark:border-stone-200"}`}
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
                            setMapFocusKind("area");
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
                        <label className="text-[10px] font-semibold text-stone-600 dark:text-stone-500">
                          出生地座標 (天体ライン用・任意)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setShowBirthMapPicker(!showBirthMapPicker)
                          }
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${showBirthMapPicker ? "bg-indigo-50 dark:bg-indigo-50 text-indigo-600 dark:text-indigo-600 border-indigo-200 dark:border-indigo-800" : "bg-gray-100 dark:bg-white text-stone-600 dark:text-stone-500 border-gray-200 dark:border-stone-200"}`}
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
                      {!birthLat && (
                        <p className="text-[10px] text-stone-600 dark:text-stone-500">
                          未入力です。天体ライン（太陽・金星・木星）は出生地から決まるため、この加点は付きません。他の判定には影響しません。
                        </p>
                      )}
                    </div>

                    {showBirthMapPicker && (
                      <div className="w-full h-48 rounded-xl overflow-hidden border border-gray-200 dark:border-stone-200 relative z-20">
                        <LocationPickerInner
                          // 未入力なら日本全体の中心から選んでもらう。ここに
                          // 特定の街を置くと、その地点が「あなたの出生地」の
                          // 初期値として選ばれてしまう。
                          initialLat={Number(birthLat) || OVERVIEW_CENTER[0]}
                          initialLon={Number(birthLon) || OVERVIEW_CENTER[1]}
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
                        className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block"
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
                      <label className="flex items-center gap-2 text-[10px] text-stone-600 dark:text-stone-500 cursor-pointer select-none">
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
                      <label className="flex items-center gap-2 text-[10px] text-stone-600 dark:text-stone-500 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={lunarPhaseModifier}
                          onChange={(e) => {
                            setLunarPhaseModifier(e.target.checked);
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
                        className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block"
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
                      <p className="text-[9px] text-stone-600 leading-relaxed">
                        家賃・間取り・徒歩分・築年数・広さ・方位・「吉方位のみ」を1行で。残りは物件名・住所の検索語になります。
                      </p>
                    </div>

                    {/* 一覧に無い場所の判定。物件データに載っていない住所や
                        これから内見に行く先を、画面を移らずに確かめる。
                        判定は新しく作らず、県の塗り分けと同じ経路の方位と、
                        既に組んである dayKigaku の段階をそのまま使う。 */}
                    <SpotVerdict
                      baseLat={Number(baseLat)}
                      baseLon={Number(baseLon)}
                      useClassical={useClassical}
                      dirKigaku={dayKigaku?.byDirection}
                      kigakuUnavailableReason={kigakuUnavailableReason}
                      requestedPoint={spotRequest}
                      onFocus={(lat, lon) => {
                        setMapFocusKind("spot");
                        setMapCenter([lat, lon]);
                      }}
                    />

                    {/* 間取り。これまでスマート検索に「2LDK」と打つ以外の
                        入口が無く、チップから外すことしかできなかった。
                        値はスマート検索の正規化（utils/smartSearch の
                        normalizeLayout）と同じ形にする。ここだけ別の表記に
                        すると、同じ条件なのに入り口によって結果が変わる。 */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block">
                        間取り
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {LAYOUT_OPTIONS.map((opt) => {
                          const on = filterLayouts.includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                setFilterLayouts((prev) =>
                                  prev.includes(opt.value)
                                    ? prev.filter((v) => v !== opt.value)
                                    : [...prev, opt.value],
                                )
                              }
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                on
                                  ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                                  : "bg-gray-50 dark:bg-white border-gray-200 dark:border-stone-200 text-stone-500 hover:text-indigo-600 hover:border-indigo-300"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* お気に入りだけを見る。★ を付けた物件が無いあいだは
                        押しても 0 件になるだけなので、出さない。 */}
                    {favoriteIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterFavoritesOnly((v) => !v)}
                        aria-pressed={filterFavoritesOnly}
                        className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                          filterFavoritesOnly
                            ? "bg-amber-100 text-amber-700 border border-amber-300"
                            : "bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 text-stone-500 hover:text-amber-600 hover:border-amber-300"
                        }`}
                      >
                        <span>{filterFavoritesOnly ? "★" : "☆"}</span>
                        お気に入りだけ表示（{favoriteIds.length}件）
                      </button>
                    )}

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
                        {filterFavoritesOnly && (
                          <FilterChip
                            label="お気に入りのみ"
                            onRemove={() => setFilterFavoritesOnly(false)}
                          />
                        )}
                      </div>
                    )}

                    {/* Search query input */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block">
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
                        className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block"
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
                        className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block cursor-help"
                        title="現住地から見た方位で物件を絞ります。方位を決めてから物件を選ぶときに使います。"
                      >
                        方位で絞る
                      </label>
                      <select
                        id="arb-direction"
                        value={filterDirection}
                        onChange={(e) => {
                          setFilterDirection(e.target.value);
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

                    {/* 家賃の分布。上限を打つ前に「いくつにすれば何件
                        残るか」を見せる。棒を押すとその升の上端が上限に
                        入る。上限フィルター自体は分布に反映しない
                        （上限より右が全部 0 になり、上げる判断ができない） */}
                    {rentBuckets && rentBuckets.some((b) => b.count > 0) && (
                      <div className="space-y-1">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] font-semibold text-stone-600 dark:text-stone-500">
                            総家賃の分布（棒を押すと上限に入ります）
                          </span>
                          <span className="text-[10px] text-stone-600">
                            表示範囲・他の絞り込みを反映
                          </span>
                        </div>
                        <div className="flex items-end gap-px h-12">
                          {rentBuckets.map((b) => {
                            const max = Math.max(
                              ...rentBuckets.map((x) => x.count),
                            );
                            const manYen = Math.round(b.fromYen / 10000);
                            const label =
                              b.toYen === null
                                ? `${manYen}万円以上: ${b.count.toLocaleString()}件`
                                : `${manYen}〜${manYen + 1}万円: ${b.count.toLocaleString()}件（クリックで上限 ${manYen + 1} 万円）`;
                            const selected =
                              filterMaxRent !== "" &&
                              b.toYen !== null &&
                              b.toYen <= Number(filterMaxRent) * 10000;
                            return (
                              <button
                                key={b.fromYen}
                                type="button"
                                title={label}
                                onClick={() => {
                                  // あふれ升は上限の値にならないので外す扱い
                                  if (b.toYen === null) setFilterMaxRent("");
                                  else
                                    setFilterMaxRent(String(b.toYen / 10000));
                                }}
                                className="flex-1 flex flex-col justify-end h-full cursor-pointer group"
                              >
                                <span
                                  style={{
                                    height: `${max > 0 ? Math.max(b.count > 0 ? 6 : 0, (b.count / max) * 100) : 0}%`,
                                  }}
                                  className={`block w-full rounded-t-sm transition-colors ${
                                    selected
                                      ? "bg-indigo-500 group-hover:bg-indigo-600"
                                      : "bg-stone-300 group-hover:bg-indigo-300"
                                  }`}
                                />
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-[10px] text-stone-600 font-mono">
                          <span>0</span>
                          <span>15万</span>
                          <span>30万〜</span>
                        </div>
                      </div>
                    )}

                    {/* Rent & Age filters */}
                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block">
                          総家賃上限 (万円)
                        </label>
                        <input
                          type="number"
                          placeholder="例: 15"
                          value={filterMaxRent}
                          onChange={(e) => {
                            setFilterMaxRent(e.target.value);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block">
                          築年数上限 (年)
                        </label>
                        <input
                          type="number"
                          placeholder="例: 15"
                          value={filterMaxAge}
                          onChange={(e) => {
                            setFilterMaxAge(e.target.value);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block">
                          駅徒歩上限 (分)
                        </label>
                        <input
                          type="number"
                          placeholder="例: 10"
                          value={filterMaxStation}
                          onChange={(e) => {
                            setFilterMaxStation(e.target.value);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block">
                          専有面積下限 (㎡)
                        </label>
                        <input
                          type="number"
                          placeholder="例: 40"
                          value={filterMinSize}
                          onChange={(e) => {
                            setFilterMinSize(e.target.value);
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

                    <div className="space-y-3">
                      {savedProfiles.length > 0 && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-stone-600 block">
                            保存済みプロフィールから追加
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {savedProfiles
                              .filter(
                                (preset) =>
                                  !partyMembers.some((m) => m.id === preset.id),
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
                            <label className="text-[10px] font-semibold text-stone-600 block">
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
                              className="text-[10px] font-semibold text-stone-600 block cursor-help"
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
                          <label className="text-[10px] font-semibold text-stone-600 block">
                            まとめ方
                          </label>
                          <select
                            value={partyPolicy}
                            onChange={(e) => {
                              setPartyPolicy(e.target.value);
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
                            className="text-[10px] font-semibold text-stone-600 block cursor-help"
                            title="対象日から何日先まで「全員が動ける日」を探すか。0 にすると時期の判定をしない。"
                          >
                            時期の走査 (日先)
                          </label>
                          <select
                            value={horizonDays}
                            onChange={(e) => {
                              setHorizonDays(Number(e.target.value));
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

                      <p className="text-[10px] text-stone-600 leading-relaxed">
                        {
                          PARTY_POLICIES.find((p) => p.id === partyPolicy)
                            ?.description
                        }
                      </p>
                    </div>
                  </ArbitrageSidebarSection>
                  {/* 判定と候補の設定。
                      評価軸の重み（プリセット・スライダー）と月額予算は
                      廃止した（利用者の指示）。残るのは候補の切り出し方と、
                      天中殺の扱い。どちらも順位の計算ではなく「何を候補に
                      入れるか」「凶をどう扱うか」の設定。 */}
                  <ArbitrageSidebarSection
                    title="判定と候補の設定"
                    summary={
                      TENCHUSATSU_MODES.find((m) => m.id === tenchusatsuMode)
                        ?.label ?? ""
                    }
                  >
                    <div className="pt-1 border-t border-gray-100 dark:border-stone-200">
                      <div className="space-y-1">
                        <label
                          htmlFor="arb-strategy"
                          className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block cursor-help"
                          title="DB から候補を切り出すときの順序。重みだけを変えても、母集合に入っていない物件は評価されない。"
                        >
                          候補の集め方
                        </label>
                        <select
                          id="arb-strategy"
                          value={candidateStrategy}
                          onChange={(e) => {
                            setCandidateStrategy(e.target.value);
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
                        className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block cursor-help"
                        title="天中殺（算命学）＝空亡（四柱推命）。九星気学には本来無い概念で、どこまで禁止則として扱うかは流派によって異なる。"
                      >
                        天中殺の扱い
                      </label>
                      <select
                        value={tenchusatsuMode}
                        onChange={(e) => {
                          setTenchusatsuMode(e.target.value);
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
                      <p className="text-[10px] text-stone-600 leading-relaxed">
                        {
                          TENCHUSATSU_MODES.find(
                            (m) => m.id === tenchusatsuMode,
                          )?.description
                        }
                      </p>
                      <p className="text-[9px] text-stone-600 leading-relaxed">
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
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      避けるべき方位・期間の物件を最下位に沈める
                    </label>
                  </ArbitrageSidebarSection>

                  {/* 引っ越し時期のスクリーニングは /relocation/timing へ移管。
                      同じ走査が両方にあって二重保守だった。日を選ぶと
                      ?targetDate=…&direction=… でこの画面に戻ってくる。 */}
                  <a
                    href="/relocation/timing"
                    className="block rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 hover:bg-indigo-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-indigo-900">
                          引っ越し時期を探す
                        </div>
                        <div className="mt-1 text-xs leading-relaxed text-indigo-900/70">
                          日付を先に決めると天中殺・八方塞がりの期間で行き止まりになります。先に「いつ・どの方位なら動けるか」を走査して、選んだ日でこの画面に戻ります。
                        </div>
                      </div>
                      <span aria-hidden className="text-indigo-400 shrink-0">
                        →
                      </span>
                    </div>
                  </a>

                  {/* TOP 5 アコーディオン。
                      「アービトラージ」という呼び名は売買の裁定取引を連想させ、
                      賃貸検索のこのサイトにはふさわしくないという指摘で
                      「掘り出し物件」に改めた。URL とコード内の識別子は
                      互換のため据え置く。 */}
                  <ArbitrageSidebarSection
                    title="いま良い方位の物件 TOP 5"
                    summary={
                      loading
                        ? "検索中"
                        : `${topArbitrage.length}件・吉方位→家賃順`
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
                          並び順は
                          <span className="font-bold">
                            方位の吉凶の段階（S→A→B→C→D→X）
                          </span>
                          、同じ段階の中では
                          <span className="font-bold">家賃の安い順</span>
                          です。点数や重み付けはありません。
                        </p>
                        <p className="mt-1.5 text-stone-500">
                          物件リストの並べ替えを変えても、ここはこの順のままです。
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
                        <div className="p-6 text-center text-stone-600 text-[10px]">
                          合致する物件がありません。
                        </div>
                      ) : (
                        topArbitrage.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => {
                              setSelectedId(item.id);
                              setMapFocusKind("spot");
                              // 座標の無い行では中心を動かさない（型上 lat/lon は
                              // nullable。null を渡すと leaflet 側で落ちる）
                              if (item.lat !== null && item.lon !== null)
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
                                <div className="text-[10px] text-stone-600 mt-1 flex flex-col gap-0.5">
                                  <span className="font-semibold">
                                    {item.direction
                                      ? `${item.direction} (${item.maxAstroFactor || "計算中"})`
                                      : "方位不明"}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-start gap-1.5 shrink-0">
                                <FavoriteButton
                                  isFavorite={favoriteIds.includes(item.id)}
                                  onToggle={() => toggleFavorite(item.id)}
                                />
                                <div className="text-right">
                                  <div className="font-mono text-indigo-600 dark:text-indigo-600 font-bold text-[11px]">
                                    {Math.round((item.totalRent || 0) / 10000)}
                                    万円
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ArbitrageSidebarSection>

                  {/* 選んだ物件の詳細は TOP 5 のすぐ下に出す。押した場所の
                      続きに出ないと、押しても何も起きていないように見える。 */}
                  {propertyDetailPanel}
                </>
              ) : (
                // VIEW 2: Property List Screen (Cards or Table)
                <div className="space-y-4">
                  {/* 一覧画面では最上部。カード・表がこの下に続く。 */}
                  {propertyDetailPanel}
                  <div className="flex items-center justify-between border-b border-gray-200 dark:border-stone-200 pb-2">
                    <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                      物件リスト（候補 {sortedTableData.length}{" "}
                      件中、表示範囲内を表示）
                    </h3>

                    {/* Card vs Table toggle switches */}
                    <div className="flex items-center gap-1 bg-zinc-200 dark:bg-white p-0.5 rounded-lg shrink-0 select-none">
                      <button
                        onClick={() => setShowTableView(false)}
                        className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${!showTableView ? "bg-white dark:bg-stone-100 text-gray-900 dark:text-stone-900 shadow-xs" : "text-stone-600 hover:text-gray-700 dark:hover:text-stone-800"}`}
                      >
                        カード
                      </button>
                      <button
                        onClick={() => setShowTableView(true)}
                        className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${showTableView ? "bg-white dark:bg-stone-100 text-gray-900 dark:text-stone-900 shadow-xs" : "text-stone-600 hover:text-gray-700 dark:hover:text-stone-800"}`}
                      >
                        テーブル
                      </button>
                    </div>
                  </div>

                  {propertiesInBounds.length === 0 ? (
                    <div className="p-12 text-center text-stone-600 text-xs">
                      現在の表示範囲内に条件合致する物件がありません。地図をドラッグするかズームアウトしてください。
                    </div>
                  ) : !showTableView ? (
                    // Card View List inside sidebar
                    <div className="space-y-3.5">
                      {propertiesInBounds.map((item) => {
                        const k = item.direction
                          ? dayKigaku?.byDirection[item.direction]
                          : undefined;
                        const pinColors = getPropertyPinColors(
                          item,
                          k?.tier,
                          k?.blocked,
                        );
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              setSelectedId(item.id);
                              setMapFocusKind("spot");
                              // 座標の無い行では中心を動かさない（型上 lat/lon は
                              // nullable。null を渡すと leaflet 側で落ちる）
                              if (item.lat !== null && item.lon !== null)
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
                              <FavoriteButton
                                isFavorite={favoriteIds.includes(item.id)}
                                onToggle={() => toggleFavorite(item.id)}
                              />
                              <span
                                className={`text-[8.5px] px-1.5 py-0.5 rounded font-bold shrink-0 leading-none ${pinColors.bgClass} ${pinColors.textClass}`}
                              >
                                {pinColors.label}
                              </span>
                            </div>

                            <div className="text-[10px] text-stone-600 truncate max-w-xs">
                              {item.address || "住所情報なし"}
                            </div>

                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2.5 pt-2 border-t border-gray-100 dark:border-stone-200 text-[10px] text-stone-600 dark:text-stone-500 font-mono">
                              <div className="flex justify-between">
                                <span>総賃料:</span>
                                <span className="font-bold text-gray-900 dark:text-stone-900">
                                  {item.totalRent
                                    ? `${(item.totalRent / 10000).toFixed(1)}万円`
                                    : "不明"}
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

                            {/* 誰にとってどうか、いつなら全員で動けるか。 */}
                            {renderPartyBreakdown(item)}

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
                    /* 横に入り切らないときは列を潰さずスクロールさせる。
                       min-w が 500px だったころは、実際に要る幅（列が
                       8〜10 本で 900px 前後）との差をブラウザが自動レイア
                       ウトで吸収し、いちばん縮められる列（方位・吉凶）を
                       1 文字ずつ縦積みにしていた。「W (天道方位)」が縦書き
                       のように出ていたのはこれ。
                       thead の whitespace-nowrap は white-space が継承
                       されるので、中の th すべてに効く。 */
                    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-stone-200 bg-white dark:bg-stone-50">
                      <table className="w-full text-xs text-left min-w-[900px]">
                        <thead className="whitespace-nowrap text-[10px] text-stone-600 uppercase bg-gray-50 dark:bg-white/80 border-b border-gray-200 dark:border-stone-200">
                          <tr>
                            <th className="w-10 px-2 py-2.5 text-center font-bold">
                              ★
                            </th>
                            <th className="px-4 py-2.5 font-bold">
                              物件名 / 住所
                            </th>
                            <th
                              className="px-4 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors font-bold"
                              onClick={(e) => handleSortChange("kigaku", e)}
                            >
                              方位・吉凶 {renderSortIndicator("kigaku")}
                            </th>
                            <th
                              className="px-4 py-2.5 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors font-bold"
                              onClick={(e) => handleSortChange("rent", e)}
                            >
                              総家賃 {renderSortIndicator("rent")}
                            </th>
                            <th className="px-4 py-2.5 text-right font-bold">
                              平米 / 築年 / 徒歩
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {propertiesInBounds.map((item) => {
                            const k = item.direction
                              ? dayKigaku?.byDirection[item.direction]
                              : undefined;
                            const pinColors = getPropertyPinColors(
                              item,
                              k?.tier,
                              k?.blocked,
                            );
                            return (
                              <tr
                                key={item.id}
                                onClick={() => {
                                  setSelectedId(item.id);
                                  setMapFocusKind("spot");
                                  if (item.lat !== null && item.lon !== null)
                                    setMapCenter([item.lat, item.lon]);
                                }}
                                className="border-b border-gray-100 dark:border-stone-200 hover:bg-gray-50 dark:hover:bg-white/80 transition-colors cursor-pointer"
                              >
                                <td className="px-2 py-3 text-center">
                                  <FavoriteButton
                                    isFavorite={favoriteIds.includes(item.id)}
                                    onToggle={() => toggleFavorite(item.id)}
                                  />
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
                                <td className="px-4 py-3 whitespace-nowrap">
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
                                <td className="px-4 py-3 text-right font-mono font-semibold whitespace-nowrap">
                                  {item.totalRent.toLocaleString()}円
                                </td>
                                <td className="px-4 py-3 text-right text-stone-600 font-mono text-[10px] whitespace-nowrap">
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
            } ${
              mobilePane === "map" ? "block" : "hidden lg:block"
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
              prefKigaku={dayKigaku?.byPrefecture}
              dirKigaku={dayKigaku?.byDirection}
              kigakuUnavailableReason={kigakuUnavailableReason}
              prefCounts={livePrefCounts ?? undefined}
              prefCountsFiltered={livePrefCounts !== null}
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
