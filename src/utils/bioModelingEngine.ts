/**
 * Bio-Magnetic Modeling Engine
 * データサイエンティストとしての知見を反映した、自律神経負荷(ANS Load)および環境順化(Shield Capacity)の汎用計算モジュール。
 * 個人の出生地、現在地、生体データベースライン、宇宙天気、概日リズムなどを複合的・非線形にモデリングする。
 * 将来的に、全ユーザー共通で「入力されたパラメータのみ」からその人専用の適応負荷を計算するアルゴリズムとして機能します。
 */

export interface BioModelParams {
  // 生体データ (現在値)
  currentHRV: number;
  currentGSR: number;
  
  // 生体データ (ベースライン: 個人の過去N日間の平均と標準偏差。将来のDB連携用)
  baselineHRVMean?: number;
  baselineHRVStd?: number;
  baselineGSRMean?: number;
  baselineGSRStd?: number;

  // ハードウェア（出生地）座標
  birthLat: number;
  birthLon: number;
  
  // 現在拠点座標
  currentLat: number;
  currentLon: number;

  // 現在地の標高(m)
  elevation: number;

  // 環境パラメータ
  kpIndex: number; // 0-9
  solarTimeHours: number; // 0.0 - 24.0 (太陽時)

  // 順化パラメータ
  baseSyncDays: number; // 滞在日数
}

export interface BioModelResult {
  ansLoad: number; // 0-100 (負荷率)
  shieldCapacity: number; // 0-100 (順化・防御力)
  zScoreHRV: number; // 個人のベースラインに対するズレ
  hardwareDisplacementPenalty: number; // 出生地からの磁場変位負荷
  circadianMultiplier: number; // 概日リズムによる脆弱性倍率
}

/**
 * 2点間の距離(km)をハバースサイン公式で計算（磁場変位の近似に利用）
 */
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // 地球の半径(km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function calculateBioMetrics(params: BioModelParams): BioModelResult {
  const {
    currentHRV,
    currentGSR,
    baselineHRVMean = 60, // デフォルトの健康な成人のHRVを仮定
    baselineHRVStd = 15,
    baselineGSRMean = 5,
    baselineGSRStd = 2,
    birthLat,
    birthLon,
    currentLat,
    currentLon,
    elevation,
    kpIndex,
    solarTimeHours,
    baseSyncDays
  } = params;

  // 1. 個人の生体ベースライン（Z-score化）
  // HRVは高いほど良い（副交感神経優位）、低いほど負荷が高い。Zスコアを反転させて負荷とする。
  const zScoreHRV = (currentHRV - baselineHRVMean) / baselineHRVStd;
  // Zスコアがマイナス (平均より低い) でペナルティ発生。1Z下がるごとに+15%負荷
  const hrvPenalty = Math.max(0, -zScoreHRV * 15); 

  // GSR（皮膚電気活動/発汗）は高いほど交感神経興奮・ストレス
  const zScoreGSR = (currentGSR - baselineGSRMean) / baselineGSRStd;
  const gsrPenalty = Math.max(0, zScoreGSR * 10); // 1Z上がるごとに+10%負荷

  // 2. 出生地磁気と現在地の「ベクトル差分（Displacement）」によるハードウェア変位負荷
  // 緯度が離れるほど、伏角（地磁気の傾き）が大きく変わり、自律神経への影響が大きい。
  // 簡易的にハバースサイン距離(km)を用いて、1000km離れるごとにベース負荷が上がるモデルとする。
  const distanceKm = calculateHaversineDistance(birthLat, birthLon, currentLat, currentLon);
  // 出生地から離れているほど、生物学的ハードウェアとしての基礎負荷(アロスタティック負荷)が恒常的にかかる
  const hardwareDisplacementPenalty = Math.min(30, (distanceKm / 1000) * 2.5); // 最大30%

  // 3. 環境順化の非線形モデリング（Exponential Decay）
  // 時定数 tau = 14日。2週間で約63%順化、4週間で86%順化する指数関数曲線。
  // 順化度が上がると、ハードウェア変位負荷（Displacement Penalty）を軽減できる
  const tau = 14.0;
  const shieldCapacity = 100 * (1 - Math.exp(-baseSyncDays / tau));
  const normalizedShield = shieldCapacity / 100; // 0.0 - 1.0

  // 順化による変位負荷の軽減（完全に100%順化しても変位による根本的な負荷は20%残る、というモデリング）
  const activeDisplacementPenalty = hardwareDisplacementPenalty * (1 - normalizedShield * 0.8);

  // 4. 概日リズム（Circadian Rhythm）の重み付け
  // 太陽時における夜間（18:00〜06:00）は副交感神経が優位であるべき時間帯。
  // この時間に外部刺激（磁気嵐など）を受けると、体内時計へのダメージが大きく脆弱性が増す（Vulnerability Multiplier）。
  // 昼の12時が最も強く(1.0)、夜中の0時が最も脆弱(1.5)となるコサインカーブモデル
  const circadianMultiplier = 1.25 - 0.25 * Math.cos((solarTimeHours - 12) * Math.PI / 12);

  // 5. 宇宙天気・環境変数の相互作用（Synergistic Effects）
  // 標高ペナルティ (1000m以上から酸素分圧低下による交感神経負荷)
  const elevationPenalty = elevation > 1000 ? ((elevation - 1000) / 500) * 5 : 0;
  
  // 磁気嵐ペナルティ (Kp > 3)
  const kpBasePenalty = Math.max(0, (kpIndex - 3) * 8);

  // 非線形相互作用：標高が高い（低酸素）状態で磁気嵐（高Kp）が来ると、単なる足し算以上に自律神経にダメージを与える。
  // 両方のペナルティがある場合、30%の相乗ダメージを加算。
  const synergisticEnvironmentLoad = (kpBasePenalty + elevationPenalty) * (1 + (kpBasePenalty > 0 && elevationPenalty > 0 ? 0.3 : 0));

  // 総合環境負荷に概日リズム（夜間脆弱性）の倍率を掛ける
  const finalEnvironmentLoad = synergisticEnvironmentLoad * circadianMultiplier;

  // 6. 総合 ANS Load の算出
  // ベースロード(10) + 生体基礎ペナルティ + 順化考慮済みの変位ペナルティ + 概日リズム考慮済みの環境負荷
  let totalAnsLoad = 10 + hrvPenalty + gsrPenalty + activeDisplacementPenalty + finalEnvironmentLoad;
  
  // シールド容量による最終軽減（最大-15%）
  totalAnsLoad -= (shieldCapacity * 0.15);

  // 0-100にクランプ
  const finalAnsLoad = Math.round(Math.min(100, Math.max(0, totalAnsLoad)));

  return {
    ansLoad: finalAnsLoad,
    shieldCapacity: Math.round(shieldCapacity),
    zScoreHRV,
    hardwareDisplacementPenalty,
    circadianMultiplier
  };
}
