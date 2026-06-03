// Real Estate Arbitrage astrology and pin color helper functions

export const getPropertyPinColors = (prop: any) => {
  const targetDay = prop.dateScores?.[3];
  const isUltra = targetDay?.isUltraLucky;
  
  if (prop.astrologyStatus === 'OPTIMAL_BOOST') {
    // 🌟 ゴールド（超大吉）
    return {
      fillColor: "#fbbf24",
      borderColor: "#b45309",
      textClass: "text-amber-500 dark:text-amber-400 font-extrabold animate-pulse",
      bgClass: "bg-amber-500/20 border-amber-500/40 shadow-[0_0_10px_rgba(251,191,36,0.5)]",
      label: "超大吉"
    };
  }

  if (prop.astrologyStatus === 'WARNING') {
    // 🟧 オレンジ（警告・調整）
    return {
      fillColor: "#f97316",
      borderColor: "#7c2d12",
      textClass: "text-orange-500 dark:text-orange-400 font-semibold",
      bgClass: "bg-orange-500/10 border-orange-500/30",
      label: "警告"
    };
  }

  const isHeavyBad = [
    'NOISE_GOU', 
    'NOISE_ANKEN', 
    'NOISE_HA', 
    'NOISE_HONMEI', 
    'NOISE_TEKI'
  ].includes(prop.astrologyStatus);

  if (isHeavyBad) {
    // 🟥 赤（警告）
    return {
      fillColor: "#ef4444",
      borderColor: "#7f1d1d",
      textClass: "text-red-500 dark:text-red-400",
      bgClass: "bg-red-500/10 border-red-500/30",
      label: "大凶"
    };
  }

  const details = targetDay?.scoreDetails;
  const hasLightBad = (details && (details.doyouPenalty < 0 || details.voidPenalty < 0)) || 
                      ['NOISE_VOID', 'NOISE_NODE', 'NOISE_GETSUMEI', 'NOISE_GETSUTEKI'].includes(prop.astrologyStatus);
  const hasLucky = prop.isTendo || ['OPTIMAL', 'SAFE'].includes(prop.astrologyStatus) || prop.astroFlags?.some((f: string) => f.endsWith('_LINE'));

  if (isUltra) {
    // 🌟 ゴールド（超吉）
    return {
      fillColor: "#fbbf24",
      borderColor: "#b45309",
      textClass: "text-amber-500 dark:text-amber-400 font-bold",
      bgClass: "bg-amber-500/10 border-amber-500/30",
      label: "超吉"
    };
  }

  if (hasLucky && !hasLightBad) {
    // 🟩 緑（吉）
    return {
      fillColor: "#10b981",
      borderColor: "#065f46",
      textClass: "text-emerald-500 dark:text-emerald-400",
      bgClass: "bg-emerald-500/10 border-emerald-500/30",
      label: "吉"
    };
  }

  if (hasLightBad) {
    // 🟨 黄（注意）
    return {
      fillColor: "#f59e0b",
      borderColor: "#78350f",
      textClass: "text-amber-600 dark:text-amber-500",
      bgClass: "bg-amber-500/5 border-amber-500/20",
      label: "注意"
    };
  }

  // ⬜ グレー（通常・ネイビーグレー）➔ 地図と同化しないように境界線を濃く
  return {
    fillColor: "#475569", // slate-600
    borderColor: "#1e293b", // slate-900
    textClass: "text-slate-500 dark:text-slate-400",
    bgClass: "bg-slate-500/10 border-slate-500/30",
    label: "通常"
  };
};
