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
  GeoVector 
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

  // 木星の黄経 (Ecliptic Longitude of Jupiter)
  // 木星の公転周期は約11.86年であり、1サイクルが「年盤」の物理的基盤（地球上の巨大な磁気潮汐）となる。
  getJupiterLongitude(date: Date): number {
    const time = new AstroTime(date);
    const coords = Ecliptic(GeoVector(Body.Jupiter, time, true));
    return coords.elon;
  }
};

/**
 * 固有周波数（本命星）の算出：
 * 古典的な「立春」による新年切り替えも、実際には「太陽黄経(L0) = 315度」に相当。
 * 単なるカレンダーではなく、生誕時の地球と太陽の幾何学的位相から天体学的に判定する物理モデル。
 */
// 暦（Classical Calendar）ベースの算出ロジックを保持
export function getClassicalYearStar(date: Date): StarFrequency {
  const L0 = AstroEngine.getSolarLongitude(date);
  const year = date.getFullYear();
  
  // 太陽黄経が315度（極小位相ポイント）未満であれば、天体位相的には前サイクルの影響下にある
  const isPreviousCycle = (L0 < 315 && date.getMonth() < 3);
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
 * これまでの暦法（カレンダー剰余）を完全に破棄し、木星の黄道上の実際の位置（0〜360度）からベクトル量子化(1-9)する。
 * 
 * 物理的根拠:
 * 木星は太陽系最大の質量を持ち、地球の磁気圏や重力バランスに長期的な周期（約11.86年）で影響を与える。
 * 九星気学の「9年サイクル」は、木星の公転と土星との会合周期による干渉パターンのフラクタル近似であると定義。
 */
export function getYearStar(date: Date): StarFrequency {
  const jupLon = AstroEngine.getJupiterLongitude(date);
  
  // 360度を12のフラクタル・セクター（約30度ずつ）に分割
  // 木星の軌道位置がどの重力フェーズにあるかを割り出す
  const jupPhase = Math.floor(jupLon / 30);
  
  // The Jupiter 12-stage cycle reduces to the 9-cycle magnetic grid via harmonic interference
  let star = 11 - ((jupPhase + 8) % 9);
  if (star > 9) star -= 9;
  if (star <= 0) star += 9;
  
  return star as StarFrequency;
}

/**
 * Mid-term Wave (月盤) の算出：
 * 月の黄経（Moon Longitude）と太陽の黄経（Solar Longitude）の物理的・潮汐的干渉（Lunar-Solar Phase）から算出。
 * 
 * 物理的根拠:
 * 月の公転による潮汐力の変動と、地球の公転（太陽との相対位置）による季節的エネルギー変化の合成波。
 * 太陽黄経（季節）をキャリア波、月相（満ち欠け）をモジュレーション波としたAM変調モデルとして定義。
 */
export function getMonthStar(date: Date): StarFrequency {
  const sunLon = AstroEngine.getSolarLongitude(date);
  const moonLon = AstroEngine.getLunarLongitude(date);
  
  // 月と太陽の相対的な黄経差（月相・位相差）を導出
  let lunarPhaseAngle = moonLon - sunLon;
  if (lunarPhaseAngle < 0) lunarPhaseAngle += 360;

  // 12のソーラーターム（30度）と、月の位相を掛け合わせる
  const solarTerm = Math.floor(sunLon / 30);
  const lunarTerm = Math.floor(lunarPhaseAngle / 30);
  
  // 太陽と月の重力干渉波から、9つのノイズフラクタルへ圧縮
  let phase = (solarTerm * 12 + lunarTerm) % 9;
  let star = 9 - phase;
  if (star <= 0) star += 9;
  
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

export function getCurrentEnvironmentalFrequencies(date: Date) {
  const physY = getYearStar(date);
  const classY = getClassicalYearStar(date);
  const m = getMonthStar(date);
  const d = getDayStar(date);
  
  return {
    yearStar: physY,
    classicalYearStar: classY,
    monthStar: m,
    dayStar: d,
    hourStar: 5 as StarFrequency,  // Placeholder
    raw: {
      sunLon: AstroEngine.getSolarLongitude(date),
      moonLon: AstroEngine.getLunarLongitude(date),
      jupiterLon: AstroEngine.getJupiterLongitude(date)
    }
  };
}

/**
 * ベクトル衝突計算（吉凶方位の物理的割り出し）
 */
export function calculateVectorCollision(
  personalStar: StarFrequency, 
  yearBoard: BoardLayout,
  monthBoard: BoardLayout,
  dayBoard: BoardLayout
): {
  yearLayer: Partial<Record<Direction, string>>;
  monthLayer: Partial<Record<Direction, string>>;
  dayLayer: Partial<Record<Direction, string>>;
  finalVectors: Record<Direction, 'OPTIMAL' | 'SAFE' | 'NOISE_GOU' | 'NOISE_ANKEN' | 'NOISE_HONMEI' | 'NOISE_TEKI' | 'NOISE'>;
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
  const compatibles = getCompatibleStars(personalStar);

  for (const dir of directions) {
    // 優先度：NOISE > OPTIMAL > SAFE
    const yStatus = yearLayer[dir]!;
    const mStatus = monthLayer[dir]!;
    const dStatus = dayLayer[dir]!;

    if (yStatus.startsWith('NOISE')) {
      finalVectors[dir] = yStatus;
    } else if (mStatus.startsWith('NOISE')) {
      finalVectors[dir] = mStatus;
    } else if (dStatus.startsWith('NOISE')) {
      finalVectors[dir] = dStatus;
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
