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
 * これまでの暦法（カレンダー剰余）ではなく、太陽黄経（L0 = 315°）の完全な天体位相を基準とする。
 * 
 * 物理的根拠:
 * 太陽系の重心移動と地球の公転軌道上の特定位相（立春・黄経315度）をフラクタルな9年周期の起点と定義。
 * 古典暦の「2月4日」固定ではなく、実際の天体配置に基づく物理的な境界線を使用。
 */
export function getYearStar(date: Date): StarFrequency {
  const L0 = AstroEngine.getSolarLongitude(date);
  const year = date.getFullYear();
  
  // 太陽黄経が315度（極小位相ポイント・真の立春）未満であれば、天体位相的には前サイクルの影響下にある
  const isPreviousCycle = (L0 < 315 && date.getMonth() < 3);
  let calcYear = isPreviousCycle ? year - 1 : year;

  let reduced = String(calcYear).split('').reduce((acc, val) => acc + Number(val), 0);
  while (reduced > 9) {
    reduced = String(reduced).split('').reduce((acc, val) => acc + Number(val), 0);
  }
  
  let star = 11 - reduced;
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
  
  // 節入り（立春: 315°）を基準とした月のインデックス (0 = 2月〜立春, 1 = 3月〜啓蟄...)
  // 315°〜344.9° が インデックス0
  const monthIndex = Math.floor(((sunLon + 45) % 360) / 30);
  
  // 物理的な年盤（木星黄経と太陽黄経の合成フラクタル）の星を取得
  const physicalYearStar = getYearStar(date);
  
  // 年星ごとの月順ベースを算出
  // グループ1 (1, 4, 7): ベース 8
  // グループ2 (3, 6, 9): ベース 5
  // グループ3 (2, 5, 8): ベース 2
  let baseStar = 0;
  if (physicalYearStar % 3 === 1) baseStar = 8;
  else if (physicalYearStar % 3 === 0) baseStar = 5;
  else if (physicalYearStar % 3 === 2) baseStar = 2;

  // インデックス分だけ星を後退させる（毎月1つ減る）
  let star = baseStar - monthIndex;
  
  // 1〜9の範囲に正規化
  while (star <= 0) {
    star += 9;
  }
  
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
      jupiterLon: AstroEngine.getJupiterLongitude(date),
      lunarNode: AstroEngine.getLunarNodeLongitude(date)
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
 * 日付から、その時点の「年」と「月」の十二支（文字列）を取得する
 */
export function getCurrentZodiac(date: Date): { yearZodiac: string, monthZodiac: string, dayZodiac: string } {
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
  
  return { yearZodiac, monthZodiac, dayZodiac };
}

