"use client";

/**
 * ホームの「4. 相談」タブの中身（Ephemeris Engine Diagnostics）。
 *
 * SolarTimeClock は 8,000 行を超えていて、タブ 1 つ直すにもファイル
 * 全体を追う必要があった（利用者の要望でタブごとに分割）。中身は
 * SolarTimeClock から移しただけで、計算・表示は 1 つも変えていない。
 * 参照している値はすべて props で受ける。状態の持ち主は今までどおり
 * SolarTimeClock（タブを跨いで同じ値を見るため）。
 */

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { directionFromBearing } from "../../utils/directionGeo";
import type {
  BoardLayout,
  Direction,
  EightDirection,
  StarFrequency,
} from "../../utils/ephemerisEngine";
import type {
  getCurrentEnvironmentalFrequencies,
  getCurrentZodiac,
  getHonmeiStar,
} from "../../utils/ephemerisEngine";

/**
 * 数式（KaTeX）。このタブの計算式の内訳でしか使わないので、開くまで
 * 読み込まない（SolarTimeClock に居たときと同じ扱い）。
 */
const InlineMath = dynamic(() => import("../MathFormula"), {
  ssr: false,
  loading: () => (
    <span className="text-[10px] text-stone-600 font-mono">
      [ 数式を読込中 ]
    </span>
  ),
});

/**
 * 層（年盤・月盤・日盤・最終判定）のうち、このタブが読む枝だけの形。
 *
 * 実体は ephemerisEngine の複数の関数が返す。それぞれ戻り値の注釈に
 * 同じ形のリテラル直和を別々に書いているため、片方の ReturnType で
 * 受けるともう片方が「同名の別の型」として弾かれる。ここは表示する
 * だけなので、値の型は string で受ける。
 */
export type Layers = {
  yearLayer: Partial<Record<Direction, string>>;
  monthLayer: Partial<Record<Direction, string>>;
  dayLayer: Partial<Record<Direction, string>>;
  /* 実データは八方位しか無い（backlog 8 節）。CENTER 込みを要求すると
     計算元（SolarTimeClock の filterLayerData）から受け取れなくなる。 */
  finalVectors: Record<EightDirection, string>;
  /** 天道の方位。無い日は undefined。 */
  tendoDirection?: Direction | null;
};

const getVectorBreakdown = (
  dir: Direction,
  // 盤は出せない日がある（生年月日が未入力など）。呼び出し側から null が来る。
  board: BoardLayout | null,
  personalStar: StarFrequency,
  personalVoidZodiac: string[],
  layerType: "year" | "month" | "day" | "final",
  currentZodiac: {
    yearZodiac: string;
    monthZodiac: string;
    dayZodiac: string;
    hourZodiac: string;
  },
  lunarNodeLon: number | null,
): { environmental: string; personal: string } => {
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

  const clashMap: Record<string, string> = {
    子: "午",
    丑: "未",
    寅: "申",
    卯: "酉",
    辰: "戌",
    巳: "亥",
    午: "子",
    未: "丑",
    申: "寅",
    酉: "卯",
    戌: "辰",
    亥: "巳",
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

  const envFactors: string[] = [];

  if (board) {
    if (board[dir] === 5) {
      envFactors.push("五黄殺");
    }
    const oppositeDir = getOpposite(dir);
    if (board[oppositeDir] === 5) {
      envFactors.push("暗剣殺");
    }
  }

  const checkHa = (zodiac: string) => {
    const clashZodiac = clashMap[zodiac];
    if (clashZodiac) {
      const dirs = z2d[clashZodiac] || [];
      return dirs.includes(dir);
    }
    return false;
  };

  if (layerType === "year" || layerType === "final") {
    if (checkHa(currentZodiac.yearZodiac)) envFactors.push("歳破");
  }
  if (layerType === "month" || layerType === "final") {
    if (checkHa(currentZodiac.monthZodiac)) envFactors.push("月破");
  }
  if (layerType === "day" || layerType === "final") {
    if (checkHa(currentZodiac.dayZodiac)) envFactors.push("日破");
  }

  if (lunarNodeLon !== null) {
    const getBearing = (lon: number) => {
      let b = (lon - 90) % 360;
      if (b < 0) b += 360;
      b = 360 - b;
      // 区切りは伝統区分で固定。ephemerisEngine 側の月交点判定と揃える。
      return directionFromBearing(((b % 360) + 360) % 360, "traditional");
    };
    const nodeDir = getBearing(lunarNodeLon);
    const oppNodeDir = getBearing((lunarNodeLon + 180) % 360);
    if (dir === nodeDir || dir === oppNodeDir) {
      envFactors.push("月交点");
    }
  }

  const environmental =
    envFactors.length > 0 ? envFactors.join("・") : "通常 (SAFE)";

  const persFactors: string[] = [];

  if (board) {
    if (board[dir] === personalStar) {
      persFactors.push("本命殺");
    }
    const oppositeDir = getOpposite(dir);
    if (board[oppositeDir] === personalStar) {
      persFactors.push("的殺");
    }
  }

  const personalVoidDirs = new Set<Direction>();
  personalVoidZodiac.forEach((z) => {
    (z2d[z] || []).forEach((d) => personalVoidDirs.add(d));
  });
  if (personalVoidDirs.has(dir)) {
    persFactors.push("天中殺");
  }

  if (board && persFactors.length === 0) {
    const compatibles = getCompatibleStars(personalStar);
    if (compatibles.includes(board[dir])) {
      persFactors.push("吉方位");
    }
  }

  const personal =
    persFactors.length > 0 ? persFactors.join("・") : "通常 (SAFE)";

  return { environmental, personal };
};

export interface ConsultPanelProps {
  honmeiStar: ReturnType<typeof getHonmeiStar> | null;
  env: ReturnType<typeof getCurrentEnvironmentalFrequencies> | null;
  birthEnv: ReturnType<typeof getCurrentEnvironmentalFrequencies> | null;
  layers: Layers | null;
  physicalLayers: Layers | null;
  classicalLayers: Layers | null;
  physicalYearBoard: BoardLayout | null;
  physicalMonthBoard: BoardLayout | null;
  physicalDayBoard: BoardLayout | null;
  classicalDayBoard: BoardLayout | null;
  classicalMonthBoard: BoardLayout | null;
  classicalYearBoard: BoardLayout | null;
  useClassicalBoard: boolean;
  /** 天中殺の十二支（上書き適用後）。TooltipCell の内訳文で使う。 */
  personalVoidZodiac: string[];
  /** 評価時点の年月日の十二支。同上。 */
  currentZodiac: ReturnType<typeof getCurrentZodiac>;
}

export function ConsultPanel({
  honmeiStar,
  env,
  birthEnv,
  layers,
  physicalLayers,
  classicalLayers,
  physicalYearBoard,
  physicalMonthBoard,
  physicalDayBoard,
  classicalDayBoard,
  classicalMonthBoard,
  classicalYearBoard,
  useClassicalBoard,
  personalVoidZodiac,
  currentZodiac,
}: ConsultPanelProps) {
  /**
   * 数式の展開の開閉。タブ内で閉じる状態なので、持ち主もタブに移した
   * （SolarTimeClock に居たときは全タブ分の state が本体に積まれていた）。
   */
  const [showAstrophysicalLogic, setShowAstrophysicalLogic] = useState(false);

  const renderMatrixCell = (
    dir: string,
    // 盤の升目の星。呼び出し側は physicalYearBoard.SE のように盤から引く。
    star: StarFrequency,
    // その方位の状態。層（yearLayer など）は方位を持たない日があるので undefined が来る。
    status: string | undefined,
    isCenter: boolean = false,
  ) => {
    // 受け口は string だったが、呼び出しは status（undefined あり）を
    // そのまま渡していた。先頭の !s が既に undefined を受けているので、
    // 実際に来る値に型を合わせるだけ。
    const getColorClass = (s: string | undefined) => {
      if (!s) return "text-stone-600";
      if (s.startsWith("NOISE_GOU") || s.startsWith("NOISE_ANKEN"))
        return "text-red-500 font-bold bg-red-50 border-red-200";
      if (
        s.startsWith("NOISE_HONMEI") ||
        s.startsWith("NOISE_TEKI") ||
        s.startsWith("NOISE_GETSUMEI") ||
        s.startsWith("NOISE_GETSUTEKI")
      )
        return "text-[#a855f7] font-bold bg-[#a855f7]/10 border-[#a855f7]/30";
      if (s.startsWith("NOISE_VOID"))
        return "text-stone-600 bg-white border-stone-300";
      if (s.startsWith("NOISE_NODE"))
        // 以前は文字が yellow-400、地が yellow-950/30 だった。暗い地に
        // 明るい黄色というダークテーマの組み合わせで、明るい地の
        // この画面では**白地に乗って 1.53:1** しか無く読めなかった。
        // amber-700 は 5.02:1（本文に要る 4.5:1 を満たす）。
        return "text-amber-700 font-bold bg-amber-50 border-amber-200";
      if (s === "OPTIMAL")
        return "text-emerald-600 font-bold bg-emerald-50 border-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.2)]";
      if (s === "OPTIMAL_REGULAR")
        return "text-emerald-500 font-bold bg-emerald-50 border-emerald-200 shadow-[0_0_4px_rgba(16,185,129,0.1)]";
      return "text-blue-600 bg-blue-50 border-blue-200";
    };

    const baseClass = isCenter
      ? "bg-white/80 border-stone-200 text-stone-600"
      : "bg-white/70 border-stone-200";
    const colorClass = isCenter ? "" : getColorClass(status);

    return (
      <div
        className={`p-1 flex flex-col items-center justify-center border rounded-xl transition-all ${baseClass} ${colorClass}`}
      >
        <span className="text-[9px] text-stone-600 uppercase tracking-widest">
          {dir}
        </span>
        <span
          className={`text-lg sm:text-xl font-mono font-bold leading-none my-0.5 ${isCenter ? "text-stone-600" : ""}`}
        >
          {star || "-"}
        </span>
        {!isCenter && status && (
          <span className="text-[9px] uppercase tracking-tighter opacity-80 leading-none">
            {status.replace("NOISE_", "")}
          </span>
        )}
      </div>
    );
  };

  const TooltipCell = ({
    status,
    board,
    isFinal,
    layerType,
    dir,
    isClassical,
  }: {
    status: string;
    // #219 と同じ。盤を出せない日は呼び出し側から null が来る。
    board: BoardLayout | null;
    isFinal?: boolean;
    layerType: "year" | "month" | "day" | "final";
    dir: Direction;
    isClassical: boolean;
  }) => {
    const getColor = (s: string) => {
      if (s === "NOISE_GOU" || s === "NOISE_ANKEN")
        return "text-red-500 font-bold";
      if (
        s === "NOISE_HONMEI" ||
        s === "NOISE_TEKI" ||
        s === "NOISE_GETSUMEI" ||
        s === "NOISE_GETSUTEKI"
      )
        return "text-[#a855f7] font-bold";
      if (s === "NOISE_VOID")
        return "text-stone-600 font-bold drop-shadow-[0_0_3px_rgba(0,0,0,1)] bg-stone-50 px-1 border border-stone-200";
      // 1.53:1 で読めなかった 黄色 を amber-700（5.02:1）へ。
      if (s === "NOISE_NODE") return "text-amber-700 font-bold";
      if (s === "NOISE_HA") return "text-rose-600 font-bold";
      if (s === "OPTIMAL")
        return "text-emerald-600 font-bold drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]";
      if (s === "OPTIMAL_REGULAR")
        return "text-emerald-500 font-medium drop-shadow-[0_0_2px_rgba(16,185,129,0.4)]";
      if (s === "WARNING") return "text-orange-600 font-bold";
      return "text-blue-600";
    };

    const formatLabel = (s: string) => {
      if (s === "NOISE_GOU" || s === "NOISE_ANKEN") return "TYPE_I_NOISE";
      if (
        s === "NOISE_HONMEI" ||
        s === "NOISE_TEKI" ||
        s === "NOISE_GETSUMEI" ||
        s === "NOISE_GETSUTEKI"
      )
        return "TYPE_II_NOISE";
      if (s === "NOISE_VOID") return "VOID_ZONE";
      if (s === "NOISE_NODE") return "LUNAR_NODE";
      if (s === "NOISE_HA") return "CLASH_HA";
      if (s === "OPTIMAL_REGULAR") return "LUCKY_ZONE";
      if (s === "WARNING") return "WARNING_ZONE";
      return s;
    };

    const label = formatLabel(status);
    if (!honmeiStar) return <span>{label}</span>;
    let title = "🟦 通常ゾーン (SAFE)";
    let desc =
      "致命的な定在波やノイズは観測されていません。標準ベースラインです。";
    if (status === "NOISE_GOU") {
      title = "🟥 非推奨ベクトル (TYPE I)";
      desc = "強力な環境ノイズ帯。重大な行動阻害リスクが観測されています。";
    } else if (status === "NOISE_ANKEN") {
      title = "🟥 非推奨ベクトル (TYPE I)";
      desc = "外部からの突発的干渉ノイズが観測される行動阻害エリアです。";
    } else if (status === "NOISE_HONMEI") {
      title = "🟥 非推奨ベクトル (TYPE II)";
      desc =
        "あなたの固有波長との共鳴過負荷(オーバーヒート)が起きる干渉帯です。";
    } else if (status === "NOISE_TEKI") {
      title = "🟥 非推奨ベクトル (TYPE II)";
      desc = "目標・方向性に対するダイレクトな干渉ノイズが発生するエリアです。";
    } else if (status === "NOISE_GETSUMEI") {
      title = "🟪 月命殺 (GETSUMEI)";
      desc =
        "あなたの月命星との共鳴干渉エリアです。身体や精神に微細な不協和音を招きやすいノイズ帯です。";
    } else if (status === "NOISE_GETSUTEKI") {
      title = "🟪 月的殺 (GETSUTEKI)";
      desc =
        "あなたの月命星の対向位置にあたる干渉エリアです。目標設定や契約に微妙な混乱を招きやすいノイズ帯です。";
    } else if (status === "NOISE_VOID") {
      title = "⬛ 虚無・ボイド空間 (VOID ZONE)";
      desc =
        "あなたの天中殺（空亡）に該当する構造的エラー領域です。空間の吉凶に関わらず行動がリセットされます。";
    } else if (status === "NOISE_NODE") {
      title = "🟨 月交点 (LUNAR NODE)";
      desc =
        "日食・月食ラインの特異点。精神や自律神経に異常干渉を起こしやすいエリアです。";
    } else if (status === "NOISE_HA") {
      title = "🟥 破壊ノイズ・破 (CLASH HA)";
      desc =
        "十二支の対衝（対向）位置による強力な不整合波。「歳破」「月破」「日破」のいずれかに該当し、行動や進捗を破壊・頓挫させる極めて危険なユニバーサルノイズです。";
    } else if (status === "OPTIMAL") {
      title = "🌟 最大吉方位 (MAX OPTIMAL)";
      desc = "本命星と月命星の双方が相生・比和する最強の開運方位です。";
    } else if (status === "OPTIMAL_REGULAR") {
      title = "🟢 吉方位 (LUCKY)";
      desc = "あなたの本命星と相生・比和する、運気を高める良好な方位です。";
    } else if (status === "WARNING") {
      title = "🟧 警告・調整ゾーン (WARNING)";
      desc =
        "環境ノイズ（五黄殺等）が観測されていますが、天道効果により部分的に相殺・緩和されています。注意して選択してください。";
    }

    const isTendoDir =
      (isClassical ? classicalLayers : physicalLayers)?.tendoDirection === dir;

    return (
      <div className="group relative cursor-help inline-block">
        <span
          className={`${getColor(status)} border-b border-stone-300 hover:border-current`}
        >
          {label}
        </span>
        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-stone-50 border border-stone-300 text-stone-600 text-[9px] shadow-2xl z-50 rounded-xl font-sans normal-case leading-relaxed pointer-events-none">
          <div
            className={`font-bold mb-1 border-b border-stone-200 pb-1 ${getColor(status)}`}
          >
            {title}
          </div>
          <div className="text-stone-500 mb-1 leading-tight">{desc}</div>
          {isTendoDir && (
            <div className="text-[10px] text-emerald-600 font-bold mb-1 bg-emerald-50 p-1 border border-emerald-200 rounded-xs">
              ✨ 天道波動重畳中
              (吉殺効果により本命殺・的殺等の個人的凶殺を無害化)
            </div>
          )}
          {(() => {
            const activeBoardForBreakdown = isFinal
              ? useClassicalBoard
                ? classicalDayBoard
                : physicalDayBoard
              : board;
            const br = getVectorBreakdown(
              dir,
              activeBoardForBreakdown,
              useClassicalBoard ? honmeiStar!.classical : honmeiStar!.physical,
              personalVoidZodiac,
              layerType,
              currentZodiac,
              env?.raw?.lunarNode ?? null,
            );
            return (
              <div className="text-[7.5px] text-stone-600 font-mono mt-1.5 pt-1.5 border-t border-stone-200 space-y-0.5">
                <div className="flex justify-between">
                  <span>【環境要因】:</span>{" "}
                  <span
                    className={
                      br.environmental.includes("通常")
                        ? "text-blue-600"
                        : "text-rose-600 font-bold"
                    }
                  >
                    {br.environmental}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>【生体相性】:</span>{" "}
                  <span
                    className={
                      br.personal.includes("通常")
                        ? "text-stone-600"
                        : br.personal.includes("吉")
                          ? "text-emerald-600 font-bold"
                          : "text-purple-600 font-bold"
                    }
                  >
                    {br.personal}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="w-full flex flex-col items-center space-y-8 animate-fade-in">
        {/*
            AI コンシェルジュ（ExpertCouncilPanel）はここにあったが削除した。
            引越しの方位とタイミングというサイトの目的から外れており、
            かつ利用者の指示でサイト全体の配色を書き換えられる唯一の経路
            だった（agentTheme への書き込み）。広告を載せるページに、
            訪問者の操作で見た目が変わる仕組みは残さない。
            このタブには下の Ephemeris Engine Diagnostics が残る。
          */}

        <div className="mt-8 flex flex-col gap-4 border-b border-stone-200 pb-4 w-full max-w-[1700px]">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[10px] uppercase font-mono tracking-[0.3em] text-purple-600">
              Ephemeris Engine Diagnostics
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Birth Imprint Data (Hardware Init) */}
            <div className="border border-stone-200 bg-white/80 p-4 flex flex-col gap-4 relative overflow-hidden group">
              {/* Decorative background element */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

              <div className="flex flex-col gap-1 border-b border-stone-200 pb-2">
                <div className="text-[11px] text-stone-600 font-bold uppercase tracking-widest flex items-center gap-2">
                  <span className="text-purple-500">▶</span> 初期設定{" "}
                  <span className="text-stone-600 font-normal">
                    (出生ベクトル / Birth Vector)
                  </span>
                </div>
                <div className="text-[9px] text-stone-600 font-sans leading-tight">
                  生年月日から算出されたあなた固有のベース波長（初期設定）
                </div>
              </div>

              <div className="flex flex-col gap-3 z-10">
                <div className="bg-white/70 border border-purple-200 p-3 flex flex-col w-full rounded-xl">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">
                      Honmei Star
                    </span>
                    <span className="text-[10px] text-purple-600 bg-purple-500/10 px-1 border border-purple-200">
                      BASE FREQUENCY
                    </span>
                  </div>
                  <div className="flex items-end gap-3 mt-1">
                    <div className="flex flex-col">
                      <span className="text-2xl font-bold font-mono text-emerald-600 leading-none">
                        {honmeiStar?.physical}
                      </span>
                      <span className="text-[9px] text-stone-500 mt-1">
                        Physical (物理/天文学)
                      </span>
                    </div>
                    <div className="w-px h-8 bg-stone-100"></div>
                    <div className="flex flex-col">
                      <span className="text-xl font-bold font-mono text-stone-600 leading-none">
                        {honmeiStar?.classical}
                      </span>
                      <span className="text-[9px] text-stone-600 mt-1">
                        Class (古典暦)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/70 border border-stone-200 p-2 flex flex-col rounded-xl">
                    <span className="text-[9px] text-stone-500 uppercase tracking-widest mb-1">
                      Year
                    </span>
                    <div className="flex items-baseline gap-1 font-mono">
                      <span className="text-lg text-purple-600 font-bold">
                        {birthEnv?.yearStar}
                      </span>
                      <span className="text-[10px] text-stone-600">/</span>
                      <span className="text-sm text-stone-600">
                        {birthEnv?.classicalYearStar}
                      </span>
                    </div>
                    <span className="text-[10px] text-stone-600 mt-1">
                      Phys / Class
                    </span>
                  </div>
                  <div className="bg-white/70 border border-stone-200 p-2 flex flex-col rounded-xl">
                    <span className="text-[9px] text-stone-500 uppercase tracking-widest mb-1">
                      Month
                    </span>
                    <span className="text-lg font-mono text-amber-600 font-bold">
                      {birthEnv?.monthStar || "--"}
                    </span>
                    <span className="text-[10px] text-stone-600 mt-1">
                      Physical
                    </span>
                  </div>
                  <div className="bg-white/70 border border-stone-200 p-2 flex flex-col rounded-xl">
                    <span className="text-[9px] text-stone-500 uppercase tracking-widest mb-1">
                      Day
                    </span>
                    <span className="text-lg font-mono text-blue-600 font-bold">
                      {birthEnv?.dayStar || "--"}
                    </span>
                    <span className="text-[10px] text-stone-600 mt-1">
                      Physical
                    </span>
                  </div>
                </div>
              </div>

              {/* Raw Birth Orbital Parameters */}
              {birthEnv?.raw && (
                <div className="mt-auto pt-3 border-t border-stone-200">
                  <div className="text-[9px] text-stone-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span>Orbital Parameters</span>
                    <div className="h-px bg-stone-100 grow"></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-stone-50 border border-purple-200 p-2 flex flex-col rounded-xl">
                      <span className="text-[9px] text-stone-500 uppercase tracking-widest flex items-center justify-between">
                        JUPITER{" "}
                        <span className="text-[10px] text-purple-500 border border-purple-200 px-0.5">
                          Y
                        </span>
                      </span>
                      <span className="text-sm font-mono text-purple-600 mt-1">
                        {birthEnv.raw.jupiterLon.toFixed(2)}°
                      </span>
                    </div>
                    <div className="bg-stone-50 border border-amber-200 p-2 flex flex-col rounded-xl">
                      <span className="text-[9px] text-stone-500 uppercase tracking-widest flex items-center justify-between">
                        LUNAR{" "}
                        <span className="text-[10px] text-amber-700 border border-amber-200 px-0.5">
                          M
                        </span>
                      </span>
                      <span className="text-sm font-mono text-amber-600 mt-1">
                        {birthEnv.raw.moonLon.toFixed(2)}°
                      </span>
                    </div>
                    <div className="bg-stone-50 border border-blue-200 p-2 flex flex-col rounded-xl">
                      <span className="text-[9px] text-stone-500 uppercase tracking-widest flex items-center justify-between">
                        SOLAR{" "}
                        <span className="text-[10px] text-blue-500 border border-blue-200 px-0.5">
                          D
                        </span>
                      </span>
                      <span className="text-sm font-mono text-blue-600 mt-1">
                        {birthEnv.raw.sunLon.toFixed(2)}°
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Current Environment Data */}
            <div className="border border-stone-200 bg-white/80 p-4 flex flex-col gap-4 relative overflow-hidden group">
              {/* Decorative background element */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

              <div className="flex flex-col gap-1 border-b border-stone-200 pb-2">
                <div className="text-[11px] text-stone-600 font-bold uppercase tracking-widest flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500">▶</span>{" "}
                    リアルタイム環境計測
                  </div>
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-200 rounded-xl px-2 py-0.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] text-emerald-600 font-mono tracking-widest">
                      TRACKING
                    </span>
                  </div>
                </div>
                <div className="text-[9px] text-stone-600 font-sans leading-tight">
                  現在この空間を飛び交っている環境波長・リアルタイム天体座標
                </div>
              </div>

              <div className="flex flex-col gap-3 z-10">
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <div className="bg-white/70 border border-stone-200 p-3 flex flex-col rounded-xl">
                    <span className="text-[9px] text-stone-500 uppercase tracking-widest mb-1">
                      Current Year
                    </span>
                    <div className="flex items-baseline gap-1 font-mono">
                      <span className="text-2xl text-purple-600 font-bold leading-none">
                        {env?.yearStar}
                      </span>
                      <span className="text-[10px] text-stone-600">/</span>
                      <span className="text-base text-stone-600 leading-none">
                        {env?.classicalYearStar}
                      </span>
                    </div>
                    <span className="text-[10px] text-stone-600 mt-2">
                      Phys / Class
                    </span>
                  </div>
                  <div className="bg-white/70 border border-stone-200 p-3 flex flex-col rounded-xl">
                    <span className="text-[9px] text-stone-500 uppercase tracking-widest mb-1">
                      Current Month
                    </span>
                    <span className="text-2xl font-mono text-amber-600 font-bold leading-none">
                      {env?.monthStar || "--"}
                    </span>
                    <span className="text-[10px] text-stone-600 mt-2">
                      Physical
                    </span>
                  </div>
                  <div className="bg-white/70 border border-stone-200 p-3 flex flex-col rounded-xl">
                    <span className="text-[9px] text-stone-500 uppercase tracking-widest mb-1">
                      Current Day
                    </span>
                    <span className="text-2xl font-mono text-blue-600 font-bold leading-none">
                      {env?.dayStar || "--"}
                    </span>
                    <span className="text-[10px] text-stone-600 mt-2">
                      Physical
                    </span>
                  </div>
                </div>
              </div>

              {/* Raw Current Orbital Parameters */}
              {env?.raw && (
                <div className="mt-auto pt-3 border-t border-stone-200">
                  <div className="text-[9px] text-stone-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span>リアルタイム天体軌道マトリクス</span>
                    <div className="h-px bg-stone-100 grow"></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-stone-50 border border-purple-200 p-2 flex flex-col rounded-xl">
                      <span className="text-[9px] text-stone-500 uppercase tracking-widest flex items-center justify-between">
                        JUPITER{" "}
                        <span className="text-[10px] text-purple-500 border border-purple-200 px-0.5 animate-pulse">
                          Y
                        </span>
                      </span>
                      <span className="text-sm font-mono text-purple-600 mt-1">
                        {env.raw.jupiterLon.toFixed(2)}°
                      </span>
                    </div>
                    <div className="bg-stone-50 border border-amber-200 p-2 flex flex-col rounded-xl">
                      <span className="text-[9px] text-stone-500 uppercase tracking-widest flex items-center justify-between">
                        LUNAR{" "}
                        <span className="text-[10px] text-amber-700 border border-amber-200 px-0.5 animate-pulse">
                          M
                        </span>
                      </span>
                      <span className="text-sm font-mono text-amber-600 mt-1">
                        {env.raw.moonLon.toFixed(2)}°
                      </span>
                    </div>
                    <div className="bg-stone-50 border border-blue-200 p-2 flex flex-col rounded-xl">
                      <span className="text-[9px] text-stone-500 uppercase tracking-widest flex items-center justify-between">
                        SOLAR{" "}
                        <span className="text-[10px] text-blue-500 border border-blue-200 px-0.5 animate-pulse">
                          D
                        </span>
                      </span>
                      <span className="text-sm font-mono text-blue-600 mt-1">
                        {env.raw.sunLon.toFixed(2)}°
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <details className="mt-4 mb-4 border border-stone-200 bg-white/80 group">
            <summary className="p-3 text-[10px] text-stone-600 font-mono uppercase tracking-widest cursor-pointer hover:bg-white/80 flex items-center justify-between list-none">
              <div className="flex items-center gap-2">
                <span className="text-purple-500 animate-pulse">◆</span> [
                DECRYPT MATRICES ] 生体空間マトリクスの展開
              </div>
              <span className="group-open:rotate-180 transition-transform">
                ▼
              </span>
            </summary>

            <div className="p-3 border-t border-stone-200 bg-white/70">
              <div className="mb-4 p-2 bg-white/80 border border-stone-200 text-[9px] sm:text-[10px] text-stone-500 font-mono leading-relaxed">
                <strong>[ 進入可能方位とノイズの解読法則 ]</strong>
                <br />
                気学の理論と引力モデルに基づき、盤面と本命星を重ね合わせます。
                <br />
                <span className="text-red-600 font-bold">赤色(NOISE)</span>{" "}
                のマスはその空間ベクトルに凶殺的ベクトル（五黄殺・暗剣殺・本命殺・的殺など）が発生していることを示し、進入が非推奨です。
                <br />
                <span className="text-amber-700 font-bold">
                  黄色(WARNING)
                </span>{" "}
                は天中殺や月交点といった「構造的なバグ・特異点」です。極端に不安定になるため長時間の留まりは非推奨です。
                <br />
                <span className="text-emerald-600 font-bold">
                  緑色(OPTIMAL)
                </span>{" "}
                は生体波長と完全にシンクロし能力が増幅されるゾーン、
                <span className="text-blue-600 font-bold">青(SAFE)</span>{" "}
                は異常干渉のない安定ゾーンです。
                <br />
                <em>
                  ※FINALマップでは、以下の年・月・日のいずれかのレイヤーで赤・黄色があると優先してブロック（警告色）が表示されます。
                  <br />
                  ※緑(OPTIMAL)は、全レイヤーがクリアでかつ目的とあなたの波長が完全一致した場合のみ出現します（条件が厳しいため表示されないことも多々あります）。
                </em>
              </div>

              <div className="flex flex-col gap-4">
                {/* Physical Model Section */}
                <div
                  className={`transition-all duration-300 ${!useClassicalBoard ? "opacity-100" : "opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none"}`}
                >
                  <div
                    className={`text-emerald-600 font-bold text-[10px] tracking-widest uppercase border-b border-stone-200 pb-1 flex items-center gap-2 ${!useClassicalBoard ? "drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" : ""}`}
                  >
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    PHYSICAL MODEL (天体位相・物理基準)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px] font-mono text-stone-600">
                    <div className="bg-white/70 border border-purple-200 p-2">
                      <div className="text-purple-500 font-bold mb-1 border-b border-stone-200 pb-1 flex justify-between">
                        <span>物理年盤</span>
                        <span className="text-[9px] text-stone-600">
                          YEAR LAYER
                        </span>
                      </div>
                      {physicalYearBoard && (
                        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                          {renderMatrixCell(
                            "SE",
                            physicalYearBoard.SE,
                            physicalLayers?.yearLayer?.SE,
                          )}
                          {renderMatrixCell(
                            "S",
                            physicalYearBoard.S,
                            physicalLayers?.yearLayer?.S,
                          )}
                          {renderMatrixCell(
                            "SW",
                            physicalYearBoard.SW,
                            physicalLayers?.yearLayer?.SW,
                          )}
                          {renderMatrixCell(
                            "E",
                            physicalYearBoard.E,
                            physicalLayers?.yearLayer?.E,
                          )}
                          {renderMatrixCell(
                            "C",
                            physicalYearBoard.CENTER,
                            undefined,
                            true,
                          )}
                          {renderMatrixCell(
                            "W",
                            physicalYearBoard.W,
                            physicalLayers?.yearLayer?.W,
                          )}
                          {renderMatrixCell(
                            "NE",
                            physicalYearBoard.NE,
                            physicalLayers?.yearLayer?.NE,
                          )}
                          {renderMatrixCell(
                            "N",
                            physicalYearBoard.N,
                            physicalLayers?.yearLayer?.N,
                          )}
                          {renderMatrixCell(
                            "NW",
                            physicalYearBoard.NW,
                            physicalLayers?.yearLayer?.NW,
                          )}
                        </div>
                      )}
                      <div className="mt-2 text-[10px] text-stone-600 leading-tight">
                        太陽黄経(立春起点)に基づく真の物理的位相。
                      </div>
                    </div>

                    <div className="bg-white/70 border border-amber-200 p-2">
                      <div className="text-amber-700 font-bold mb-1 border-b border-stone-200 pb-1 flex justify-between">
                        <span>物理月盤</span>
                        <span className="text-[9px] text-stone-600">
                          MONTH LAYER
                        </span>
                      </div>
                      {physicalMonthBoard && (
                        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                          {renderMatrixCell(
                            "SE",
                            physicalMonthBoard.SE,
                            physicalLayers?.monthLayer?.SE,
                          )}
                          {renderMatrixCell(
                            "S",
                            physicalMonthBoard.S,
                            physicalLayers?.monthLayer?.S,
                          )}
                          {renderMatrixCell(
                            "SW",
                            physicalMonthBoard.SW,
                            physicalLayers?.monthLayer?.SW,
                          )}
                          {renderMatrixCell(
                            "E",
                            physicalMonthBoard.E,
                            physicalLayers?.monthLayer?.E,
                          )}
                          {renderMatrixCell(
                            "C",
                            physicalMonthBoard.CENTER,
                            undefined,
                            true,
                          )}
                          {renderMatrixCell(
                            "W",
                            physicalMonthBoard.W,
                            physicalLayers?.monthLayer?.W,
                          )}
                          {renderMatrixCell(
                            "NE",
                            physicalMonthBoard.NE,
                            physicalLayers?.monthLayer?.NE,
                          )}
                          {renderMatrixCell(
                            "N",
                            physicalMonthBoard.N,
                            physicalLayers?.monthLayer?.N,
                          )}
                          {renderMatrixCell(
                            "NW",
                            physicalMonthBoard.NW,
                            physicalLayers?.monthLayer?.NW,
                          )}
                        </div>
                      )}
                      <div className="mt-2 text-[10px] text-stone-600 leading-tight">
                        太陽と月の相対位相（月相）モデル。
                      </div>
                    </div>

                    <div className="bg-white/70 border border-blue-200 p-2">
                      <div className="text-blue-500 font-bold mb-1 border-b border-stone-200 pb-1 flex justify-between">
                        <span>物理日盤</span>
                        <span className="text-[9px] text-stone-600">
                          DAY LAYER
                        </span>
                      </div>
                      {physicalDayBoard && (
                        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                          {renderMatrixCell(
                            "SE",
                            physicalDayBoard.SE,
                            physicalLayers?.dayLayer?.SE,
                          )}
                          {renderMatrixCell(
                            "S",
                            physicalDayBoard.S,
                            physicalLayers?.dayLayer?.S,
                          )}
                          {renderMatrixCell(
                            "SW",
                            physicalDayBoard.SW,
                            physicalLayers?.dayLayer?.SW,
                          )}
                          {renderMatrixCell(
                            "E",
                            physicalDayBoard.E,
                            physicalLayers?.dayLayer?.E,
                          )}
                          {renderMatrixCell(
                            "C",
                            physicalDayBoard.CENTER,
                            undefined,
                            true,
                          )}
                          {renderMatrixCell(
                            "W",
                            physicalDayBoard.W,
                            physicalLayers?.dayLayer?.W,
                          )}
                          {renderMatrixCell(
                            "NE",
                            physicalDayBoard.NE,
                            physicalLayers?.dayLayer?.NE,
                          )}
                          {renderMatrixCell(
                            "N",
                            physicalDayBoard.N,
                            physicalLayers?.dayLayer?.N,
                          )}
                          {renderMatrixCell(
                            "NW",
                            physicalDayBoard.NW,
                            physicalLayers?.dayLayer?.NW,
                          )}
                        </div>
                      )}
                      <div className="mt-2 text-[10px] text-stone-600 leading-tight">
                        地球の自転(JD)と至点による物理反転モデル。
                      </div>
                    </div>
                  </div>
                </div>

                {/* Classical Model Section */}
                <div
                  className={`transition-all duration-300 mt-4 ${useClassicalBoard ? "opacity-100" : "opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none"}`}
                >
                  <div
                    className={`text-stone-600 font-bold text-[10px] tracking-widest uppercase border-b border-stone-200 pb-1 flex items-center gap-2 ${useClassicalBoard ? "drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]" : ""}`}
                  >
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-pulse"></span>
                    CLASSICAL MODEL (節切り・暦基準)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px] font-mono text-stone-600 mt-2">
                    <div className="bg-white/80 border border-stone-200 p-2">
                      <div className="font-bold mb-1 border-b border-stone-200 pb-1 flex justify-between">
                        <span>古典年盤</span>
                        <span className="text-[9px]">CLASSICAL YEAR</span>
                      </div>
                      {classicalYearBoard && (
                        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                          {renderMatrixCell(
                            "SE",
                            classicalYearBoard.SE,
                            classicalLayers?.yearLayer?.SE,
                          )}
                          {renderMatrixCell(
                            "S",
                            classicalYearBoard.S,
                            classicalLayers?.yearLayer?.S,
                          )}
                          {renderMatrixCell(
                            "SW",
                            classicalYearBoard.SW,
                            classicalLayers?.yearLayer?.SW,
                          )}
                          {renderMatrixCell(
                            "E",
                            classicalYearBoard.E,
                            classicalLayers?.yearLayer?.E,
                          )}
                          {renderMatrixCell(
                            "C",
                            classicalYearBoard.CENTER,
                            undefined,
                            true,
                          )}
                          {renderMatrixCell(
                            "W",
                            classicalYearBoard.W,
                            classicalLayers?.yearLayer?.W,
                          )}
                          {renderMatrixCell(
                            "NE",
                            classicalYearBoard.NE,
                            classicalLayers?.yearLayer?.NE,
                          )}
                          {renderMatrixCell(
                            "N",
                            classicalYearBoard.N,
                            classicalLayers?.yearLayer?.N,
                          )}
                          {renderMatrixCell(
                            "NW",
                            classicalYearBoard.NW,
                            classicalLayers?.yearLayer?.NW,
                          )}
                        </div>
                      )}
                      <div className="mt-2 text-[10px] text-stone-600 leading-tight">
                        一般的な書籍・暦に基づく盤面。
                      </div>
                    </div>

                    <div className="bg-white/80 border border-stone-200 p-2">
                      <div className="font-bold mb-1 border-b border-stone-200 pb-1 flex justify-between">
                        <span>古典月盤</span>
                        <span className="text-[9px]">CLASSICAL MONTH</span>
                      </div>
                      {classicalMonthBoard && (
                        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                          {renderMatrixCell(
                            "SE",
                            classicalMonthBoard.SE,
                            classicalLayers?.monthLayer?.SE,
                          )}
                          {renderMatrixCell(
                            "S",
                            classicalMonthBoard.S,
                            classicalLayers?.monthLayer?.S,
                          )}
                          {renderMatrixCell(
                            "SW",
                            classicalMonthBoard.SW,
                            classicalLayers?.monthLayer?.SW,
                          )}
                          {renderMatrixCell(
                            "E",
                            classicalMonthBoard.E,
                            classicalLayers?.monthLayer?.E,
                          )}
                          {renderMatrixCell(
                            "C",
                            classicalMonthBoard.CENTER,
                            undefined,
                            true,
                          )}
                          {renderMatrixCell(
                            "W",
                            classicalMonthBoard.W,
                            classicalLayers?.monthLayer?.W,
                          )}
                          {renderMatrixCell(
                            "NE",
                            classicalMonthBoard.NE,
                            classicalLayers?.monthLayer?.NE,
                          )}
                          {renderMatrixCell(
                            "N",
                            classicalMonthBoard.N,
                            classicalLayers?.monthLayer?.N,
                          )}
                          {renderMatrixCell(
                            "NW",
                            classicalMonthBoard.NW,
                            classicalLayers?.monthLayer?.NW,
                          )}
                        </div>
                      )}
                      <div className="mt-2 text-[10px] text-stone-600 leading-tight">
                        節気ごとのカレンダー切り替え。
                      </div>
                    </div>

                    <div className="bg-white/80 border border-stone-200 p-2">
                      <div className="font-bold mb-1 border-b border-stone-200 pb-1 flex justify-between">
                        <span>古典日盤</span>
                        <span className="text-[9px]">CLASSICAL DAY</span>
                      </div>
                      {classicalDayBoard && (
                        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                          {renderMatrixCell(
                            "SE",
                            classicalDayBoard.SE,
                            classicalLayers?.dayLayer?.SE,
                          )}
                          {renderMatrixCell(
                            "S",
                            classicalDayBoard.S,
                            classicalLayers?.dayLayer?.S,
                          )}
                          {renderMatrixCell(
                            "SW",
                            classicalDayBoard.SW,
                            classicalLayers?.dayLayer?.SW,
                          )}
                          {renderMatrixCell(
                            "E",
                            classicalDayBoard.E,
                            classicalLayers?.dayLayer?.E,
                          )}
                          {renderMatrixCell(
                            "C",
                            classicalDayBoard.CENTER,
                            undefined,
                            true,
                          )}
                          {renderMatrixCell(
                            "W",
                            classicalDayBoard.W,
                            classicalLayers?.dayLayer?.W,
                          )}
                          {renderMatrixCell(
                            "NE",
                            classicalDayBoard.NE,
                            classicalLayers?.dayLayer?.NE,
                          )}
                          {renderMatrixCell(
                            "N",
                            classicalDayBoard.N,
                            classicalLayers?.dayLayer?.N,
                          )}
                          {renderMatrixCell(
                            "NW",
                            classicalDayBoard.NW,
                            classicalLayers?.dayLayer?.NW,
                          )}
                        </div>
                      )}
                      <div className="mt-2 text-[10px] text-stone-600 leading-tight">
                        精密日家九星・隠遁陽遁サイクル。
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </details>

          {/* Final Vector Calculation Visualization */}
          {env && layers && (
            <div className="mt-4 bg-white/70 border border-stone-200 p-3 w-full">
              <div className="text-emerald-500 font-bold mb-1 border-b border-stone-200 pb-1 text-[10px] tracking-widest uppercase flex items-center gap-2">
                <span>干渉波・位相干渉診断</span>
                <span className="text-stone-600 text-[10px]">
                  ( 優先度: 🟥 物理干渉 &gt; 🟪 生体干渉 &gt; 🟨 バグ警告 &gt;
                  🟩 波長共鳴 &gt; 🟦 無干渉(青) )
                </span>
              </div>
              <div className="text-[10px] text-stone-600 mb-2 leading-relaxed text-justify pr-2 font-sans">
                <strong className="text-stone-500">判定ロジック:</strong>{" "}
                長期波・中期波・短期波の各算術ベクトルを重ね合わせ最終結果を導出します。いずれか1つのレイヤーでも致死的な物理アーティファクト（赤）や生体コンフリクト（紫）が含まれている場合、他が同期ベクトル（緑）であっても最終結果は干渉（NOISE）に強制上書きされます。（細胞へのダメージ蓄積を防ぐフェイルセーフ）
              </div>
              <div className="overflow-visible w-full mt-4 flex flex-col gap-6">
                {/* Physical Model Table */}
                <div
                  className={`transition-all duration-300 ${!useClassicalBoard ? "opacity-100" : "opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none"}`}
                >
                  <div
                    className={`text-emerald-600 font-bold text-[10px] tracking-widest uppercase border-b border-stone-200 pb-1 mb-2 flex items-center gap-2 ${!useClassicalBoard ? "drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" : ""}`}
                  >
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    PHYSICAL MODEL (天体位相・物理基準)
                  </div>
                  <table className="w-full text-left font-mono">
                    <thead className="border-b border-stone-200 text-stone-600 text-[9px] uppercase tracking-wider">
                      <tr>
                        <th className="pb-2 pr-2 font-normal align-bottom">
                          Dir
                        </th>
                        <th className="pb-2 px-1 font-normal align-bottom">
                          Year Layer
                          <br />
                          <span className="text-[9px] text-stone-600 font-sans normal-case leading-tight block mt-1">
                            【長期的影響】
                          </span>
                        </th>
                        <th className="pb-2 px-1 font-normal align-bottom">
                          Month Layer
                          <br />
                          <span className="text-[9px] text-stone-600 font-sans normal-case leading-tight block mt-1">
                            【中期的影響】
                          </span>
                        </th>
                        <th className="pb-2 px-1 font-normal align-bottom">
                          Day Layer
                          <br />
                          <span className="text-[9px] text-stone-600 font-sans normal-case leading-tight block mt-1">
                            【短期的影響】
                          </span>
                        </th>
                        <th className="pb-2 pl-2 font-bold text-stone-600 align-bottom">
                          Final Vector
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 text-[10px]">
                      {(
                        ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const
                      ).map((dir) => {
                        const y = physicalLayers?.yearLayer[dir] || "SAFE";
                        const m = physicalLayers?.monthLayer[dir] || "SAFE";
                        const d = physicalLayers?.dayLayer[dir] || "SAFE";
                        const final =
                          physicalLayers?.finalVectors[dir] || "SAFE";

                        return (
                          <tr
                            key={dir}
                            className="hover:bg-white/80 transition-colors"
                          >
                            <td className="py-2.5 pr-2 text-stone-500 font-bold align-middle">
                              {dir}
                            </td>
                            <td className="py-2.5 px-1 align-middle">
                              <TooltipCell
                                status={y}
                                board={physicalYearBoard}
                                layerType="year"
                                dir={dir}
                                isClassical={false}
                              />
                            </td>
                            <td className="py-2.5 px-1 align-middle">
                              <TooltipCell
                                status={m}
                                board={physicalMonthBoard}
                                layerType="month"
                                dir={dir}
                                isClassical={false}
                              />
                            </td>
                            <td className="py-2.5 px-1 align-middle">
                              <TooltipCell
                                status={d}
                                board={physicalDayBoard}
                                layerType="day"
                                dir={dir}
                                isClassical={false}
                              />
                            </td>
                            <td className="py-2.5 pl-2 align-middle bg-white/80">
                              <TooltipCell
                                status={final}
                                board={null}
                                isFinal={true}
                                layerType="final"
                                dir={dir}
                                isClassical={false}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Classical Model Table */}
                <div
                  className={`transition-all duration-300 ${useClassicalBoard ? "opacity-100" : "opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none"}`}
                >
                  <div
                    className={`text-stone-600 font-bold text-[10px] tracking-widest uppercase border-b border-stone-200 pb-1 mb-2 flex items-center gap-2 ${useClassicalBoard ? "drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]" : ""}`}
                  >
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-pulse"></span>
                    CLASSICAL MODEL (節切り・暦基準)
                  </div>
                  <table className="w-full text-left font-mono">
                    <thead className="border-b border-stone-200 text-stone-600 text-[9px] uppercase tracking-wider">
                      <tr>
                        <th className="pb-2 pr-2 font-normal align-bottom">
                          Dir
                        </th>
                        <th className="pb-2 px-1 font-normal align-bottom">
                          Year Layer
                          <br />
                          <span className="text-[9px] text-zinc-700 font-sans normal-case leading-tight block mt-1">
                            【長期的影響】
                          </span>
                        </th>
                        <th className="pb-2 px-1 font-normal align-bottom">
                          Month Layer
                          <br />
                          <span className="text-[9px] text-zinc-700 font-sans normal-case leading-tight block mt-1">
                            【中期的影響】
                          </span>
                        </th>
                        <th className="pb-2 px-1 font-normal align-bottom">
                          Day Layer
                          <br />
                          <span className="text-[9px] text-zinc-700 font-sans normal-case leading-tight block mt-1">
                            【短期的影響】
                          </span>
                        </th>
                        <th className="pb-2 pl-2 font-bold text-stone-600 align-bottom">
                          Final Vector
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 text-[10px]">
                      {(
                        ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const
                      ).map((dir) => {
                        const y = classicalLayers?.yearLayer[dir] || "SAFE";
                        const m = classicalLayers?.monthLayer[dir] || "SAFE";
                        const d = classicalLayers?.dayLayer[dir] || "SAFE";
                        const final =
                          classicalLayers?.finalVectors[dir] || "SAFE";

                        return (
                          <tr
                            key={dir}
                            className="hover:bg-white/80 transition-colors"
                          >
                            <td className="py-2.5 pr-2 text-stone-600 font-bold align-middle">
                              {dir}
                            </td>
                            <td className="py-2.5 px-1 align-middle">
                              <TooltipCell
                                status={y}
                                board={classicalYearBoard}
                                layerType="year"
                                dir={dir}
                                isClassical={true}
                              />
                            </td>
                            <td className="py-2.5 px-1 align-middle">
                              <TooltipCell
                                status={m}
                                board={classicalMonthBoard}
                                layerType="month"
                                dir={dir}
                                isClassical={true}
                              />
                            </td>
                            <td className="py-2.5 px-1 align-middle">
                              <TooltipCell
                                status={d}
                                board={classicalDayBoard}
                                layerType="day"
                                dir={dir}
                                isClassical={true}
                              />
                            </td>
                            <td className="py-2.5 pl-2 align-middle bg-white/80">
                              <TooltipCell
                                status={final}
                                board={null}
                                isFinal={true}
                                layerType="final"
                                dir={dir}
                                isClassical={true}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Theory & Model Explanation */}
          <div className="mt-4 bg-white/80 border border-stone-200 p-3 w-full">
            <div className="flex items-center justify-between mb-2 border-b border-stone-200 pb-2">
              <div className="text-blue-600 font-bold text-[10px] tracking-widest uppercase flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full md:animate-pulse"></span>
                天体物理コアロジック (理論と数理モデル)
              </div>
              <button
                onClick={() =>
                  setShowAstrophysicalLogic(!showAstrophysicalLogic)
                }
                className="text-[9px] font-mono text-stone-500 hover:text-stone-900 bg-stone-50 px-2 py-1 border border-stone-300 hover:border-zinc-500 transition-colors uppercase tracking-widest"
              >
                {showAstrophysicalLogic
                  ? "[-] CLOSE TERMINAL"
                  : "[+] EXAMINE LOGIC"}
              </button>
            </div>

            {showAstrophysicalLogic && (
              <div className="animate-fade-in border-l-2 border-blue-500 pl-3 mt-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] text-purple-600 font-bold border-l-2 border-purple-500 pl-2 bg-purple-50 py-0.5">
                      YEAR: JUPITER RESONANCE
                    </span>
                    <p className="text-[10px] text-stone-600 leading-relaxed">
                      木星の公転周期（約11.86年）を12分割し、地球への影響を1-9の周波数に変換します。木星が物理的に黄極を移動した瞬間に盤面が切り替わります。陽黄経による位相反転（陽遁・陰遁）を適用。
                    </p>
                    <div className="bg-white/70 p-2 border border-stone-200 font-mono text-[10px] shadow-inner overflow-x-auto whitespace-nowrap custom-scrollbar">
                      <InlineMath
                        math={`S_y = 11 - ((\\lfloor L_j / 30 \\rfloor + 8) \\pmod 9)`}
                      />
                      <div className="mt-1 text-stone-600 border-t border-stone-200 pt-1">
                        <InlineMath
                          math={`L_j = ${env?.raw?.jupiterLon?.toFixed(2)}^\\circ`}
                        />{" "}
                        (Jupiter Lon)
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] text-amber-600 font-bold border-l-2 border-amber-500 pl-2 bg-amber-50 py-0.5">
                      MONTH: TIDAL INTERFERENCE
                    </span>
                    <p className="text-[10px] text-stone-600 leading-relaxed">
                      太陽黄経と月相の相対位相差から算出。潮汐変動が生体に与えるノイズを抽出します。
                    </p>
                    <div className="bg-white/70 p-2 border border-stone-200 font-mono text-[10px] shadow-inner overflow-x-auto whitespace-nowrap custom-scrollbar">
                      <InlineMath
                        math={`S_m = 9 - ((T_s \\times 12 + T_l) \\pmod 9)`}
                      />
                      <div className="mt-1 text-stone-600 border-t border-stone-200 pt-1">
                        <InlineMath
                          math={`\\Delta L = ${(((env?.raw?.moonLon ?? 0) - (env?.raw?.sunLon ?? 0) + 360) % 360).toFixed(2)}^\\circ`}
                        />{" "}
                        (Phase)
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] text-blue-600 font-bold border-l-2 border-blue-500 pl-2 bg-blue-50 py-0.5">
                      DAY: ROTATIONAL FLUX
                    </span>
                    <p className="text-[10px] text-stone-600 leading-relaxed">
                      地球の自転(JD)をベースに、至点（Solstice）での位相反転を厳密に定義します。夏至・冬至の「物理的な至点」で厳密に数理モデルが反転し、エネルギーの増幅/減衰を表現します。
                    </p>
                    <div className="bg-white/70 p-2 border border-stone-200 font-mono text-[10px] shadow-inner overflow-x-auto whitespace-nowrap custom-scrollbar">
                      <InlineMath
                        math={`S_d = \\begin{cases} 9 - (JD \\% 9) & (\\text{陰遁}) \\\\ (JD \\% 9) + 1 & (\\text{陽遁}) \\end{cases}`}
                      />
                      <div className="mt-1 text-stone-600 border-t border-stone-200 pt-1 italic">
                        JD: Julian Day Baseline
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-stone-200 flex flex-col gap-1">
                  <div className="text-[10px] text-stone-600 italic">
                    ※
                    本エンジンは「占い」ではなく、天体位置から導き出される物理的ポテンシャルを計算しています。古典暦（Classical）との乖離は、天体運動の歳差や摂動を考慮した「物理的リアリティ」の差です。
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default ConsultPanel;
