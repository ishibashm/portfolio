"use client";

import React from "react";

// 凶要素の解説辞書
const DISASTER_EXPLANATIONS: Record<string, string> = {
  五黄殺:
    "五黄殺（ごおうさつ）：周囲を巻き込み、自滅をもたらす最大凶方位。全ての人に大凶。",
  暗剣殺:
    "暗剣殺（あんけんさつ）：突発的な事故や他者からの災難がもたらされる最大凶方位。全ての人に大凶。",
  歳破: "歳破（さいは）：時のエネルギーが壊れる方位。契約や引っ越し、旅行が大破する大凶方位。",
  日破: "日破（にっぱ）：その日の十二支と対極にある方位。交渉事や移動が破綻しやすい凶方位。",
  本命殺:
    "本命殺（ほんめいさつ）：自分自身の身体や判断ミスが元でトラブルが生じる大凶方位（個人影響）。",
  本命的殺:
    "本命的殺（ほんめいてきさつ）：目標や目的が妨害され、精神的な苦痛を受ける大凶方位（個人影響）。",
  月命殺:
    "月命殺（げつめいさつ）：身体に悪い影響が出やすい凶方位（本命殺より穏やか）。",
  月命的殺:
    "月命的殺（げつめいてきさつ）：仕事や目標が邪魔されやすい凶方位（本命的殺より穏やか）。",
  天中殺:
    "天中殺（てんちゅうさつ）：運気が停滞し、新しい行動（引っ越し・契約）を慎むべきとされる時期的な凶。",
  土用殺:
    "土用（どよう）：季節の変わり目の土用期間中。大地の気が乱れるため、引っ越しや土いじりは非推奨。",
  月交点ノイズ:
    "月交点（ノード）：天体軌道の交点による磁気・空間ノイズが発生しているエリア。",
  偏角境界:
    "偏角境界：真北と磁北の方位境界線上に位置し、磁気的なブレが生じやすい場所。",
};

interface DateScore {
  date: string; // YYYY-MM-DD
  score: number;
  status: string;
  rokuyo: string;
  luckyDays: {
    isIchiryumanbai: boolean;
    isTensho: boolean;
    isTendo: boolean;
    labels: string[];
  };
  isUltraLucky: boolean;
  weekday: number; // 0: 日, 1: 月, ...
  holiday: { isHoliday: boolean; name: string };
  scoreDetails?: {
    baseAstrologyScore: number;
    tendoBonus: number;
    sunLineBonus: number;
    venusLineBonus: number;
    jupiterLineBonus: number;
    lunarPhaseScore: number;
    doyouPenalty: number;
    voidPenalty: number;
    rawTotalScore: number;
  };
}

interface AstroGridCalendarProps {
  dateScores?: DateScore[];
  onDateChange?: (date: string) => void;
  isTransitioning?: boolean;
  enableExtendedViews?: boolean;
  /** 30days / 12months を実データで取り直すための取得関数。
   *  未指定なら 7days だけが使える（偽データは出さない）。 */
  fetchTimeline?: (range: "30days" | "12months") => Promise<DateScore[]>;
}

export function AstroGridCalendar({
  dateScores,
  onDateChange,
  isTransitioning = false,
  enableExtendedViews = true,
  fetchTimeline,
}: AstroGridCalendarProps) {
  const [rangeMode, setRangeMode] = React.useState<"7days" | "30days" | "12months">("7days");
  const [luckyOnlyFilter, setLuckyOnlyFilter] = React.useState<boolean>(false);

  // 曜日名
  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

  // 吉日ラベルの優先順位による一文字取得
  const getLuckyLabel = (day: DateScore) => {
    if (day.isUltraLucky) return "★";
    if (day.luckyDays.isTensho) return "赦";
    if (day.luckyDays.isTendo) return "道";
    if (day.luckyDays.isIchiryumanbai) return "万";
    if (day.rokuyo.includes("大安")) return "大";
    return "";
  };

  // 大吉（吉日）か判定するヘルパー
  const isLuckyDay = (day: DateScore) => {
    const details = day.scoreDetails;
    return (
      day.isUltraLucky ||
      day.luckyDays.isTensho ||
      day.luckyDays.isTendo ||
      day.luckyDays.isIchiryumanbai ||
      day.rokuyo.includes("大安") ||
      day.score >= 70 ||
      (details &&
        (details.sunLineBonus > 0 ||
          details.jupiterLineBonus > 0 ||
          details.venusLineBonus > 0))
    );
  };

  // 30days / 12months はかつて 7 日分の dateScores を循環参照して日付ラベルだけを
  // 貼り替えていた。つまり半年先として表示していた吉凶は、実際には今日±3日の
  // どれかの日のものだった（12ヶ月表示のセルが全部「01」だったのはその名残で、
  // date を毎月1日固定で作っていたため）。
  // 実際にその日付で計算した値をサーバから取り直す。
  const [extendedDays, setExtendedDays] = React.useState<DateScore[] | null>(
    null,
  );
  const [extendedLoading, setExtendedLoading] = React.useState(false);

  React.useEffect(() => {
    if (rangeMode === "7days" || !fetchTimeline) {
      setExtendedDays(null);
      return;
    }
    let cancelled = false;
    setExtendedLoading(true);
    setExtendedDays(null);
    fetchTimeline(rangeMode)
      .then((rows) => {
        if (!cancelled) setExtendedDays(rows);
      })
      .catch(() => {
        // 取得できなかったときは偽の値を描くより何も出さないほうがよい
        if (!cancelled) setExtendedDays(null);
      })
      .finally(() => {
        if (!cancelled) setExtendedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeMode, fetchTimeline]);

  // 早期 return はすべてのフックを呼んだ後で行う。
  // フックより前に return すると呼び出し順が変わってレンダリングが壊れる。
  if (!dateScores || dateScores.length === 0) return null;

  const displayedDays =
    rangeMode === "7days" ? dateScores : (extendedDays ?? []);

  // 各マスのスタイルクラスを決定
  const getBoxStyle = (day: DateScore, isToday: boolean) => {
    if (isTransitioning) {
      return "bg-stone-100/80 border border-stone-200 animate-pulse cursor-wait";
    }

    const isLucky = isLuckyDay(day);
    if (luckyOnlyFilter && !isLucky) {
      return "w-8 h-8 rounded-lg flex flex-col justify-between p-1 transition-all border border-zinc-200/20 dark:border-stone-200 opacity-25 grayscale hover:opacity-50";
    }

    let baseClass =
      "w-8 h-8 rounded-lg flex flex-col justify-between p-1 transition-all relative ";

    if (isToday) {
      baseClass +=
        "scale-105 border-2 border-rose-500 dark:border-rose-400 shadow-md shadow-rose-200 z-10 ";
    } else {
      baseClass += "border ";
    }

    if (day.isUltraLucky) {
      return (
        baseClass +
        "bg-gradient-to-br from-amber-400 to-yellow-500 text-amber-950 font-bold border-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.3)] hover:scale-110"
      );
    }

    const status = day.status;
    const details = day.scoreDetails;

    // 重い凶があるか判定
    const isHeavyBad = [
      "NOISE_GOU",
      "NOISE_ANKEN",
      "NOISE_HA",
      "NOISE_HONMEI",
      "NOISE_TEKI",
    ].includes(status);

    if (isHeavyBad) {
      return (
        baseClass +
        "bg-red-500/20 text-red-600 border-red-200 hover:bg-red-500/30 hover:scale-110"
      );
    }

    // 吉のみ (凶ゼロ) か判定
    const hasLucky =
      day.luckyDays.isTendo ||
      day.luckyDays.isIchiryumanbai ||
      day.luckyDays.isTensho ||
      day.rokuyo.includes("大安") ||
      (details &&
        (details.sunLineBonus > 0 ||
          details.venusLineBonus > 0 ||
          details.jupiterLineBonus > 0 ||
          details.lunarPhaseScore > 0));

    const hasAnyBad =
      (details && (details.doyouPenalty < 0 || details.voidPenalty < 0)) ||
      [
        "NOISE_VOID",
        "NOISE_NODE",
        "NOISE_GETSUMEI",
        "NOISE_GETSUTEKI",
      ].includes(status);

    if (hasLucky && !hasAnyBad) {
      return (
        baseClass +
        "bg-emerald-500/20 text-emerald-600 border-emerald-200 hover:bg-emerald-500/30 hover:scale-110"
      );
    }

    // 軽い凶がある場合はグレー背景（丸ドットは別途付与）
    // 通常 (グレー) の日
    return (
      baseClass +
      "bg-white/80 text-stone-500 border-stone-200 hover:bg-stone-100/80 hover:scale-110"
    );
  };

  // 曜日表示カラー
  const getWeekdayColor = (day: DateScore) => {
    if (day.holiday.isHoliday || day.weekday === 0) return "text-red-600"; // 日曜・祝日: 赤
    if (day.weekday === 6) return "text-blue-600"; // 土曜: 青
    return "text-stone-400 dark:text-stone-500";
  };

  return (
    <div className="flex flex-col gap-2 font-sans select-none">
      <div className="flex items-center justify-between gap-2 flex-wrap bg-white/70 backdrop-blur-md p-3 rounded-2xl border border-rose-100/80 shadow-xs">
        <div className="text-xs text-stone-900 font-bold tracking-tight flex items-center gap-1.5 font-serif">
          <span className="text-rose-500 font-bold">◆</span>
          <span>吉凶タイムライン・ヒートマップ</span>
          {luckyOnlyFilter && (
            <span className="text-[10px] bg-rose-500 text-stone-900 px-2 py-0.5 rounded-full font-semibold shadow-xs animate-pulse font-sans">
              大吉のみ表示中
            </span>
          )}
        </div>

        {enableExtendedViews && (
          <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold">
            <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200/80">
              <button
                onClick={() => setRangeMode("7days")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  rangeMode === "7days"
                    ? "bg-white text-stone-900 shadow-xs font-bold"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                7days
              </button>
              <button
                onClick={() => setRangeMode("30days")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  rangeMode === "30days"
                    ? "bg-white text-stone-900 shadow-xs font-bold"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                30days
              </button>
              <button
                onClick={() => setRangeMode("12months")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  rangeMode === "12months"
                    ? "bg-white text-stone-900 shadow-xs font-bold"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                12months
              </button>
            </div>

            <button
              onClick={() => setLuckyOnlyFilter(!luckyOnlyFilter)}
              className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                luckyOnlyFilter
                  ? "bg-gradient-to-r from-amber-400 to-rose-400 text-stone-900 font-bold shadow-xs"
                  : "bg-white text-stone-700 hover:bg-stone-50 border border-stone-200/80"
              }`}
              title="大吉・吉方位日のみをハイライト表示"
            >
              <span>★大吉絞込</span>
            </button>
          </div>
        )}
      </div>

      {rangeMode !== "7days" && extendedLoading && (
        <div className="text-[11px] text-stone-400 px-1 py-2">
          {rangeMode === "12months" ? "12ヶ月分" : "30日分"}の吉凶を計算中…
        </div>
      )}
      {rangeMode !== "7days" && !extendedLoading && displayedDays.length === 0 && (
        <div className="text-[11px] text-stone-400 px-1 py-2">
          この期間の吉凶を取得できませんでした。
        </div>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {displayedDays.map((day, idx) => {
          const [, monthPart, dayPart] = day.date.split("-");
          // 12ヶ月表示で日部分を出すと全セルが同じ数字になる。月を出す。
          const dayNum = rangeMode === "12months" ? `${Number(monthPart)}月` : dayPart;
          // 7days / 30days は先頭から4番目が対象日。12months に対象日の概念は無い。
          const isToday = rangeMode !== "12months" && idx === 3;

          const tooltipTitle = `${day.date} (${WEEKDAYS[day.weekday]}${day.holiday.isHoliday ? `・${day.holiday.name}` : ""})`;
          const lucksList = [
            day.rokuyo,
            ...(day.luckyDays.isIchiryumanbai ? ["一粒万倍日"] : []),
            ...(day.luckyDays.isTensho ? ["天赦日"] : []),
            ...(day.luckyDays.isTendo ? ["天道方位"] : []),
          ].join(" ・ ");

          // 軽い凶があるかチェック
          const details = day.scoreDetails;
          const hasLightBad =
            (details &&
              (details.doyouPenalty < 0 || details.voidPenalty < 0)) ||
            [
              "NOISE_VOID",
              "NOISE_NODE",
              "NOISE_GETSUMEI",
              "NOISE_GETSUTEKI",
            ].includes(day.status);

          const isHeavyBad = [
            "NOISE_GOU",
            "NOISE_ANKEN",
            "NOISE_HA",
            "NOISE_HONMEI",
            "NOISE_TEKI",
          ].includes(day.status);

          // 軽い凶があるが重い凶がない場合、黄ドットを表示
          const showYellowDot = hasLightBad && !isHeavyBad && !isTransitioning;

          // ツールチップの計算内訳式と凶要素の解説
          const renderTooltipDetails = () => {
            if (!details) return null;

            // 計算式のテキスト組み立て
            const parts: string[] = [];
            parts.push(`${details.baseAstrologyScore} (基本方位)`);
            if (details.tendoBonus > 0)
              parts.push(`+${details.tendoBonus} (天道)`);
            if (details.jupiterLineBonus > 0)
              parts.push(`+${details.jupiterLineBonus} (木星ライン)`);
            if (details.venusLineBonus > 0)
              parts.push(`+${details.venusLineBonus} (金星ライン)`);
            if (details.sunLineBonus > 0)
              parts.push(`+${details.sunLineBonus} (太陽ライン)`);
            if (details.lunarPhaseScore > 0)
              parts.push(`+${details.lunarPhaseScore} (月相加点)`);
            else if (details.lunarPhaseScore < 0)
              parts.push(`${details.lunarPhaseScore} (月相減点)`);

            if (details.doyouPenalty < 0)
              parts.push(`${details.doyouPenalty} (土用期間)`);
            if (details.voidPenalty < 0)
              parts.push(`${details.voidPenalty} (天中殺)`);

            const rawSum = details.rawTotalScore;
            const clipInfo =
              rawSum > 100
                ? " ➔ 100点(最大値)"
                : rawSum < 0
                  ? " ➔ 0点(最小値)"
                  : "";

            // 凶要素の解説のリストアップ
            const badFactors: string[] = [];
            if (day.status === "NOISE_GOU") badFactors.push("五黄殺");
            if (day.status === "NOISE_ANKEN") badFactors.push("暗剣殺");
            if (day.status === "NOISE_HA") badFactors.push("歳破");
            if (day.status === "NOISE_HONMEI") badFactors.push("本命殺");
            if (day.status === "NOISE_TEKI") badFactors.push("本命的殺");
            if (day.status === "NOISE_GETSUMEI") badFactors.push("月命殺");
            if (day.status === "NOISE_GETSUTEKI") badFactors.push("月命的殺");
            if (day.status === "NOISE_VOID" || details.voidPenalty < 0)
              badFactors.push("天中殺");
            if (details.doyouPenalty < 0) badFactors.push("土用殺");
            if (day.status === "NOISE_NODE") badFactors.push("月交点ノイズ");

            return (
              <div className="space-y-2 border-t border-stone-200 pt-2 mt-2">
                {/* 算出内訳 */}
                <div>
                  <div className="text-stone-400 font-bold uppercase text-[9px] tracking-wider mb-0.5">
                    吉凶の内訳式:
                  </div>
                  <div className="text-[9.5px] font-mono text-stone-600 leading-normal">
                    {parts.join(" ")} = {rawSum}点{clipInfo}
                  </div>
                </div>

                {/* 凶要素の解説 */}
                {badFactors.length > 0 && (
                  <div className="space-y-1 pt-1.5 border-t border-stone-200">
                    <div className="text-red-600 font-bold text-[9px] tracking-wider mb-0.5">
                      注意すべき凶兆:
                    </div>
                    {badFactors.map((factor) => (
                      <div
                        key={factor}
                        className="text-stone-500 text-[8.5px] leading-relaxed pl-1.5 border-l border-red-200"
                      >
                        {DISASTER_EXPLANATIONS[factor] ||
                          `${factor}の影響があります。`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          };

          return (
            <div
              key={day.date}
              className="group relative cursor-pointer"
              onClick={() => {
                if (onDateChange && !isTransitioning) {
                  onDateChange(day.date);
                }
              }}
            >
              {/* マスの真上の ▼ インジケーター */}
              {isToday && !isTransitioning && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-indigo-500 text-[9px] leading-none animate-bounce font-bold">
                  ▼
                </div>
              )}

              {/* カレンダーマス */}
              <div className={getBoxStyle(day, isToday)}>
                {/* 1. 日付の数字 (曜日カラー) */}
                <div
                  className={`text-[9px] font-bold ${getWeekdayColor(day)} leading-none`}
                >
                  {dayNum}
                </div>
                {/* 2. 軽い凶の黄ドット 🟡 or 吉兆文字 */}
                <div className="flex justify-between items-end w-full leading-none mt-1">
                  {showYellowDot ? (
                    <span
                      className="text-[12px] text-yellow-400 leading-none"
                      title="注意すべき軽い凶兆があります"
                    >
                      ●
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="text-[9px] font-extrabold text-right leading-none self-end">
                    {getLuckyLabel(day)}
                  </span>
                </div>
              </div>

              {/* ツールチップ (ホバー表示, Leaflet等のポップアップに埋もれないよう超高zIndex) */}
              <div className="absolute bottom-11 left-1/2 -translate-x-1/2 w-64 bg-white/80 border border-stone-200 rounded-xl p-3.5 shadow-2xl text-[10px] text-stone-600 leading-normal pointer-events-none hidden group-hover:block z-[9999] backdrop-blur-md">
                {/* 日付ヘッダー */}
                <div className="font-bold text-stone-900 border-b border-stone-200 pb-1.5 mb-1.5 flex justify-between items-center text-xs">
                  <span>{tooltipTitle}</span>
                  {isToday && (
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200">
                      指定日
                    </span>
                  )}
                </div>

                {/* 暦情報 */}
                <div className="mb-2 text-stone-600">
                  <div className="text-stone-400 font-bold uppercase text-[9px] tracking-wider mb-0.5">
                    当日の暦注:
                  </div>
                  <div className="font-semibold text-stone-900">
                    {lucksList || "特別な暦注なし"}
                  </div>
                </div>

                {/* 吉日解説 */}
                <div className="space-y-1.5 text-[9.5px]">
                  {day.rokuyo.includes("大安") && (
                    <div className="flex gap-1 text-stone-500">
                      <span className="font-bold text-amber-500">大安:</span>
                      <span>「大いに安し」万事進むに良い吉日</span>
                    </div>
                  )}
                  {day.luckyDays.isIchiryumanbai && (
                    <div className="flex gap-1 text-stone-500">
                      <span className="font-bold text-emerald-600">
                        一粒万倍日:
                      </span>
                      <span>一粒の籾が万倍に実る、事始めに最適な日</span>
                    </div>
                  )}
                  {day.luckyDays.isTensho && (
                    <div className="flex gap-1 text-stone-500">
                      <span className="font-bold text-yellow-400">天赦日:</span>
                      <span>天が万物の罪を許す、暦上最上の大吉日</span>
                    </div>
                  )}
                  {day.luckyDays.isTendo && (
                    <div className="flex gap-1 text-stone-500">
                      <span className="font-bold text-amber-600">★天道:</span>
                      <span>
                        その月の最大吉方位。すべての人に大吉をもたらす
                      </span>
                    </div>
                  )}
                  {day.isUltraLucky && (
                    <div className="flex gap-1 text-yellow-400 font-bold border border-yellow-500/25 bg-yellow-500/5 rounded p-1 text-[9px] mt-1.5">
                      <span>※複数の大吉兆が重なる「超ウルトラ吉日」です！</span>
                    </div>
                  )}
                </div>

                {/* 算出内訳式 ＆ 凶要素解説 */}
                {renderTooltipDetails()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
