/**
 * Ephemeris Engine (Personal Frequency & Temporal Vector Calculator)
 *
 * 物理エンジンとしての気学・四柱推命：
 * - 星 (Star 1-9): 固有の電磁気的な波長・周波数帯域を表す
 * - 天中殺 (Void Time): 地球の磁気シールドが薄まる、あるいは自律神経がエラーを起こしやすい時間的・空間的スリット
 */

export type StarFrequency = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface PersonalProfile {
  honmeiStar: StarFrequency; // Base Hardware Frequency
  getsuMeiStar: StarFrequency; // Secondary Hardware Frequency
  tenchusatsuGroup: string; // Shield Vulnerability Group (e.g., '午未')
}

// 方位の型定義 (8方向 + 中央)
export type Direction =
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW"
  | "CENTER";

// 盤面（Board）の型: 各方向にどの星が配置されているか
export type BoardLayout = Record<Direction, StarFrequency>;

/**
 * 土用（Doyou）と間日（Mabi）の状態。
 *
 * calculateVectorCollision の戻り値の中に同じ形が書いてあり、受け側
 * （SolarTimeClock・arbitrageAstro・municipalities-wealth）は any で
 * 受けていた。形は 1 つなので、名前を付けてここから引く。
 */
export type DoyouState = {
  inDoyou: boolean;
  doyouType: "SPRING" | "SUMMER" | "AUTUMN" | "WINTER" | null;
  isMabi: boolean;
  /** 土用の期間中で、かつ間日でない。移転を避ける対象。 */
  isDoyouHazard: boolean;
};

/**
 * 魔法陣（後天定位盤 / 洛書）の数学的生成
 * 中宮（Center）に入る星を基準に、固定の軌道（遁甲）で星を配置する。
 * 軌道: 中宮 -> NW -> W -> NE -> S -> N -> SW -> E -> SE
 */
export function generateBoard(centerStar: StarFrequency): BoardLayout {
  const calc = (offset: number) => {
    const val = (centerStar + offset) % 9;
    return (val === 0 ? 9 : val) as StarFrequency;
  };

  return {
    CENTER: centerStar,
    NW: calc(1),
    W: calc(2),
    NE: calc(3),
    S: calc(4),
    N: calc(5),
    SW: calc(6),
    E: calc(7),
    SE: calc(8),
  };
}

import {
  AstroTime,
  Body,
  Ecliptic,
  GeoVector,
  SiderealTime,
} from "astronomy-engine";
import { Solar } from "lunar-javascript";
import { calculateSolarTime, getZonedDateTimeFields } from "./solarTime";
import { directionFromBearing } from "./directionGeo";

/**
 * Astronomical Engine: Validated Physical Orbital Coordinates
 * Uses VSOP87 & Lunar theories for exact planetary positions
 */
export const AstroEngine = {
  getJulianDay(date: Date): number {
    return new AstroTime(date).ut + 2451545.0; // Astronomy-engine 'ut' is days since J2000
  },

  // 太陽の黄経 (Ecliptic Longitude of the Sun)
  getSolarLongitude(date: Date): number {
    const time = new AstroTime(date);
    const coords = Ecliptic(GeoVector(Body.Sun, time, true));
    return coords.elon;
  },

  // 月の黄経 (Ecliptic Longitude of the Moon)
  getLunarLongitude(date: Date): number {
    const time = new AstroTime(date);
    const coords = Ecliptic(GeoVector(Body.Moon, time, true));
    return coords.elon;
  },

  // 水星の黄経
  getMercuryLongitude(date: Date): number {
    const time = new AstroTime(date);
    const coords = Ecliptic(GeoVector(Body.Mercury, time, true));
    return coords.elon;
  },

  // 金星の黄経
  getVenusLongitude(date: Date): number {
    const time = new AstroTime(date);
    const coords = Ecliptic(GeoVector(Body.Venus, time, true));
    return coords.elon;
  },

  // 火星の黄経
  getMarsLongitude(date: Date): number {
    const time = new AstroTime(date);
    const coords = Ecliptic(GeoVector(Body.Mars, time, true));
    return coords.elon;
  },

  // 木星の黄経
  getJupiterLongitude(date: Date): number {
    const time = new AstroTime(date);
    const coords = Ecliptic(GeoVector(Body.Jupiter, time, true));
    return coords.elon;
  },

  // 土星の黄経
  getSaturnLongitude(date: Date): number {
    const time = new AstroTime(date);
    const coords = Ecliptic(GeoVector(Body.Saturn, time, true));
    return coords.elon;
  },

  // 天王星の黄経
  getUranusLongitude(date: Date): number {
    const time = new AstroTime(date);
    const coords = Ecliptic(GeoVector(Body.Uranus, time, true));
    return coords.elon;
  },

  // 海王星の黄経
  getNeptuneLongitude(date: Date): number {
    const time = new AstroTime(date);
    const coords = Ecliptic(GeoVector(Body.Neptune, time, true));
    return coords.elon;
  },

  // 冥王星の黄経
  getPlutoLongitude(date: Date): number {
    const time = new AstroTime(date);
    const coords = Ecliptic(GeoVector(Body.Pluto, time, true));
    return coords.elon;
  },

  // グリニッジ恒星時 (Greenwich Sidereal Time)
  getGreenwichSiderealTime(date: Date): number {
    return SiderealTime(new AstroTime(date));
  },

  // 地方恒星時 (Local Sidereal Time)
  getLocalSiderealTime(date: Date, lon: number): number {
    const rawLst = AstroEngine.getGreenwichSiderealTime(date) + lon / 15;
    return ((rawLst % 24) + 24) % 24;
  },

  /**
   * アセンダント (Ascendant) の算出
   * @param date 日時
   * @param lat 緯度
   * @param lon 経度
   */
  getAscendant(date: Date, lat: number, lon: number, gst?: number): number {
    const sidereal =
      gst !== undefined ? gst : AstroEngine.getGreenwichSiderealTime(date);
    const rawLstHours = sidereal + lon / 15;
    const lstHours = ((rawLstHours % 24) + 24) % 24;
    const lst = lstHours * 15; // 時間(0-24)を角度(0-360)に変換
    const lstRad = (lst * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;

    // 黄道傾斜角 (Obliquity of the Ecliptic) 約 23.44度
    const epsilonRad = (23.4392911 * Math.PI) / 180;

    const ascRad = Math.atan2(
      Math.cos(lstRad),
      -Math.sin(lstRad) * Math.cos(epsilonRad) -
        Math.tan(latRad) * Math.sin(epsilonRad),
    );

    let ascDeg = (ascRad * 180) / Math.PI;
    while (ascDeg < 0) ascDeg += 360;
    while (ascDeg >= 360) ascDeg -= 360;

    return ascDeg;
  },

  /**
   * ミッドヘブン (Midheaven / MC) の算出
   * MCは緯度に依存せず、地方恒星時と黄道傾斜角のみで決まります。
   */
  getMidheaven(date: Date, lon: number, gst?: number): number {
    const sidereal =
      gst !== undefined ? gst : AstroEngine.getGreenwichSiderealTime(date);
    const lst = (sidereal + lon / 15) * 15;
    const lstRad = (lst * Math.PI) / 180;

    // 黄道傾斜角 (Obliquity of the Ecliptic) 約 23.44度
    const epsilonRad = (23.4392911 * Math.PI) / 180;

    const mcRad = Math.atan2(Math.tan(lstRad), Math.cos(epsilonRad));
    let mcDeg = (mcRad * 180) / Math.PI;

    // atan2の性質上、LSTの象限に合わせる補正が必要
    if (lst >= 90 && lst < 270) {
      mcDeg += 180;
    } else if (lst >= 270 && lst < 360) {
      mcDeg += 360;
    }

    while (mcDeg < 0) mcDeg += 360;
    while (mcDeg >= 360) mcDeg -= 360;

    return mcDeg;
  },

  // ドラゴンヘッド（月の昇交点）の黄経
  getLunarNodeLongitude(date: Date): number {
    const jd = AstroEngine.getJulianDay(date);
    const T = (jd - 2451545.0) / 36525;
    const node = (125.04452 - 1934.136261 * T) % 360;
    return node < 0 ? node + 360 : node;
  },
};

/**
 * 固有周波数（本命星）の算出：
 * 伝統的な暦（立春）に基づく精密な九星判定。
 */
export function getClassicalYearStar(date: Date): StarFrequency {
  const solar = Solar.fromDate(date);
  const lunar = solar.getLunar();
  return (lunar.getYearNineStar().getIndex() + 1) as StarFrequency;
}

/**
 * 本命星の取得（物理モデルと古典モデルの両方を返す）：
 * - 物理モデル：生誕時の地球と太陽の幾何学的位相から天体学的に判定する物理モデル。
 * - 古典モデル：伝統的な暦（立春）に基づく精密な九星判定。
 */
export function getHonmeiStar(birthDate: Date): {
  physical: StarFrequency;
  classical: StarFrequency;
} {
  return {
    physical: getYearStar(birthDate),
    classical: getClassicalYearStar(birthDate),
  };
}

/**
 * Long-term Wave (年盤) の算出：
 * 設計書に基づく完全な天体物理モデリング。
 *
 * 物理的根拠:
 * 木星の公転周期は約11.86年であり、地球の磁気圏に巨大な重力・電磁波干渉を与えます。
 * 年ごとのマトリクスの中心周波数は、この木星の黄経に直接依存して決定されます。
 */
export function getYearStar(date: Date): StarFrequency {
  const jupiterLon = AstroEngine.getJupiterLongitude(date);

  // 木星の黄経(0〜360度)を9つの周波数帯域(各40度)にマッピングする
  const phaseIndex = Math.floor(jupiterLon / 40); // 0〜8

  // 陰陽五行の基本サイクルに合わせて逆行(9 -> 1)させる
  let star = 9 - phaseIndex;
  if (star <= 0) star += 9;
  if (star > 9) star %= 9;
  if (star === 0) star = 9;

  return star as StarFrequency;
}

/**
 * 古典月盤の算出（暦・節気基準）
 */
/**
 * その時刻が属する節月の「まん中あたり」の日時を返す。
 *
 * 節入りは太陽黄経 30 度ごと（立春=315度で寅月が始まる）。月支はこの
 * 太陽黄経から直接出しているが、lunar-javascript の月九星は節入りの
 * 「日」で切り替わる。そのため節入り当日だけ、盤の星と月支が 1 日ずれる。
 *
 * 実測: 2026 年の立秋は 8/7 20:43 JST。判定に使う正午時点の太陽黄経は
 * 134.65 度でまだ立秋前なので月支は「未」だが、月盤の星は既に申月の
 * 二黒になっていた。天道と月破は月支から出すため、未月の天道（東）が
 * 申月の盤に当たり、地図だけ東が大吉と出ていた。
 *
 * 星の値そのものは lunar-javascript が正しいので、境界の判定だけを
 * 太陽黄経に合わせる。節月の中ほどの日を渡せば取り違えようがない。
 */
export function solarTermMonthAnchor(date: Date): Date {
  const lon = AstroEngine.getSolarLongitude(date);
  // 立春(315度)を起点に 30 度ごとの区切り。この区切りの開始黄経を求める。
  const segment = Math.floor(((lon + 45) % 360) / 30);
  const segmentStartLon = (segment * 30 - 45 + 360) % 360;

  // 開始黄経を跨いだ時刻を二分探索する（最大 40 日前まで遡る）。
  const crossed = (t: number) => {
    const l = AstroEngine.getSolarLongitude(new Date(t));
    // 起点からの進み具合（0〜360）で比較すると 360 度の折り返しを跨げる
    return (l - segmentStartLon + 360) % 360 < 180;
  };
  let lo = date.getTime() - 40 * 86400000;
  let hi = date.getTime();
  if (!crossed(hi)) return new Date(date.getTime() + 15 * 86400000);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (crossed(mid)) hi = mid;
    else lo = mid;
  }
  // 節入りの 15 日後。次の節入りまで約 30 日あるので、必ず同じ節月の中。
  return new Date(hi + 15 * 86400000);
}

export function getClassicalMonthStar(date: Date): StarFrequency {
  const solar = Solar.fromDate(solarTermMonthAnchor(date));
  const lunar = solar.getLunar();
  return (lunar.getMonthNineStar().getIndex() + 1) as StarFrequency;
}

/**
 * 古典日盤の算出（ユリウス日と隠遁陽遁の簡易暦基準）
 */
export function getClassicalDayStar(date: Date): StarFrequency {
  const solar = Solar.fromDate(date);
  const lunar = solar.getLunar();
  return (lunar.getDayNineStar().getIndex() + 1) as StarFrequency;
}

/**
 * Mid-term Wave (月盤) の算出：
 * 設計書に基づく完全な天体物理モデリング。
 *
 * 物理的根拠:
 * 月の黄経と、太陽軌道の相対位相（太陽と月の位置関係）に依存して中心周波数を決定します。
 * これにより、約29.5日の引力波のサイクルを計算します。
 */
export function getMonthStar(date: Date): StarFrequency {
  const L0 = AstroEngine.getSolarLongitude(date);

  // 地球の太陽黄経 (0〜360度) を12の位相帯域 (各30度) にマッピングする
  const phaseIndex = Math.floor(L0 / 30); // 0〜11

  // 陰陽五行の基本サイクルに合わせて逆行(9 -> 1)させる
  let star = 9 - phaseIndex;
  while (star <= 0) star += 9;
  star %= 9;
  if (star === 0) star = 9;

  return star as StarFrequency;
}

/**
 * 太陽黄経(0〜360度)を節入り（315度＝寅月起点）のインデックス（0〜11）にマッピングする
 */
export function getSolarMonthIndex(L0: number): number {
  let L_adj = L0 - 315;
  if (L_adj < 0) {
    L_adj += 360;
  }
  return Math.floor(L_adj / 30);
}

/**
 * 木星黄経モード下での物理月盤の星を算出する
 * - independent: 年盤に依存せず太陽黄経から直接算出（従来の仕様）
 * - coupled: 年盤の星（木星黄経ベース）に依存して伝統的な規則で連動算出
 */
export function getPhysicalMonthStar(
  date: Date,
  mode: "coupled" | "independent" = "independent",
): StarFrequency {
  if (mode === "coupled") {
    const yStar = getYearStar(date);
    const L0 = AstroEngine.getSolarLongitude(date);
    const mIndex = getSolarMonthIndex(L0);

    let startStar: StarFrequency;
    const mod = yStar % 3;
    if (mod === 1) {
      startStar = 8;
    } else if (mod === 2) {
      startStar = 5;
    } else {
      startStar = 2;
    }

    let star = startStar - mIndex;
    while (star <= 0) {
      star += 9;
    }
    star = star % 9;
    if (star === 0) {
      star = 9;
    }
    return star as StarFrequency;
  } else {
    return getMonthStar(date);
  }
}

/**
 * Calculates a daily timing modifier based on the lunar phase.
 * Returns a scoreModifier (+/- 10 points) and custom advice text.
 */
export function calculateLunarPhaseCondition(
  date: Date,
  actionIntent: ActionIntent = "DEFAULT",
): {
  scoreModifier: number;
  phaseLabel: string;
  adviceText: string;
} {
  const sunLon = AstroEngine.getSolarLongitude(date);
  const moonLon = AstroEngine.getLunarLongitude(date);

  // 太陽と月の相対位相 (0〜360度)
  let relativePhase = moonLon - sunLon;
  if (relativePhase < 0) {
    relativePhase += 360;
  }

  let phaseLabel = "Waning Moon (欠けていく月)";
  let scoreModifier = 0;
  let adviceText =
    "月相のバイオリズムは標準的です。通常の行動計画に支障はありません。";

  if (relativePhase >= 345 || relativePhase < 15) {
    phaseLabel = "New Moon (新月)";
    if (actionIntent === "REST") {
      scoreModifier = 10;
      adviceText =
        "新月です。浄化とリセット、休息に最適なタイミングです。エネルギーを充電してください。";
    } else if (actionIntent === "BUSINESS" || actionIntent === "MIGRATION") {
      scoreModifier = -10;
      adviceText =
        "新月です。新しいプロジェクトの本格始動や大きな移動には、エネルギー不足を伴う可能性があります。";
    } else {
      scoreModifier = -5;
      adviceText =
        "新月です。内省や計画立案に適した静かなフェーズです。大きな対外活動は控えめが吉。";
    }
  } else if (relativePhase >= 15 && relativePhase < 75) {
    phaseLabel = "Waxing Crescent (満ちていく月)";
    scoreModifier = 5;
    adviceText =
      "満ちていく月です。新たな目標に向けて行動を少しずつ進めるのに適しています。";
  } else if (relativePhase >= 75 && relativePhase < 105) {
    phaseLabel = "First Quarter (上弦の月)";
    scoreModifier = 8;
    adviceText =
      "上弦 of the Moon. 成長と発展のエネルギーが高まっています。決断と実行の好機です。";
  } else if (relativePhase >= 105 && relativePhase < 165) {
    phaseLabel = "Waxing Gibbous (満月へ向かう月)";
    scoreModifier = 5;
    adviceText =
      "満月に近づく月です。これまでの努力が形になり始める活動的なフェーズです。";
  } else if (relativePhase >= 165 && relativePhase < 195) {
    phaseLabel = "Full Moon (満月)";
    if (actionIntent === "REST") {
      scoreModifier = -10;
      adviceText =
        "満月です。エネルギーが最大化し感情や自律神経が昂ぶりやすいため、深いリラックスは困難です。";
    } else if (actionIntent === "BUSINESS" || actionIntent === "MIGRATION") {
      scoreModifier = 10;
      adviceText =
        "満月です。引き寄せの力が最大化し、契約や門出に大吉のタイミングです。自信を持って行動を。";
    } else {
      scoreModifier = 10;
      adviceText =
        "満月です。エネルギーがピークに達しています。社交的な集まりや決断に非常に適しています。";
    }
  } else if (relativePhase >= 195 && relativePhase < 255) {
    phaseLabel = "Waning Gibbous (下弦へ向かう月)";
    scoreModifier = 0;
    adviceText =
      "欠けていく月です。物事の整理や、不要な習慣の手放し、整理整頓に適しています。";
  } else if (relativePhase >= 255 && relativePhase < 285) {
    phaseLabel = "Last Quarter (下弦の月)";
    scoreModifier = -5;
    if (actionIntent === "REST") {
      scoreModifier = 5;
    }
    adviceText =
      "下弦の月です。デトックスや心身の整理に適したクールダウン期です。";
  }

  return { scoreModifier, phaseLabel, adviceText };
}

/**
 * Short-term Wave (日盤) の算出：
 * 暦ではなく、ユリウス日（Julian Day）と太陽黄経を用いた最新の軌道物理モデリング。
 *
 * 物理的根拠:
 * 地球の自転による昼夜サイクルを基調とし、太陽光子の入射角（太陽黄経）による「陽遁・陰遁」の位相反転を再現。
 * 夏至（L0=90°）と冬至（L0=270°）を物理的な極性反転ポイント（至点）として厳密に定義。
 */
export function getDayStar(date: Date): StarFrequency {
  const jd = AstroEngine.getJulianDay(date);
  const L0 = AstroEngine.getSolarLongitude(date);

  // 物理モデル: 夏至(L0=90)から冬至(L0=270)は太陽エネルギーが減衰する「負の位相（陰遁）」
  // 冬至(L0=270)から夏至(L0=90)はエネルギーが増幅する「正の位相（陽遁）」
  const isYinPhase = L0 >= 90 && L0 < 270;

  // Base rotation phase using Julian Day
  const cycle = Math.floor(jd) % 9;

  // 逆相（キャンセリング） / 正相（アンプリファイング）の適用
  let star = isYinPhase ? 9 - cycle : cycle + 1;
  if (star <= 0) star += 9;
  if (star > 9) star %= 9;
  if (star === 0) star = 9;

  return star as StarFrequency;
}

/**
 * Micro-term Wave (時盤) の算出：
 * プレースホルダーを廃止し、地方恒星時（Local Sidereal Time）を用いた物理モデリング。
 *
 * 物理的根拠:
 * 地球の自転に伴う、宇宙空間（銀河中心・恒星背景）に対する絶対的な向き（位相）。
 * 恒星時（0〜24時）を12の位相帯域に分割し、日のサイクル（陽遁・陰遁）と合成する。
 */
export function getHourStar(
  date: Date,
  isYinPhase: boolean,
  lon: number = 139.6917,
): StarFrequency {
  // 地方恒星時(Local Sidereal Time: 0〜24時間)
  const lst = AstroEngine.getLocalSiderealTime(date, lon);

  // 2時間ごとのフェーズ(0〜11)に分割
  const phaseIndex = Math.floor(lst / 2);

  // ベースとなる日のサイクル (Julian Day)
  const jd = AstroEngine.getJulianDay(date);
  const dayCycle = Math.floor(jd + 0.5) % 9;

  // 位相の合成（陽遁は加算、陰遁は減算で波をモジュレーション）
  let star = isYinPhase ? dayCycle - phaseIndex : dayCycle + phaseIndex;

  // 1〜9のフラクタルに丸め込み
  while (star <= 0) star += 9;
  star %= 9;
  if (star === 0) star = 9;

  return star as StarFrequency;
}

export function getCurrentEnvironmentalFrequencies(
  date: Date,
  lon: number = 139.6917,
  physicalMonthMode: "coupled" | "independent" = "independent",
) {
  const physY = getYearStar(date);
  const classY = getClassicalYearStar(date);
  const classM = getClassicalMonthStar(date);
  const classD = getClassicalDayStar(date);
  const m = getPhysicalMonthStar(date, physicalMonthMode);
  const d = getDayStar(date);
  const L0 = AstroEngine.getSolarLongitude(date);
  const isYinPhase = L0 >= 90 && L0 < 270;
  const h = getHourStar(date, isYinPhase, lon);

  return {
    yearStar: physY,
    classicalYearStar: classY,
    classicalMonthStar: classM,
    classicalDayStar: classD,
    monthStar: m,
    dayStar: d,
    isYinPhase: isYinPhase,
    hourStar: h,
    raw: {
      sunLon: L0,
      moonLon: AstroEngine.getLunarLongitude(date),
      jupiterLon: AstroEngine.getJupiterLongitude(date),
      lunarNode: AstroEngine.getLunarNodeLongitude(date),
      lst: AstroEngine.getLocalSiderealTime(date, lon),
    },
  };
}

const getCompatibleStars = (star: StarFrequency): StarFrequency[] => {
  switch (star) {
    case 1:
      return [6, 7, 3, 4];
    case 2:
      return [9, 6, 7];
    case 3:
      return [1, 9];
    case 4:
      return [1, 9];
    case 5:
      return [9, 6, 7];
    case 6:
      return [2, 5, 8, 1];
    case 7:
      return [2, 5, 8, 1];
    case 8:
      return [9, 6, 7];
    case 9:
      return [3, 4, 2, 5, 8];
    default:
      return [];
  }
};

/**
 * アクション目的に応じた最適化フラグ
 */
export type ActionIntent = "DEFAULT" | "REST" | "BUSINESS" | "MIGRATION";

/**
 * ベクトル衝突計算（吉凶方位の物理的割り出し）
 */
export function calculateVectorCollision(
  personalStar: StarFrequency,
  yearBoard: BoardLayout,
  monthBoard: BoardLayout,
  dayBoard: BoardLayout,
  voidZodiacs: string[] = [],
  lunarNodeLon: number | null = null,
  actionIntent: ActionIntent = "DEFAULT",
  targetDate?: Date,
  lon: number = 139.6917,
  getsuMeiStar?: StarFrequency,
  nodeMapping: "traditional" | "physical" = "traditional",
  /**
   * 日盤を判定から外す。12 ヶ月表示のように「その月の傾向」を見るときに使う。
   *
   * 呼び出し側で finalVectors を組み直すと、天道の上書きや移転時の
   * 日盤ノイズの扱い（WARNING への格下げ）が失われる。実測では、
   * 地図が「大吉」の方位を 12 ヶ月ヒートマップが「個人不調」と出していた。
   * 判定の実装をここ 1 か所に保つため、除外もここで受ける。
   */
  ignoreDayLayer: boolean = false,
): {
  yearLayer: Partial<Record<Direction, string>>;
  monthLayer: Partial<Record<Direction, string>>;
  dayLayer: Partial<Record<Direction, string>>;
  finalVectors: Record<
    Direction,
    | "OPTIMAL"
    | "OPTIMAL_REGULAR"
    | "SAFE"
    | "WARNING"
    | "NOISE_GOU"
    | "NOISE_ANKEN"
    | "NOISE_HONMEI"
    | "NOISE_TEKI"
    | "NOISE_GETSUMEI"
    | "NOISE_GETSUTEKI"
    | "NOISE_VOID"
    | "NOISE_NODE"
    | "NOISE"
    | "NOISE_HA"
  >;
  tendoDirection?: Direction;
  doyouState?: DoyouState;
} {
  const directions: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  // 天中殺（Void Zodiac）の方位マッピング
  const z2d: Record<string, Direction[]> = {
    子: ["N"],
    丑: ["NE"],
    寅: ["NE"],
    卯: ["E"],
    辰: ["SE"],
    巳: ["SE"],
    午: ["S"],
    未: ["SW"],
    申: ["SW"],
    酉: ["W"],
    戌: ["NW"],
    亥: ["NW"],
  };
  const voidDirs = new Set<Direction>();
  voidZodiacs.forEach((z) => {
    (z2d[z] || []).forEach((d) => voidDirs.add(d));
  });

  // ドラゴンヘッド/テールの侵犯方向
  const nodeDirs = new Set<Direction>();
  if (lunarNodeLon !== null) {
    const getBearing = (lon: number): Direction => {
      let val = 0;
      if (nodeMapping === "physical") {
        let b = (lon - 90) % 360;
        if (b < 0) b += 360;
        b = 360 - b;
        val = ((b % 360) + 360) % 360;
      } else {
        // 'traditional' model: Spring (0) = East (90), Summer (90) = South (180), Autumn (180) = West (270), Winter (270) = North (0)
        val = (lon + 90) % 360;
      }

      // 区切りは nodeMapping に関わらず常に伝統区分（四正30度・四隅60度）。
      // nodeMapping が切り替えるのは上の経度→方位角の変換だけで、
      // ここに nodeMapping を渡すと判定が変わるので固定で "traditional"。
      return directionFromBearing(val, "traditional");
    };
    nodeDirs.add(getBearing(lunarNodeLon));
    nodeDirs.add(getBearing((lunarNodeLon + 180) % 360));
  }

  let compatiblesHonmei = getCompatibleStars(personalStar);

  if (actionIntent === "REST") {
    if (personalStar === 3 || personalStar === 4) compatiblesHonmei = [1];
    else if (personalStar === 1) compatiblesHonmei = [6, 7];
  } else if (actionIntent === "BUSINESS") {
    if (personalStar === 1) compatiblesHonmei = [3, 4];
    else if (personalStar === 3 || personalStar === 4) compatiblesHonmei = [9];
  }

  const compatiblesGetsumei = getsuMeiStar
    ? getCompatibleStars(getsuMeiStar)
    : [];

  const getOptimalStatus = (
    starNum: StarFrequency,
  ): "OPTIMAL" | "OPTIMAL_REGULAR" | "SAFE" => {
    const isHonmeiComp = compatiblesHonmei.includes(starNum);
    if (!getsuMeiStar) {
      return isHonmeiComp ? "OPTIMAL" : "SAFE";
    }
    const isGetsumeiComp = compatiblesGetsumei.includes(starNum);
    if (isHonmeiComp && isGetsumeiComp) {
      return "OPTIMAL"; // Max lucky
    } else if (isHonmeiComp) {
      return "OPTIMAL_REGULAR"; // Regular lucky
    }
    return "SAFE";
  };

  // 十二支情報・天道・土用の計算
  const zodiacs = targetDate ? getCurrentZodiac(targetDate, lon) : null;

  // 天道 (Tendo)
  const monthlyTendoMap: Record<string, Direction> = {
    寅: "S",
    卯: "SW",
    辰: "N",
    巳: "W",
    午: "NW",
    未: "E",
    申: "N",
    酉: "NE",
    戌: "S",
    亥: "E",
    子: "SE",
    丑: "W",
  };
  const tendoDir = zodiacs?.monthZodiac
    ? monthlyTendoMap[zodiacs.monthZodiac]
    : undefined;

  // 土用 (Doyou) & 間日 (Mabi)
  let doyouState: DoyouState | undefined = undefined;
  if (targetDate) {
    const L0 = AstroEngine.getSolarLongitude(targetDate);
    let doyouType: "SPRING" | "SUMMER" | "AUTUMN" | "WINTER" | null = null;
    if (L0 >= 27 && L0 < 45) doyouType = "SPRING";
    else if (L0 >= 117 && L0 < 135) doyouType = "SUMMER";
    else if (L0 >= 207 && L0 < 225) doyouType = "AUTUMN";
    else if (L0 >= 297 && L0 < 315) doyouType = "WINTER";

    const inDoyou = doyouType !== null;
    let isMabi = false;
    if (zodiacs?.dayZodiac) {
      if (doyouType === "SPRING")
        isMabi = ["巳", "午", "酉"].includes(zodiacs.dayZodiac);
      else if (doyouType === "SUMMER")
        isMabi = ["卯", "辰", "申"].includes(zodiacs.dayZodiac);
      else if (doyouType === "AUTUMN")
        isMabi = ["未", "酉", "亥"].includes(zodiacs.dayZodiac);
      else if (doyouType === "WINTER")
        isMabi = ["寅", "卯", "巳"].includes(zodiacs.dayZodiac);
    }

    doyouState = {
      inDoyou,
      doyouType,
      isMabi,
      isDoyouHazard: inDoyou && !isMabi,
    };
  }

  const processLayer = (board: BoardLayout) => {
    const res: Partial<Record<Direction, string>> = {};
    directions.forEach((d) => (res[d] = "SAFE"));

    const getOpposite = (dir: Direction): Direction => {
      const opposites: Record<string, Direction> = {
        N: "S",
        S: "N",
        E: "W",
        W: "E",
        NE: "SW",
        SW: "NE",
        NW: "SE",
        SE: "NW",
      };
      return opposites[dir];
    };

    // 1. 五黄殺・暗剣殺
    for (const dir of directions) {
      if (board[dir] === 5) {
        res[dir] = "NOISE_GOU";
        res[getOpposite(dir)] = "NOISE_ANKEN";
        break;
      }
    }

    // 2. 本命殺・的殺
    for (const dir of directions) {
      if (board[dir] === personalStar) {
        if (res[dir] === "SAFE") res[dir] = "NOISE_HONMEI";
        const opp = getOpposite(dir);
        if (res[opp] === "SAFE") res[opp] = "NOISE_TEKI";
        break;
      }
    }

    // 2.5. 月命殺・月的殺
    if (getsuMeiStar) {
      for (const dir of directions) {
        if (board[dir] === getsuMeiStar) {
          if (res[dir] === "SAFE") res[dir] = "NOISE_GETSUMEI";
          const opp = getOpposite(dir);
          if (res[opp] === "SAFE") res[opp] = "NOISE_GETSUTEKI";
          break;
        }
      }
    }

    // 3. グローバルノイズと最適化の適用
    for (const dir of directions) {
      if (res[dir] === "SAFE") {
        if (voidDirs.has(dir)) {
          res[dir] = "NOISE_VOID";
        } else if (nodeDirs.has(dir)) {
          res[dir] = "NOISE_NODE";
        } else {
          const optStatus = getOptimalStatus(board[dir]);
          if (optStatus !== "SAFE") {
            res[dir] = optStatus;
          }
        }
      }
    }

    return res;
  };

  const yearLayer = processLayer(yearBoard);
  // Apply 歳破 (Saiha)
  if (zodiacs?.yearZodiac) {
    const clashZodiac = clashMap[zodiacs.yearZodiac];
    const clashDirs = z2d[clashZodiac] || [];
    clashDirs.forEach((d) => {
      yearLayer[d] = "NOISE_HA";
    });
  }

  const monthLayer = processLayer(monthBoard);
  // Apply 月破 (Geppa)
  if (zodiacs?.monthZodiac) {
    const clashZodiac = clashMap[zodiacs.monthZodiac];
    const clashDirs = z2d[clashZodiac] || [];
    clashDirs.forEach((d) => {
      monthLayer[d] = "NOISE_HA";
    });
  }

  const dayLayer = processLayer(dayBoard);
  // Apply 日破 (Nippa)
  if (zodiacs?.dayZodiac) {
    const clashZodiac = clashMap[zodiacs.dayZodiac];
    const clashDirs = z2d[clashZodiac] || [];
    clashDirs.forEach((d) => {
      dayLayer[d] = "NOISE_HA";
    });
  }

  const finalVectors: any = {};

  if (ignoreDayLayer) {
    for (const dir of directions) {
      dayLayer[dir] = "SAFE";
    }
  }

  for (const dir of directions) {
    let yStatus = yearLayer[dir]!;
    let mStatus = monthLayer[dir]!;
    let dStatus = dayLayer[dir]!;

    const isTendo = tendoDir && dir === tendoDir;

    // Tendo overrides minor personal noise on any layer
    if (isTendo) {
      if (
        [
          "NOISE_HONMEI",
          "NOISE_TEKI",
          "NOISE_GETSUMEI",
          "NOISE_GETSUTEKI",
        ].includes(yStatus)
      )
        yStatus = "OPTIMAL";
      if (
        [
          "NOISE_HONMEI",
          "NOISE_TEKI",
          "NOISE_GETSUMEI",
          "NOISE_GETSUTEKI",
        ].includes(mStatus)
      )
        mStatus = "OPTIMAL";
      if (
        [
          "NOISE_HONMEI",
          "NOISE_TEKI",
          "NOISE_GETSUMEI",
          "NOISE_GETSUTEKI",
        ].includes(dStatus)
      )
        dStatus = "OPTIMAL";
    }

    /*
      ここに const layers = [yStatus, mStatus, dStatus] があったが、誰も
      読んでいなかった。MIGRATION 側は criticalLayers = [yStatus, mStatus]
      を別に作り、それ以外の側は else 節の中で同じ名前で組み直している。
      外側のものは影に隠れていて、参照が 1 つも無い。
    */
    if (actionIntent === "MIGRATION") {
      // For relocation, Year and Month layers are extremely critical (long-term), Day is short-term.
      const yRed = ["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(yStatus);
      const mRed = ["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(mStatus);
      const dRed = ["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(dStatus);

      if (yRed) {
        finalVectors[dir] = yStatus as any; // Year red noise is absolute blocker
      } else if (mRed) {
        finalVectors[dir] = mStatus as any; // Month red noise is absolute blocker
      } else if (dRed) {
        // If Year/Month are safe, but only Day has red noise, downgrade to WARNING
        finalVectors[dir] = "WARNING";
      } else {
        // 年盤・月盤に残る二次凶の順序。noiseSeverity の NOISE_PRIORITY に
        // 従い、五大凶殺（本命殺・的殺）を天中殺方位より先に出す。以前は
        // VOID を先に採っていたため、本命殺が天中殺方位のラベルに隠れ、
        // 地図の大凶（赤）にならないことがあった。
        const criticalLayers = [yStatus, mStatus];
        if (criticalLayers.includes("NOISE_HONMEI")) {
          finalVectors[dir] = "NOISE_HONMEI";
        } else if (criticalLayers.includes("NOISE_TEKI")) {
          finalVectors[dir] = "NOISE_TEKI";
        } else if (criticalLayers.includes("NOISE_VOID")) {
          finalVectors[dir] = "NOISE_VOID";
        } else if (criticalLayers.includes("NOISE_GETSUMEI")) {
          finalVectors[dir] = "NOISE_GETSUMEI";
        } else if (criticalLayers.includes("NOISE_GETSUTEKI")) {
          finalVectors[dir] = "NOISE_GETSUTEKI";
        } else if (criticalLayers.includes("NOISE_NODE")) {
          finalVectors[dir] = "NOISE_NODE";
        } else {
          // No active noises on Year and Month. Now we can check if it is OPTIMAL.
          const hasOpt = criticalLayers.includes("OPTIMAL");
          const hasOptReg = criticalLayers.includes("OPTIMAL_REGULAR");
          if (hasOpt) {
            finalVectors[dir] = "OPTIMAL";
          } else if (hasOptReg) {
            finalVectors[dir] = "OPTIMAL_REGULAR";
          } else {
            finalVectors[dir] = "SAFE";
          }
        }
      }
    } else {
      // General Ops: Year, Month, and Day are all active.
      const layers = [yStatus, mStatus, dStatus];

      const hasGou = layers.includes("NOISE_GOU");
      const hasAnken = layers.includes("NOISE_ANKEN");
      const hasHa = layers.includes("NOISE_HA");

      if (hasGou) {
        finalVectors[dir] = "NOISE_GOU";
      } else if (hasAnken) {
        finalVectors[dir] = "NOISE_ANKEN";
      } else if (hasHa) {
        finalVectors[dir] = "NOISE_HA";
      } else if (layers.includes("NOISE_HONMEI")) {
        finalVectors[dir] = "NOISE_HONMEI";
      } else if (layers.includes("NOISE_TEKI")) {
        finalVectors[dir] = "NOISE_TEKI";
      } else if (layers.includes("NOISE_VOID")) {
        finalVectors[dir] = "NOISE_VOID";
      } else if (layers.includes("NOISE_GETSUMEI")) {
        finalVectors[dir] = "NOISE_GETSUMEI";
      } else if (layers.includes("NOISE_GETSUTEKI")) {
        finalVectors[dir] = "NOISE_GETSUTEKI";
      } else if (layers.includes("NOISE_NODE")) {
        finalVectors[dir] = "NOISE_NODE";
      } else {
        // No noises. Determine if lucky.
        const hasOpt = layers.includes("OPTIMAL");
        const hasOptReg = layers.includes("OPTIMAL_REGULAR");
        if (hasOpt) {
          finalVectors[dir] = "OPTIMAL";
        } else if (hasOptReg) {
          finalVectors[dir] = "OPTIMAL_REGULAR";
        } else {
          finalVectors[dir] = "SAFE";
        }
      }
    }
  }
  // Apply 土用殺 (Doyou-satsu) to finalVectors
  if (doyouState && doyouState.isDoyouHazard) {
    const doyouSatsuDirections: Record<
      NonNullable<DoyouState["doyouType"]>,
      Direction
    > = {
      SPRING: "SE",
      SUMMER: "SW",
      AUTUMN: "NW",
      WINTER: "NE",
    };
    // doyouType は null を取りうる型だが、ここには null では入れない
    // （isDoyouHazard = inDoyou && !isMabi、inDoyou = doyouType !== null）。
    // 以前は doyouSatsuDirections[null] を引いており、JS では obj["null"]
    // すなわち undefined になって下の if で落ちていた。この三項の偽側も
    // 同じく undefined を返すので、結果は前と変わらない。
    const targetDoyouSatsuDir = doyouState.doyouType
      ? doyouSatsuDirections[doyouState.doyouType]
      : undefined;
    if (targetDoyouSatsuDir) {
      finalVectors[targetDoyouSatsuDir] = "NOISE_GOU";
    }
  }

  return {
    yearLayer,
    monthLayer,
    dayLayer,
    finalVectors,
    tendoDirection: tendoDir,
    doyouState,
  };
}

/**
 * 生年月日の「日干支」から個人の天中殺（Void Zodiac）を算出する。
 * （2024年1月1日を甲子＝インデックス0とする近似ロジック）
 */
export function getPersonalVoidZodiac(birthDate: Date): string[] {
  /* ORIGINAL FORMULA (Preserved for reference):
  // ユリウス日を用いて日本時間の干支を正確に算出する
  // 2024年1月1日(甲子=0) の JD は約 2460310.125 (JST 0:00)
  // Math.floor(JD + 0.5) = 2460310。 2460310 % 60 = 10。
  // したがって、(Math.floor(JD + 0.5) + 50) % 60 が干支インデックスとなる。
  const jd = AstroEngine.getJulianDay(birthDate);
  const ganZhiIndex = (Math.floor(jd + 0.5) + 50) % 60;
  const gan = ganZhiIndex % 10;
  const zhi = ganZhiIndex % 12;
  const voidDiff = (zhi - gan + 12) % 12;
  */

  const fields = getZonedDateTimeFields(birthDate, 9);
  const solar = Solar.fromYmdHms(
    fields.year,
    fields.month,
    fields.day,
    fields.hours,
    fields.minutes,
    fields.seconds,
  );
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();
  const dayGan = eightChar.getDayGan();
  const dayZhi = eightChar.getDayZhi();

  const JIKKAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  const JUNISHI = [
    "子",
    "丑",
    "寅",
    "卯",
    "辰",
    "巳",
    "午",
    "未",
    "申",
    "酉",
    "戌",
    "亥",
  ];

  const gan = JIKKAN.indexOf(dayGan);
  const zhi = JUNISHI.indexOf(dayZhi);

  if (gan === -1 || zhi === -1) {
    return ["午", "未"]; // Fallback
  }

  const voidDiff = (zhi - gan + 12) % 12;

  switch (voidDiff) {
    case 0:
      return ["戌", "亥"]; // 甲子旬
    case 10:
      return ["申", "酉"]; // 甲戌旬
    case 8:
      return ["午", "未"]; // 甲申旬
    case 6:
      return ["辰", "巳"]; // 甲午旬
    case 4:
      return ["寅", "卯"]; // 甲辰旬
    case 2:
      return ["子", "丑"]; // 甲寅旬
    default:
      return ["午", "未"]; // フォールバック
  }
}

/**
 * 時刻の基準。
 *
 *   "standard"  標準時（JST 一律）。**既定。**これまでの挙動
 *   "solar"     真太陽時（経度補正 + 均時差）
 *
 * 流派で分かれるため、既定は変えずに設定で切り替える形にしている
 * （利用者の判断。#398 で報告した件）。
 */
export type ZodiacTimeBasis = "standard" | "solar";

/**
 * 日付と経度から、その時点の「年・月・日・時」の十二支（文字列）を天体物理学的に取得する
 *
 * ## lon の扱い
 *
 * **`timeBasis` が "standard"（既定）のとき、lon は使わない。**
 * 呼び出し側は 19 か所すべてが実際の出発地を渡しているが、これまでは
 * それを捨てて JST の時計時刻で八字を組んでいた。標準子午線 135 度の
 * 時刻であって、誰の真太陽時でもない。那覇と根室で 71 分の開きがあり、
 * 時支の 1 枠 120 分に対して境目付近では答えが変わる。
 *
 * "solar" にすると lon から真太陽時を出して八字に渡す。**年支と月支は
 * 変わらない**（木星黄経・太陽黄経で決まる地心の量なので経度に依らない）。
 * 変わるのは時支と、真夜中付近の日支。
 */
export function getCurrentZodiac(
  date: Date,
  lon: number = 139.6917,
  timeBasis: ZodiacTimeBasis = "standard",
): {
  yearZodiac: string;
  monthZodiac: string;
  dayZodiac: string;
  hourZodiac: string;
} {
  // 年の干支: 木星黄経ベース（物理モデル）
  // 木星の黄経（0〜360度）を12分割し、実際の天体位置から「年の干支」を算出する。
  // 黄道0度(春分点)付近を卯とし、30度ごとに進む。
  // (例: 2026年4月頃の木星黄経は約106度 -> インデックス3 -> 「午」となる)
  const jupiterLon = AstroEngine.getJupiterLongitude(date);
  const yearIndex = Math.floor(jupiterLon / 30);
  const ZODIACS_JUPITER = [
    "卯",
    "辰",
    "巳",
    "午",
    "未",
    "申",
    "酉",
    "戌",
    "亥",
    "子",
    "丑",
    "寅",
  ];
  const yearZodiac = ZODIACS_JUPITER[yearIndex];

  // 月の干支: 太陽黄経ベース（立春(315度)から寅月が始まる）
  // 315〜345:寅(3), 345〜15:卯(4), 15〜45:辰(5)...
  const sunLon = AstroEngine.getSolarLongitude(date);
  const monthIndex = Math.floor(((sunLon + 45) % 360) / 30);
  // monthIndex 0(立春〜):寅
  const ZODIACS_MONTH = [
    "亥",
    "子",
    "丑",
    "寅",
    "卯",
    "辰",
    "巳",
    "午",
    "未",
    "申",
    "酉",
    "戌",
  ];
  const monthZodiac = ZODIACS_MONTH[(monthIndex + 3) % 12];

  // 日の干支: ユリウス日ベース
  /* ORIGINAL FORMULA (Preserved for reference):
  const jd = AstroEngine.getJulianDay(date);
  const ganZhiIndex = (Math.floor(jd + 0.5) + 50) % 60;
  const zhi = ganZhiIndex % 12;
  const ZODIACS_GANZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const dayZodiac = ZODIACS_GANZHI[zhi];
  */
  /*
    八字に渡す時刻。"standard" では JST の時計時刻をそのまま使う（従来）。
    "solar" では出発地の真太陽時に直してから渡す。時刻がずれるので、
    時支だけでなく**真夜中付近では日支も動く**。真太陽時では日の境目も
    真太陽時の 0 時になるため、これは意図した挙動。
  */
  const basisDate =
    timeBasis === "solar" ? calculateSolarTime(date, lon, 9).solarTime : date;

  const fields = getZonedDateTimeFields(basisDate, 9);
  const solar = Solar.fromYmdHms(
    fields.year,
    fields.month,
    fields.day,
    fields.hours,
    fields.minutes,
    fields.seconds,
  );
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();
  const dayZodiac = eightChar.getDayZhi();

  const hourZodiac = eightChar.getTimeZhi();

  return { yearZodiac, monthZodiac, dayZodiac, hourZodiac };
}

/**
 * Calculates the lunar distance in kilometers using astronomy-engine's GeoVector.
 */
export function getLunarDistance(date: Date): number {
  const time = new AstroTime(date);
  const vec = GeoVector(Body.Moon, time, true);
  if (!vec) return 384400; // Fallback to average distance
  const dist_au = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
  return dist_au * 149597870.7; // AU to km
}

/**
 * Calculates a gravitational tide intensity and score (0 to 20) based on lunar phase alignment and distance closeness.
 */
export function calculateTideScore(date: Date): {
  tideIntensity: number;
  distanceCloseness: number;
  gravitationalTideScore: number;
} {
  const sunLon = AstroEngine.getSolarLongitude(date);
  const moonLon = AstroEngine.getLunarLongitude(date);
  const distance_km = getLunarDistance(date);

  // Lunar Phase (0.0 to 1.0)
  const lunarPhase = ((moonLon - sunLon + 360) % 360) / 360.0;

  // Closeness to extreme (Spring Tide alignment at 0.0, 0.5, 1.0)
  const closenessToExtreme = Math.min(
    lunarPhase,
    Math.abs(lunarPhase - 0.5),
    1.0 - lunarPhase,
  );

  // Normalized tide intensity (1.0 at full/new moon, 0.0 at quarter moon)
  const tideIntensity = (0.25 - closenessToExtreme) / 0.25;

  // Closeness to perigee (closest point: 356,400km is 1.0, apogee: 406,700km is 0.0)
  const distanceCloseness = Math.max(
    0,
    Math.min(1, (406700 - distance_km) / (406700 - 356400)),
  );

  // Combine both factors to form score out of 20
  let gravitationalTideScore = tideIntensity * 10 + distanceCloseness * 10;

  let intensityVal = tideIntensity;
  let closenessVal = distanceCloseness;

  // Safeguard against NaN computations in case astronomical outputs or divisions fail
  if (
    Number.isNaN(intensityVal) ||
    Number.isNaN(closenessVal) ||
    Number.isNaN(gravitationalTideScore)
  ) {
    intensityVal = 0.5;
    closenessVal = 0.5;
    gravitationalTideScore = 10.0; // Neutral midpoint
  }

  return {
    tideIntensity: parseFloat(intensityVal.toFixed(3)),
    distanceCloseness: parseFloat(closenessVal.toFixed(3)),
    gravitationalTideScore: parseFloat(gravitationalTideScore.toFixed(3)),
  };
}

/**
 * Opposite branches for Conflict Day calculation.
 */
export const clashMap: Record<string, string> = {
  子: "午",
  午: "子",
  丑: "未",
  未: "丑",
  寅: "申",
  申: "寅",
  卯: "酉",
  酉: "卯",
  辰: "戌",
  戌: "辰",
  巳: "亥",
  亥: "巳",
};

export interface DoyouPeriodInfo {
  start: string;
  end: string;
  type: "SPRING" | "SUMMER" | "AUTUMN" | "WINTER";
  mabiDays: string[];
}

export function getUpcomingDoyouPeriod(baseDate: Date): DoyouPeriodInfo | null {
  const getDoyouType = (
    L0: number,
  ): "SPRING" | "SUMMER" | "AUTUMN" | "WINTER" | null => {
    if (L0 >= 27 && L0 < 45) return "SPRING";
    if (L0 >= 117 && L0 < 135) return "SUMMER";
    if (L0 >= 207 && L0 < 225) return "AUTUMN";
    if (L0 >= 297 && L0 < 315) return "WINTER";
    return null;
  };

  const getMabiZodiacs = (
    type: "SPRING" | "SUMMER" | "AUTUMN" | "WINTER",
  ): string[] => {
    if (type === "SPRING") return ["巳", "午", "酉"];
    if (type === "SUMMER") return ["卯", "辰", "申"];
    if (type === "AUTUMN") return ["未", "酉", "亥"];
    return ["寅", "卯", "巳"]; // WINTER
  };

  // Find the first day in a Doyou period, starting from baseDate
  const current = new Date(baseDate.getTime());
  current.setHours(12, 0, 0, 0); // normalize
  let foundType: "SPRING" | "SUMMER" | "AUTUMN" | "WINTER" | null = null;
  let targetDate = new Date(current.getTime());

  for (let i = 0; i < 365; i++) {
    const testDate = new Date(current.getTime() + i * 86400000);
    const L0 = AstroEngine.getSolarLongitude(testDate);
    const type = getDoyouType(L0);
    if (type) {
      foundType = type;
      targetDate = testDate;
      break;
    }
  }

  if (!foundType) return null;

  // Scan backward to find the start date of this Doyou period
  let startDate = new Date(targetDate.getTime());
  while (true) {
    const prevDate = new Date(startDate.getTime() - 86400000);
    const L0 = AstroEngine.getSolarLongitude(prevDate);
    if (getDoyouType(L0) === foundType) {
      startDate = prevDate;
    } else {
      break;
    }
  }

  // Scan forward to find the end date of this Doyou period
  let endDate = new Date(targetDate.getTime());
  while (true) {
    const nextDate = new Date(endDate.getTime() + 86400000);
    const L0 = AstroEngine.getSolarLongitude(nextDate);
    if (getDoyouType(L0) === foundType) {
      endDate = nextDate;
    } else {
      break;
    }
  }

  // Find Mabi days in this period
  const mabiDays: string[] = [];
  const mabiZodiacs = getMabiZodiacs(foundType);
  const totalDays =
    Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate.getTime() + i * 86400000);
    const zodiacs = getCurrentZodiac(d);
    if (zodiacs?.dayZodiac && mabiZodiacs.includes(zodiacs.dayZodiac)) {
      mabiDays.push(d.toISOString().split("T")[0]);
    }
  }

  return {
    start: startDate.toISOString().split("T")[0],
    end: endDate.toISOString().split("T")[0],
    type: foundType,
    mabiDays,
  };
}

export function checkIsDoyouHazard(date: Date): boolean {
  const L0 = AstroEngine.getSolarLongitude(date);
  let doyouType: "SPRING" | "SUMMER" | "AUTUMN" | "WINTER" | null = null;
  if (L0 >= 27 && L0 < 45) doyouType = "SPRING";
  else if (L0 >= 117 && L0 < 135) doyouType = "SUMMER";
  else if (L0 >= 207 && L0 < 225) doyouType = "AUTUMN";
  else if (L0 >= 297 && L0 < 315) doyouType = "WINTER";

  const inDoyou = doyouType !== null;
  if (!inDoyou) return false;

  const zodiacs = getCurrentZodiac(date);
  let isMabi = false;
  if (zodiacs?.dayZodiac) {
    if (doyouType === "SPRING")
      isMabi = ["巳", "午", "酉"].includes(zodiacs.dayZodiac);
    else if (doyouType === "SUMMER")
      isMabi = ["卯", "辰", "申"].includes(zodiacs.dayZodiac);
    else if (doyouType === "AUTUMN")
      isMabi = ["未", "酉", "亥"].includes(zodiacs.dayZodiac);
    else if (doyouType === "WINTER")
      isMabi = ["寅", "卯", "巳"].includes(zodiacs.dayZodiac);
  }
  return inDoyou && !isMabi;
}

export function filterCollisionByMode(
  collision: any,
  personalStar: StarFrequency,
  getsuMeiStar: StarFrequency | null,
  voidZodiacs: string[],
  directionFilterMode:
    | "composite"
    | "personal_kigaku"
    | "personal_bazi"
    | "environmental",
  yBoard: any,
  mBoard: any,
  dBoard: any,
) {
  if (directionFilterMode === "composite") {
    return collision;
  }

  const directions: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  const getCompatibleStars = (star: StarFrequency): StarFrequency[] => {
    switch (star) {
      case 1:
        return [6, 7, 3, 4];
      case 2:
        return [9, 6, 7];
      case 3:
        return [1, 9];
      case 4:
        return [1, 9];
      case 5:
        return [9, 6, 7];
      case 6:
        return [2, 5, 8, 1];
      case 7:
        return [2, 5, 8, 1];
      case 8:
        return [9, 6, 7];
      case 9:
        return [3, 4, 2, 5, 8];
      default:
        return [];
    }
  };
  const compatiblesHonmei = getCompatibleStars(personalStar);
  const compatiblesGetsumei = getsuMeiStar
    ? getCompatibleStars(getsuMeiStar)
    : [];

  const getOptimalStatus = (
    starNum: StarFrequency,
  ): "OPTIMAL" | "OPTIMAL_REGULAR" | "SAFE" => {
    const isHonmeiComp = compatiblesHonmei.includes(starNum);
    if (!getsuMeiStar) {
      return isHonmeiComp ? "OPTIMAL" : "SAFE";
    }
    const isGetsumeiComp = compatiblesGetsumei.includes(starNum);
    if (isHonmeiComp && isGetsumeiComp) {
      return "OPTIMAL";
    } else if (isHonmeiComp) {
      return "OPTIMAL_REGULAR";
    }
    return "SAFE";
  };

  const z2d: Record<string, Direction[]> = {
    子: ["N"],
    丑: ["NE"],
    寅: ["NE"],
    卯: ["E"],
    辰: ["SE"],
    巳: ["SE"],
    午: ["S"],
    未: ["SW"],
    申: ["SW"],
    酉: ["W"],
    戌: ["NW"],
    亥: ["NW"],
  };
  const voidDirs = new Set<Direction>();
  voidZodiacs.forEach((z) => {
    (z2d[z] || []).forEach((d) => voidDirs.add(d));
  });

  const getOpposite = (d: Direction): Direction => {
    const opposites: Record<string, Direction> = {
      N: "S",
      S: "N",
      E: "W",
      W: "E",
      NE: "SW",
      SW: "NE",
      NW: "SE",
      SE: "NW",
    };
    return opposites[d];
  };

  const filterStatus = (
    status: string | undefined,
    dir: Direction,
    activeBoard: any,
  ) => {
    if (!status) return "SAFE";
    if (directionFilterMode === "personal_kigaku") {
      let honmeiD: Direction | null = null;
      directions.forEach((d) => {
        if (activeBoard && activeBoard[d] === personalStar) {
          honmeiD = d;
        }
      });
      if (dir === honmeiD) return "NOISE_HONMEI";
      if (honmeiD && dir === getOpposite(honmeiD)) return "NOISE_TEKI";
      const optStatus = getOptimalStatus(activeBoard ? activeBoard[dir] : 1);
      return optStatus;
    } else if (directionFilterMode === "personal_bazi") {
      if (voidDirs.has(dir)) return "NOISE_VOID";
      return "SAFE";
    } else {
      let isGou = false;
      let isAnken = false;
      if (activeBoard) {
        directions.forEach((d) => {
          if (activeBoard[d] === 5) {
            if (d === dir) isGou = true;
            if (getOpposite(d) === dir) isAnken = true;
          }
        });
      }
      if (isGou) return "NOISE_GOU";
      if (isAnken) return "NOISE_ANKEN";
      if (status === "NOISE_HA") return "NOISE_HA";
      if (status === "NOISE_NODE") return "NOISE_NODE";
      return "SAFE";
    }
  };

  const newYearLayer: any = {};
  const newMonthLayer: any = {};
  const newDayLayer: any = {};
  const newFinalVectors: any = {};

  directions.forEach((d) => {
    newYearLayer[d] = filterStatus(collision.yearLayer[d], d, yBoard);
    newMonthLayer[d] = filterStatus(collision.monthLayer[d], d, mBoard);
    newDayLayer[d] = filterStatus(collision.dayLayer[d], d, dBoard);

    if (directionFilterMode === "personal_kigaku") {
      const y = newYearLayer[d];
      const m = newMonthLayer[d];
      const dStatus = newDayLayer[d];
      const list = [y, m, dStatus];
      const hasPurple = list.find(
        (s) => s === "NOISE_HONMEI" || s === "NOISE_TEKI",
      );
      const hasOpt = list.find((s) => s === "OPTIMAL");
      const hasOptReg = list.find((s) => s === "OPTIMAL_REGULAR");

      if (hasPurple) newFinalVectors[d] = hasPurple;
      else if (hasOpt) newFinalVectors[d] = "OPTIMAL";
      else if (hasOptReg) newFinalVectors[d] = "OPTIMAL_REGULAR";
      else newFinalVectors[d] = "SAFE";
    } else if (directionFilterMode === "personal_bazi") {
      const y = newYearLayer[d];
      const m = newMonthLayer[d];
      const dStatus = newDayLayer[d];
      const list = [y, m, dStatus];
      const hasVoid = list.find((s) => s === "NOISE_VOID");
      if (hasVoid) newFinalVectors[d] = "NOISE_VOID";
      else newFinalVectors[d] = "SAFE";
    } else {
      const y = newYearLayer[d];
      const m = newMonthLayer[d];
      const dStatus = newDayLayer[d];
      const list = [y, m, dStatus];
      const hasRed = list.find(
        (s) => s === "NOISE_GOU" || s === "NOISE_ANKEN" || s === "NOISE_HA",
      );
      const hasNode = list.find((s) => s === "NOISE_NODE");

      if (hasRed) newFinalVectors[d] = hasRed;
      else if (hasNode) newFinalVectors[d] = "NOISE_NODE";
      else newFinalVectors[d] = "SAFE";
    }
  });

  return {
    ...collision,
    yearLayer: newYearLayer,
    monthLayer: newMonthLayer,
    dayLayer: newDayLayer,
    finalVectors: newFinalVectors,
  };
}
