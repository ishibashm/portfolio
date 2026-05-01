/**
 * Ephemeris Engine (Personal Frequency & Temporal Vector Calculator)
 * 
 * 物理エンジンとしての気学・四柱推命：
 * - 星 (Star 1-9): 固有の電磁気的な波長・周波数帯域を表す
 * - 天中殺 (Void Time): 地球の磁気シールドが薄まる、あるいは自律神経がエラーを起こしやすい時間的・空間的スリット
 */

export type StarFrequency = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface PersonalProfile {
  honmeiStar: StarFrequency;       // Base Hardware Frequency
  getsuMeiStar: StarFrequency;     // Secondary Hardware Frequency
  tenchusatsuGroup: string;        // Shield Vulnerability Group (e.g., '午未')
}

// 方位の型定義 (8方向 + 中央)
export type Direction = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'CENTER';

// 盤面（Board）の型: 各方向にどの星が配置されているか
export type BoardLayout = Record<Direction, StarFrequency>;

/**
 * 魔法陣（後天定位盤 / 洛書）の数学的生成
 * 中宮（Center）に入る星を基準に、固定の軌道（遁甲）で星を配置する。
 * 軌道: 中宮 -> NW -> W -> NE -> S -> N -> SW -> E -> SE
 */
export function generateBoard(centerStar: StarFrequency): BoardLayout {
  const calc = (offset: number) => {
    let val = (centerStar + offset) % 9;
    return (val === 0 ? 9 : val) as StarFrequency;
  };

  return {
    CENTER: centerStar,
    NW: calc(1),
    W:  calc(2),
    NE: calc(3),
    S:  calc(4),
    N:  calc(5),
    SW: calc(6),
    E:  calc(7),
    SE: calc(8)
  };
}

import { 
  AstroTime, 
  Body, 
  Ecliptic, 
  GeoVector,
  SiderealTime
} from 'astronomy-engine';

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

  // 地方恒星時 (Local Sidereal Time)
  getLocalSiderealTime(date: Date, lon: number): number {
    const time = new AstroTime(date);
    return SiderealTime(time) + (lon / 15);
  },

  /**
   * アセンダント (Ascendant) の算出
   * @param date 日時
   * @param lat 緯度
   * @param lon 経度
   */
  getAscendant(date: Date, lat: number, lon: number): number {
    const lst = AstroEngine.getLocalSiderealTime(date, lon) * 15; // 時間(0-24)を角度(0-360)に変換
    const lstRad = (lst * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    
    // 黄道傾斜角 (Obliquity of the Ecliptic) 約 23.44度
    const epsilonRad = (23.4392911 * Math.PI) / 180;

    const ascRad = Math.atan2(
      Math.cos(lstRad),
      -Math.sin(lstRad) * Math.cos(epsilonRad) - Math.tan(latRad) * Math.sin(epsilonRad)
    );
    
    let ascDeg = (ascRad * 180) / Math.PI;
    while (ascDeg < 0) ascDeg += 360;
    while (ascDeg >= 360) ascDeg -= 360;
    
    return ascDeg;
  },

  // ドラゴンヘッド（月の昇交点）の黄経
  getLunarNodeLongitude(date: Date): number {
    const jd = AstroEngine.getJulianDay(date);
    const T = (jd - 2451545.0) / 36525;
    let node = (125.04452 - 1934.136261 * T) % 360;
    return node < 0 ? node + 360 : node;
  }
};

/**
 * 固有周波数（本命星）の算出：
 * 古典的な「立春」による新年切り替えも、実際には「太陽黄経(L0) = 315度」に相当。
 * 単なるカレンダーではなく、生誕時の地球と太陽の幾何学的位相から天体学的に判定する物理モデル。
 */
export function getClassicalYearStar(date: Date): StarFrequency {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  
  // 一般的な暦（カレンダー）では2月4日を立春として年を切り替える
  const isPreviousCycle = (month === 1) || (month === 2 && day < 4);
  let calcYear = isPreviousCycle ? year - 1 : year;

  // フラクタル周波数への圧縮（Harmonic Reduction）
  let reduced = String(calcYear).split('').reduce((acc, val) => acc + Number(val), 0);
  while (reduced > 9) {
    reduced = String(reduced).split('').reduce((acc, val) => acc + Number(val), 0);
  }
  
  let star = 11 - reduced;
  if (star > 9) star -= 9;
  if (star <= 0) star += 9;
  
  return star as StarFrequency;
}

export function getHonmeiStar(birthDate: Date): { physical: StarFrequency, classical: StarFrequency } {
  return {
    physical: getYearStar(birthDate),
    classical: getClassicalYearStar(birthDate)
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
 * Mid-term Wave (月盤) の算出：
 * 設計書に基づく完全な天体物理モデリング。
 * 
 * 物理的根拠:
 * 月の黄経と、太陽軌道の相対位相（太陽と月の位置関係）に依存して中心周波数を決定します。
 * これにより、約29.5日の引力波のサイクルを計算します。
 */
export function getMonthStar(date: Date): StarFrequency {
  const sunLon = AstroEngine.getSolarLongitude(date);
  const moonLon = AstroEngine.getLunarLongitude(date);
  
  // 太陽と月の相対位相 (0〜360度)
  let relativePhase = moonLon - sunLon;
  if (relativePhase < 0) {
    relativePhase += 360;
  }
  
  // 相対位相を9つの周波数帯域(各40度)にマッピングする
  const phaseIndex = Math.floor(relativePhase / 40); // 0〜8
  
  // 陰陽五行の基本サイクルに合わせて逆行(9 -> 1)させる
  let star = 9 - phaseIndex;
  if (star <= 0) star += 9;
  if (star > 9) star %= 9;
  if (star === 0) star = 9;
  
  return star as StarFrequency;
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
  const isYinPhase = (L0 >= 90 && L0 < 270);
  
  // Base rotation phase using Julian Day
  const cycle = Math.floor(jd) % 9;
  
  // 逆相（キャンセリング） / 正相（アンプリファイング）の適用
  let star = isYinPhase ? (9 - cycle) : (cycle + 1);
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
export function getHourStar(date: Date, isYinPhase: boolean, lon: number = 139.6917): StarFrequency {
  // 地方恒星時(Local Sidereal Time: 0〜24時間)
  const lst = AstroEngine.getLocalSiderealTime(date, lon);
  
  // 2時間ごとのフェーズ(0〜11)に分割
  const phaseIndex = Math.floor(lst / 2);
  
  // ベースとなる日のサイクル (Julian Day)
  const jd = AstroEngine.getJulianDay(date);
  const dayCycle = Math.floor(jd + 0.5) % 9;
  
  // 位相の合成（陽遁は加算、陰遁は減算で波をモジュレーション）
  let star = isYinPhase ? (dayCycle - phaseIndex) : (dayCycle + phaseIndex);
  
  // 1〜9のフラクタルに丸め込み
  while (star <= 0) star += 9;
  star %= 9;
  if (star === 0) star = 9;
  
  return star as StarFrequency;
}

export function getCurrentEnvironmentalFrequencies(date: Date, lon: number = 139.6917) {
  const physY = getYearStar(date);
  const classY = getClassicalYearStar(date);
  const m = getMonthStar(date);
  const d = getDayStar(date);
  const L0 = AstroEngine.getSolarLongitude(date);
  const isYinPhase = (L0 >= 90 && L0 < 270);
  const h = getHourStar(date, isYinPhase, lon);
  
  return {
    yearStar: physY,
    classicalYearStar: classY,
    monthStar: m,
    dayStar: d,
    isYinPhase: isYinPhase,
    hourStar: h,
    raw: {
      sunLon: L0,
      moonLon: AstroEngine.getLunarLongitude(date),
      jupiterLon: AstroEngine.getJupiterLongitude(date),
      lunarNode: AstroEngine.getLunarNodeLongitude(date),
      lst: AstroEngine.getLocalSiderealTime(date, lon)
    }
  };
}

/**
 * アクション目的に応じた最適化フラグ
 */
export type ActionIntent = 'DEFAULT' | 'REST' | 'BUSINESS' | 'MIGRATION';

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
  actionIntent: ActionIntent = 'DEFAULT'
): {
  yearLayer: Partial<Record<Direction, string>>;
  monthLayer: Partial<Record<Direction, string>>;
  dayLayer: Partial<Record<Direction, string>>;
  finalVectors: Record<Direction, 'OPTIMAL' | 'SAFE' | 'NOISE_GOU' | 'NOISE_ANKEN' | 'NOISE_HONMEI' | 'NOISE_TEKI' | 'NOISE_VOID' | 'NOISE_NODE' | 'NOISE'>;
} {
  
  const directions: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  
  const processLayer = (board: BoardLayout) => {
    const res: Partial<Record<Direction, string>> = {};
    directions.forEach(d => res[d] = 'SAFE');

    const getOpposite = (dir: Direction): Direction => {
      const opposites: Record<string, Direction> = {
        'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E',
        'NE': 'SW', 'SW': 'NE', 'NW': 'SE', 'SE': 'NW'
      };
      return opposites[dir];
    };

    // 1. 五黄殺・暗剣殺
    for (const dir of directions) {
      if (board[dir] === 5) {
        res[dir] = 'NOISE_GOU';
        res[getOpposite(dir)] = 'NOISE_ANKEN';
        break;
      }
    }

    // 2. 本命殺・的殺
    for (const dir of directions) {
      if (board[dir] === personalStar) {
        if (res[dir] === 'SAFE') res[dir] = 'NOISE_HONMEI';
        const opp = getOpposite(dir);
        if (res[opp] === 'SAFE') res[opp] = 'NOISE_TEKI';
        break;
      }
    }
    return res;
  };

  const yearLayer = processLayer(yearBoard);
  const monthLayer = processLayer(monthBoard);
  const dayLayer = processLayer(dayBoard);

  const finalVectors: any = {};
  
  // 天中殺（Void Zodiac）の方位マッピング
  // 子(N), 丑寅(NE), 卯(E), 辰巳(SE), 午(S), 未申(SW), 酉(W), 戌亥(NW)
  const z2d: Record<string, Direction[]> = {
    '子': ['N'], '丑': ['NE'], '寅': ['NE'], '卯': ['E'],
    '辰': ['SE'], '巳': ['SE'], '午': ['S'], '未': ['SW'],
    '申': ['SW'], '酉': ['W'], '戌': ['NW'], '亥': ['NW']
  };
  const voidDirs = new Set<Direction>();
  voidZodiacs.forEach(z => {
    (z2d[z] || []).forEach(d => voidDirs.add(d));
  });

  // ドラゴンヘッド/テールの侵犯方向 (交点から45度幅をノイズ帯とする)
  const nodeDirs = new Set<Direction>();
  if (lunarNodeLon !== null) {
    const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    // Ecliptic longitude to rough compass bearing (offset by 90 if N=0... usually 0 is E, 90 is N)
    // ざっくり天球上の方向: 0=E, 90=N, 180=W, 270=Sとする（黄道基準のアバウトなマップ）
    const getBearing = (lon: number) => {
      let b = (lon - 90) % 360; 
      if (b < 0) b += 360;
      // b is 0 at N, 90 at E
      b = 360 - b; 
      // Simplified: Just match angle to 8 directions (45 deg sectors)
      const i = Math.floor(((b + 22.5) % 360) / 45);
      return dirs[i];
    };
    nodeDirs.add(getBearing(lunarNodeLon));
    nodeDirs.add(getBearing((lunarNodeLon + 180) % 360));
  }
  
  // 相生関係
  const getCompatibleStars = (star: StarFrequency): StarFrequency[] => {
    switch(star) {
      case 1: return [6, 7, 3, 4]; 
      case 2: return [9, 6, 7]; 
      case 3: return [1, 9]; 
      case 4: return [1, 9];
      case 5: return [9, 6, 7];
      case 6: return [2, 5, 8, 1]; 
      case 7: return [2, 5, 8, 1];
      case 8: return [9, 6, 7];
      case 9: return [3, 4, 2, 5, 8]; 
      default: return [];
    }
  };
  
  let compatibles = getCompatibleStars(personalStar);
  
  // アクションインテントによる相生の再定義
  if (actionIntent === 'REST') {
    // 回復優先: 土や水など、自律神経を安定させる星を優先（簡易版）
    if (personalStar === 3 || personalStar === 4) compatibles = [1];
    else if (personalStar === 1) compatibles = [6, 7];
    // 他はそのまま
  } else if (actionIntent === 'BUSINESS') {
    // 発展・闘争優先: 木や火など、活性化させる星を優先
    if (personalStar === 1) compatibles = [3, 4];
    else if (personalStar === 3 || personalStar === 4) compatibles = [9];
  }

  for (const dir of directions) {
    // 優先度：1(🟥) GOU/ANKEN > 2(🟪) HONMEI/TEKI > 3(🟨) NOISE_VOID/NODE > 4(🟩) OPTIMAL > 5(🟦) SAFE
    const yStatus = yearLayer[dir]!;
    const mStatus = monthLayer[dir]!;
    const dStatus = dayLayer[dir]!;

    // Extract all noises across layers for priority sorting
    const layers = [yStatus, mStatus, dStatus];
    
    // Check for Type I Noise (Red: Gou/Anken)
    const hasRedNoise = layers.find(s => s === 'NOISE_GOU' || s === 'NOISE_ANKEN');
    
    // Check for Type II Noise (Purple: Honmei/Teki)
    const hasPurpleNoise = layers.find(s => s === 'NOISE_HONMEI' || s === 'NOISE_TEKI');

    if (hasRedNoise) {
      finalVectors[dir] = hasRedNoise as any;
    } else if (hasPurpleNoise) {
      finalVectors[dir] = hasPurpleNoise as any;
    } else if (voidDirs.has(dir)) {
      finalVectors[dir] = 'NOISE_VOID';
    } else if (nodeDirs.has(dir)) {
      finalVectors[dir] = 'NOISE_NODE';
    } else if (compatibles.includes(dayBoard[dir])) {
      finalVectors[dir] = 'OPTIMAL';
    } else {
      finalVectors[dir] = 'SAFE';
    }
  }

  return {
    yearLayer,
    monthLayer,
    dayLayer,
    finalVectors
  };
}

/**
 * 生年月日の「日干支」から個人の天中殺（Void Zodiac）を算出する。
 * （2024年1月1日を甲子＝インデックス0とする近似ロジック）
 */
export function getPersonalVoidZodiac(birthDate: Date): string[] {
  // ユリウス日を用いて日本時間の干支を正確に算出する
  // 2024年1月1日(甲子=0) の JD は約 2460310.125 (JST 0:00)
  // Math.floor(JD + 0.5) = 2460310。 2460310 % 60 = 10。
  // したがって、(Math.floor(JD + 0.5) + 50) % 60 が干支インデックスとなる。
  
  const jd = AstroEngine.getJulianDay(birthDate);
  const ganZhiIndex = (Math.floor(jd + 0.5) + 50) % 60;
  
  const gan = ganZhiIndex % 10;
  const zhi = ganZhiIndex % 12;
  
  // 天中殺グループの判定 (支 - 干)
  const voidDiff = (zhi - gan + 12) % 12;
  
  switch (voidDiff) {
    case 0: return ["戌", "亥"]; // 甲子旬
    case 10: return ["申", "酉"]; // 甲戌旬
    case 8: return ["午", "未"];  // 甲申旬
    case 6: return ["辰", "巳"];  // 甲午旬
    case 4: return ["寅", "卯"];  // 甲辰旬
    case 2: return ["子", "丑"];  // 甲寅旬
    default: return ["午", "未"]; // フォールバック
  }
}

/**
 * 日付と経度から、その時点の「年・月・日・時」の十二支（文字列）を天体物理学的に取得する
 */
export function getCurrentZodiac(date: Date, lon: number = 139.6917): { yearZodiac: string, monthZodiac: string, dayZodiac: string, hourZodiac: string } {
  // 年の干支: 木星黄経ベース（物理モデル）
  // 木星の黄経（0〜360度）を12分割し、実際の天体位置から「年の干支」を算出する。
  // 黄道0度(春分点)付近を卯とし、30度ごとに進む。
  // (例: 2026年4月頃の木星黄経は約106度 -> インデックス3 -> 「午」となる)
  const jupiterLon = AstroEngine.getJupiterLongitude(date);
  const yearIndex = Math.floor(jupiterLon / 30);
  const ZODIACS_JUPITER = ["卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子", "丑", "寅"];
  const yearZodiac = ZODIACS_JUPITER[yearIndex];
  
  // 月の干支: 太陽黄経ベース（立春(315度)から寅月が始まる）
  // 315〜345:寅(3), 345〜15:卯(4), 15〜45:辰(5)...
  const sunLon = AstroEngine.getSolarLongitude(date);
  const monthIndex = Math.floor(((sunLon + 45) % 360) / 30);
  // monthIndex 0(立春〜):寅
  const ZODIACS_MONTH = ["亥", "子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌"];
  const monthZodiac = ZODIACS_MONTH[(monthIndex + 3) % 12];
  
  // 日の干支: ユリウス日ベース
  const jd = AstroEngine.getJulianDay(date);
  const ganZhiIndex = (Math.floor(jd + 0.5) + 50) % 60;
  const zhi = ganZhiIndex % 12;
  const ZODIACS_GANZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const dayZodiac = ZODIACS_GANZHI[zhi];
  
  // 時の干支: 地方恒星時ベース
  const lst = AstroEngine.getLocalSiderealTime(date, lon);
  const hourIndex = Math.floor(lst / 2) % 12;
  const hourZodiac = ZODIACS_GANZHI[hourIndex];
  
  return { yearZodiac, monthZodiac, dayZodiac, hourZodiac };
}

