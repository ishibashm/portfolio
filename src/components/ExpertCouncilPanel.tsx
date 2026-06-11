"use client";

import { useState, useMemo } from "react";
import { getUpcomingDoyouPeriod } from "../utils/ephemerisEngine";
import { useRouter } from "next/navigation";

interface ExpertCouncilPanelProps {
  actionIntent: string;
  targetDate: Date | null;
  honmeiStar: number | null;
  environmentalFrequencies: any;
  birthFrequencies: any;
  finalVectors: Record<string, string>;
  isPersonalVoid: boolean;
  isYearVoid?: boolean;
  isMonthVoid?: boolean;
  isDayVoid?: boolean;
  kpIndex: number | null;
  xrayFlux: string | null;
  magneticF: number | null;
  magneticD: number | null;
  magneticI: number | null;
  hrv: number;
  gsr: number;
  ansLoad: number;
  shieldCapacity: number;
  timingScore?: number;
  isTimingOptimal?: boolean;
  timingDetails?: { name: string; phenomenon: string; detail: string }[];
  timingRecommendation?: string;
  doyouState?: any;
  // New props for AI Prompt integration
  targetLat?: number | null;
  targetLon?: number | null;
  targetDirection?: string | null;
  aiPromptText?: string;
  onCopyPrompt?: () => void;
  copiedPrompt?: boolean;
  onDownloadJson?: () => void;
}

export default function ExpertCouncilPanel({
  actionIntent,
  targetDate,
  honmeiStar,
  environmentalFrequencies,
  birthFrequencies,
  finalVectors,
  doyouState,
  isPersonalVoid,
  isYearVoid = false,
  isMonthVoid = false,
  isDayVoid = false,
  kpIndex,
  xrayFlux,
  magneticF,
  magneticD,
  magneticI,
  hrv,
  gsr,
  ansLoad,
  shieldCapacity,
  timingScore,
  timingDetails,
  timingRecommendation,
  isTimingOptimal,
  // New props
  targetLat = null,
  targetLon = null,
  targetDirection = null,
  aiPromptText = "",
  onCopyPrompt,
  copiedPrompt = false,
  onDownloadJson,
}: ExpertCouncilPanelProps) {
  const anyVoid = isPersonalVoid || isYearVoid || isMonthVoid || isDayVoid;

  const router = useRouter();
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([
    {
      role: "assistant",
      text: "システムコンソールアクティブ。現在の宇宙天気およびバイオデータは同期されています。調整の指示、または本日のアドバイスを求めてください。",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setIsLoading(true);

    const statusSteps = [
      "🧬 [TELEMETRY] 生体測定データ(HRV/ANS負荷)同期中...",
      "📡 [SPACE-WEATHER] 地磁気偏角およびKp-Index読み込み中...",
      "🔮 [ASTROLOGY] 九星・天体配置ベクトル計算中...",
      "🧠 [AGENT-COGNITIVE] 思考プロセスを構築中...",
    ];

    let stepIdx = 0;
    setLoadingStatus(statusSteps[0]);
    const interval = setInterval(() => {
      stepIdx++;
      if (stepIdx < statusSteps.length) {
        setLoadingStatus(statusSteps[stepIdx]);
      }
    }, 2000);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          telemetry: {
            kpIndex,
            ansLoad,
            magneticF,
            isPersonalVoid: anyVoid,
            actionIntent,
            targetDirection,
            targetLat,
            targetLon,
          },
        }),
      });

      clearInterval(interval);

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "通信エラーが発生しました。");
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.textResponse },
      ]);

      if (data.themeApplied && data.theme) {
        const t = data.theme;
        document.documentElement.style.setProperty(
          "--background",
          t.background,
          "important",
        );
        document.documentElement.style.setProperty(
          "--foreground",
          t.foreground,
          "important",
        );
        document.documentElement.style.setProperty(
          "--color-accent",
          t.accent,
          "important",
        );
        document.documentElement.style.setProperty(
          "--glow-color",
          t.glowColor,
          "important",
        );
        document.documentElement.style.setProperty(
          "--glow-intensity",
          String(t.glowIntensity),
          "important",
        );
        document.documentElement.style.setProperty(
          "--animation-speed",
          t.animationSpeed,
          "important",
        );
        document.documentElement.style.setProperty(
          "--noise-opacity",
          String(t.noiseOpacity),
          "important",
        );
        document.documentElement.style.setProperty(
          "--border-radius",
          t.borderRadius,
          "important",
        );

        const fontVarName =
          t.fontTheme === "serif" ? "var(--font-serif)" : "var(--font-sans)";
        document.documentElement.style.setProperty(
          "--font-family",
          fontVarName,
          "important",
        );
        router.refresh();
      }
    } catch (err: any) {
      clearInterval(interval);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `⚠️ エラーが発生しました: ${err.message}` },
      ]);
    } finally {
      setIsLoading(false);
      setLoadingStatus("");
    }
  };

  // Calculate a reliable local score and generate the breakdown of conditions
  const scoreData = useMemo(() => {
    let base = 100;
    const conditions: { label: string; value: string; colorClass?: string }[] =
      [];

    // 1. 天中殺の判定
    if (anyVoid) {
      base -= 60;
      let voidTypes = [];
      if (isYearVoid) voidTypes.push("年");
      if (isMonthVoid) voidTypes.push("月");
      if (isDayVoid) voidTypes.push("日");
      if (isPersonalVoid) voidTypes.push("時");

      conditions.push({
        label: `天中殺 (${voidTypes.join("・")}VOID)`,
        value: "-60 (警告)",
        colorClass: "text-red-500",
      });
    } else {
      conditions.push({
        label: "天中殺 (VOID TIME)",
        value: "CLEAR",
        colorClass: "text-emerald-500/50",
      });
    }

    // 2. 宇宙天気 (磁気嵐) の判定
    if (kpIndex && kpIndex >= 5) {
      base -= 30;
      conditions.push({
        label: "宇宙天気 (Kp ≥ 5)",
        value: "-30 (磁気嵐)",
        colorClass: "text-red-500",
      });
    } else if (kpIndex && kpIndex >= 4) {
      base -= 15;
      conditions.push({
        label: "宇宙天気 (Kp ≥ 4)",
        value: "-15 (不安定)",
        colorClass: "text-amber-500",
      });
    } else {
      conditions.push({
        label: "宇宙天気 (Kp Index)",
        value: "CLEAR",
        colorClass: "text-emerald-500/50",
      });
    }

    // 3. 生体負荷 (ANS Load) の判定
    if (ansLoad > 80) {
      base -= 20;
      conditions.push({
        label: "自律神経負荷 (ANS > 80%)",
        value: "-20 (過負荷)",
        colorClass: "text-amber-500",
      });
    } else {
      conditions.push({
        label: "自律神経負荷 (ANS Load)",
        value: "CLEAR",
        colorClass: "text-emerald-500/50",
      });
    }

    // 4. 空間ベクトル (吉凶方位) の判定
    const hasNoise = Object.values(finalVectors || {}).some(
      (s) => typeof s === "string" && s.includes("NOISE"),
    );
    const hasOptimal = Object.values(finalVectors || {}).some(
      (s) => typeof s === "string" && s.includes("OPTIMAL"),
    );

    if (hasNoise && actionIntent === "MIGRATION") {
      base -= 30;
      conditions.push({
        label: "引越し方位 (NOISE)",
        value: "-30 (凶方位)",
        colorClass: "text-red-500",
      });
    }
    if (hasOptimal) {
      base += 10;
      conditions.push({
        label: "空間共鳴 (OPTIMAL)",
        value: "+10 (大吉)",
        colorClass: "text-blue-400",
      });
    }

    // 5. 土用期間の判定（引越しモードの場合のみ影響）
    if (actionIntent === "MIGRATION" && doyouState) {
      if (doyouState.isDoyouHazard) {
        base -= 30;
        conditions.push({
          label: `土用ハザード (${doyouState.doyouType})`,
          value: "-30 (大凶期)",
          colorClass: "text-red-500",
        });
      } else if (doyouState.inDoyou && doyouState.isMabi) {
        conditions.push({
          label: "土用・間日 (Mabi)",
          value: "CLEAR (セーフ)",
          colorClass: "text-emerald-500/50",
        });
      }
    }

    const finalScore = Math.max(0, Math.min(100, base));

    if (timingScore !== undefined && !isNaN(timingScore)) {
      const externalScore = timingScore <= 1 ? timingScore * 100 : timingScore;
      return { score: externalScore, conditions };
    }

    return { score: finalScore, conditions };
  }, [
    timingScore,
    anyVoid,
    isPersonalVoid,
    isYearVoid,
    isMonthVoid,
    isDayVoid,
    kpIndex,
    ansLoad,
    finalVectors,
    actionIntent,
    doyouState,
  ]);

  // 現在のパラメータ（目的・環境データ・スコア）に完全連動するダイナミックな推奨テキストを生成
  const getDynamicRecommendation = () => {
    if (anyVoid) {
      return "【CRITICAL: 警告】\n現在はあなたの「天中殺（VOID TIME）」に該当します。地球磁場と固有波長が非同期状態にあるため、新規事の開始、重要な決断、および長距離 of 移動（引越し）は完全に凍結し、現状維持とルーチンワークに徹してください。";
    }

    if (kpIndex !== null && kpIndex >= 5) {
      return "【WARNING: 宇宙天気異常】\n強い地磁気嵐（Kp 5以上）が観測されています。自律神経負荷（ANS Load）が高まりやすく、エラーや判断ミスが起きやすい状態です。無理なスケジュールは避け、シールド（休息）を優先してください。";
    }

    const scoreVal = scoreData.score;
    let text = "";

    switch (actionIntent) {
      case "REST":
        text = "【意図: 休養・療養 (REST)】\n";
        if (scoreVal >= 60) {
          text +=
            "心身の回復とエネルギーの再充填に極めて適した時間・空間位相です。外部ノイズが遮断されており、効率的に自律神経負荷（ANS Load）を下げる環境が整っています。自然豊かな場所での滞在を推奨します。";
        } else {
          text +=
            "現在は回復を目的とした移動にはやや不向きなノイズが存在します。長距離の移動は逆に負荷を高める可能性があるため、安全なベースキャンプ（現在地）での静養を推奨します。";
        }
        break;
      case "BUSINESS":
        text = "【意図: ビジネス・攻撃 (BUSINESS)】\n";
        if (scoreVal >= 60) {
          text +=
            "「相生・相比」のエネルギーが強く働き、交渉やビジネス展開を仕掛けるのに最適なタイミングです。空間ベクトルもあなたの波長を後押ししています。速やかに行動（GO）を開始してください。";
        } else {
          text +=
            "現在は勝負に出るタイミングではありません。環境ノイズが集中力や他者との交渉を阻害する恐れがあります。重要な契約やアプローチはタイミングの再調整（HOLD）を推奨します。";
        }
        break;
      case "MIGRATION":
        text = "【意図: 引越し・長期滞在 (MIGRATION)】\n";
        if (doyouState?.isDoyouHazard) {
          text += `⚠️ 現在は土用期間（${doyouState.doyouType}）の【大凶期（土用ハザード）】に該当します。間日（まび）でもありません。大地の磁気エネルギーが極めて不安定になっており、移住や長期滞在のための基礎固めを行うには最悪の時期です。方位に関わらず、この期間中の移動や物件契約手続きは一時保留（凍結）し、期間外への延期を強く推奨します。`;
        } else if (doyouState?.inDoyou && doyouState?.isMabi) {
          text += `✨ 現在は土用期間（${doyouState.doyouType}）中ですが、本日は特別に土の乱れが緩和される「間日（まび）」です。やむを得ない移動や、小規模な新居関連の意思決定であれば、本日中に実施可能です。`;
        } else if (scoreVal >= 70) {
          text +=
            "長期的な拠点移動において、極めて良好な空間・時間位相が重なっています。このタイミングでの移動は、新しい土地の磁場への順化（ベース同期）を早め、人生のパフォーマンス基盤を強固にします。";
        } else {
          text +=
            "長期拠点移動にはリスク（環境ノイズ）が伴います。Target Date（目標日）をずらすか、現地で十分な休息期間を確保するフェイルセーフ計画を立ててください。";
        }
        break;
      default:
        text = "【意図: 通常行動 (DEFAULT)】\n";
        if (scoreVal >= 50) {
          text +=
            "環境は安定しています。予定通りの行動、短期旅行、出張など、スムーズに進行できるでしょう。適度な活動と休息のバランスを取ってください。";
        } else {
          text +=
            "日常のルーチンワークに徹し、無理なスケジュール変更や突発的な行動は避けるのが無難です。";
        }
    }

    // 引越しモードの場合で空間ベクトルのノイズがある場合は追加警告
    const hasNoise = Object.values(finalVectors || {}).some(
      (s) => typeof s === "string" && s.includes("NOISE"),
    );
    if (hasNoise && actionIntent === "MIGRATION") {
      text +=
        "\n\n※戦術アドバイス：現在展開中の空間ベクトルに有害な干渉帯（NOISE）が含まれています。目的地がこのベクトルに該当する場合、移動自体が深刻なダメージとなるため「Destination」タブでの再評価を強く推奨します。";
    }

    return text;
  };

  const displayRecommendation = getDynamicRecommendation();

  // Map "4 External Agencies" concepts to the underlying data feeds
  const agencyData: {
    agency: string;
    icon: string;
    description: string;
    dataItems: { label: string; value: string | number; colorClass?: string }[];
    status: string;
  }[] = [
    {
      agency: "Geomancy / 気学空間",
      icon: "🧭",
      description: "現在地からの各方位 of 吉凶ベクトル (外部環境)",
      dataItems: Object.entries(finalVectors || {}).map(([dir, status]) => ({
        label: dir,
        value: status,
      })),
      status: Object.values(finalVectors || {}).some(
        (s) => typeof s === "string" && s.includes("NOISE"),
      )
        ? "WARNING"
        : "SAFE",
    },
    {
      agency: "Astrophysics / 天体位相",
      icon: "🔭",
      description: "環境ステータスと最適性スコアの内訳",
      dataItems: [
        {
          label: "Optimal Score (総合評価)",
          value: `${Math.round(scoreData.score)}%`,
          colorClass:
            scoreData.score >= 80
              ? "text-emerald-400"
              : scoreData.score >= 50
                ? "text-amber-400"
                : "text-red-400",
        },
        ...scoreData.conditions.map((c) => ({
          label: ` ├ ${c.label}`,
          value: c.value,
          colorClass: c.colorClass,
        })),
        ...(timingDetails?.map((d) => ({
          label: d.name,
          value: d.phenomenon,
        })) || []),
      ],
      status: "OBSERVED",
    },
    {
      agency: "Tactical GIS / 物理環境",
      icon: "🎖️",
      description: "局所地磁気・災害リスクなどの物理的安全性 (外部環境)",
      dataItems: [
        {
          label: "Magnetic F",
          value: magneticF ? `${magneticF.toFixed(0)} nT` : "--",
        },
        {
          label: "Magnetic D",
          value: magneticD ? `${magneticD.toFixed(1)}°` : "--",
        },
        {
          label: "Hazard Risk",
          value: environmentalFrequencies?.hazardScore || "N/A",
        },
      ],
      status:
        magneticF && (magneticF > 60000 || magneticF < 25000)
          ? "WARNING"
          : "SAFE",
    },
    {
      agency: "Data Science / 総合特異点",
      icon: "📊",
      description: "システム全体から見た致命的バグの有無 (外部環境)",
      dataItems: [
        { label: "Personal Void", value: anyVoid ? "YES" : "NO" },
        {
          label: "Kp-Index",
          value: kpIndex !== null ? kpIndex.toString() : "--",
        },
      ],
      status: anyVoid || (kpIndex && kpIndex > 4) ? "CRITICAL" : "SAFE",
    },
  ];

  return (
    <div className="w-full bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-5 flex flex-col shadow-2xl z-10 transition-all duration-300">
      <div className="flex justify-between items-center mb-4 border-b border-zinc-800/50 pb-3">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 animate-pulse text-lg">●</span>
          <div>
            <h3 className="text-sm text-zinc-100 font-bold uppercase tracking-widest leading-none">
              External Telemetry
            </h3>
            <span className="text-[10px] text-zinc-500 font-normal">
              外部環境データ監視グリッド
            </span>
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.1)]">
          Live Feed Active
        </div>
      </div>

      <p className="text-[11px] text-zinc-400 mb-5 font-sans leading-relaxed">
        生体データを除外した外部環境データ（気学・天体・地磁気・GIS等）のリアルタイム監視パネルです。各パラメータの現在値を監視し、日々の移住・長期滞在インサイトとして蓄積します。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agencyData.map((agency, idx) => (
          <div
            key={idx}
            className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col hover:bg-zinc-900/50 transition-colors"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">{agency.icon}</span>
                <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                  {agency.agency}
                </span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-sm font-mono font-bold tracking-wider ${
                  agency.status === "OPTIMAL"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : agency.status === "WARNING"
                      ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                      : agency.status === "CRITICAL"
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                }`}
              >
                {agency.status}
              </span>
            </div>

            <div className="text-[10px] text-zinc-500 mb-3 border-b border-white/5 pb-2">
              {agency.description}
            </div>

            <div className="flex flex-col gap-1.5 mt-auto">
              {agency.dataItems.map((item, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center bg-white/[0.02] px-2 py-1.5 rounded-md"
                >
                  <span
                    className={`text-[10px] font-mono ${item.label.startsWith(" ├") ? "text-zinc-500" : "text-zinc-400"}`}
                  >
                    {item.label}
                  </span>
                  <span
                    className={`text-[11px] font-mono font-bold ${
                      item.colorClass ||
                      (String(item.value).includes("NOISE")
                        ? "text-red-400"
                        : String(item.value).includes("SAFE") ||
                            String(item.value).includes("OPTIMAL") ||
                            String(item.value).includes("CLEAR")
                          ? "text-emerald-400"
                          : item.value === "YES"
                            ? "text-yellow-400"
                            : "text-zinc-200")
                    }`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 bg-indigo-950/20 border border-indigo-500/30 p-4 rounded-xl">
        <h4 className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
          Timing Optimizer Recommendation / 推奨行動
        </h4>
        <p className="text-xs text-zinc-300 leading-relaxed font-sans text-justify whitespace-pre-wrap">
          {displayRecommendation}
        </p>
      </div>

      {(() => {
        const upcoming = targetDate ? getUpcomingDoyouPeriod(targetDate) : null;
        if (!upcoming) return null;

        return (
          <div className="mt-3 bg-amber-950/10 border border-amber-900/30 p-4 rounded-xl flex flex-col gap-2 text-xs font-sans">
            <div className="flex items-center gap-2 font-bold text-amber-400 text-[10px]">
              <span>🗓️</span>
              <span className="uppercase tracking-wider">
                Doyou & Mabi Forecast / 土用・間日予報
              </span>
            </div>
            <div className="text-zinc-300">
              直近の土用期間 (
              {upcoming.type === "SPRING"
                ? "春土用"
                : upcoming.type === "SUMMER"
                  ? "夏土用"
                  : upcoming.type === "AUTUMN"
                    ? "秋土用"
                    : "冬土用"}
              ):
              <strong className="text-amber-500 font-mono ml-2 text-sm">
                {upcoming.start} 〜 {upcoming.end}
              </strong>
            </div>
            {upcoming.mabiDays.length > 0 && (
              <div className="text-zinc-400 flex flex-wrap gap-1.5 items-center mt-1">
                <span className="text-[10px] text-zinc-500">
                  🍀 期間内の間日 (安全な日):
                </span>
                {upcoming.mabiDays.map((day) => (
                  <span
                    key={day}
                    className="bg-emerald-950/30 border border-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded-md font-mono text-[10px]"
                  >
                    {day}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* AI Consultation & System Control Chat Area */}
      <div className="mt-6 p-5 border border-purple-500/20 bg-purple-950/5 backdrop-blur-lg rounded-xl flex flex-col gap-4 relative overflow-hidden shadow-[0_0_30px_rgba(168,85,247,0.05)] transition-all duration-300">
        {/* Background glow decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

        <div className="flex justify-between items-center border-b border-purple-500/20 pb-3">
          <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2 font-mono">
            <span className="text-purple-400 animate-pulse">🔮</span>
            Agent Console / 守護精霊対話
          </h4>
          <span className="text-[7.5px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 border border-purple-500/30 rounded shadow-[0_0_8px_rgba(168,85,247,0.1)]">
            SECURE LINK ACTIVE
          </span>
        </div>

        <p className="text-zinc-400 leading-relaxed text-[11px] font-sans">
          常駐エージェントとの直接対話コンソールです。現在の生体測定値や地磁気データをもとに相談したり、テーマ変更を指示できます（例:
          「青系の落ち着いた色にして」「心を落ち着かせるために明朝体に変更して」など）。
        </p>

        {/* Selected Coordinates Indicator */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/50 border border-zinc-800/80 p-2.5 rounded-lg font-mono text-[10px]">
          <div className="flex justify-between items-center bg-white/[0.01] px-2.5 py-1.5 rounded border border-white/[0.02]">
            <span className="text-zinc-500">目標方位 (Direction):</span>
            <span
              className={
                targetDirection
                  ? "text-emerald-400 font-bold"
                  : "text-amber-500"
              }
            >
              {targetDirection || "未選択"}
            </span>
          </div>
          <div className="flex justify-between items-center bg-white/[0.01] px-2.5 py-1.5 rounded border border-white/[0.02]">
            <span className="text-zinc-500">目標座標 (Coordinates):</span>
            <span
              className={
                targetLat && targetLon
                  ? "text-emerald-400 font-bold"
                  : "text-amber-500"
              }
            >
              {targetLat && targetLon
                ? `${targetLat.toFixed(4)}, ${targetLon.toFixed(4)}`
                : "地図上でクリックして選択"}
            </span>
          </div>
        </div>

        {!targetLat || !targetLon ? (
          <div className="p-3 bg-amber-950/20 border border-amber-500/20 text-amber-400 text-[10px] font-sans rounded-lg leading-relaxed flex items-start gap-2 animate-pulse">
            <span>⚠️</span>
            <div>
              <strong>【目的地未設定】</strong>{" "}
              現在、目的地の緯度・経度が設定されていません。「2.
              目的地/健康」タブの地図上で行きたい場所をクリックすると同期されます。
            </div>
          </div>
        ) : null}

        {/* Chat Log Window */}
        <div className="h-56 overflow-y-auto bg-black/60 border border-zinc-800/80 rounded-lg p-4 flex flex-col gap-3 font-mono text-[10px] leading-relaxed custom-scrollbar shadow-inner">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-1">
                <span className="text-[9px]">
                  {msg.role === "user" ? "🛡️" : "🔮"}
                </span>
                <span
                  className={`text-[8px] uppercase tracking-wider font-bold ${msg.role === "user" ? "text-zinc-500" : "text-purple-400"}`}
                >
                  {msg.role === "user" ? "Admin / 管理者" : "Agent / 守護精霊"}
                </span>
              </div>
              <div
                className={`max-w-[85%] px-3.5 py-2 rounded-xl text-[11px] border leading-normal ${
                  msg.role === "user"
                    ? "bg-zinc-900 border-zinc-800 text-zinc-100 self-end rounded-tr-none shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
                    : "bg-purple-950/10 border-purple-500/10 text-zinc-300 self-start rounded-tl-none whitespace-pre-wrap shadow-[0_2px_15px_rgba(168,85,247,0.02)]"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex flex-col gap-1 items-start animate-pulse">
              <div className="flex items-center gap-1">
                <span className="text-[9px] animate-spin text-purple-400">
                  🔄
                </span>
                <span className="text-[8px] text-purple-400 uppercase tracking-wider font-bold">
                  [Processing / 思考同期中]
                </span>
              </div>
              <div className="bg-purple-950/10 border border-purple-500/10 text-purple-300 px-3.5 py-2 rounded-xl rounded-tl-none font-mono text-[10px] flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping"></span>
                {loadingStatus}
              </div>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSendMessage} className="flex gap-2 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder={
              isLoading
                ? "エージェントが思考を同期中..."
                : "アドバイスを求める、またはテーマ変更を指示..."
            }
            className="flex-1 bg-zinc-950 border border-zinc-800/80 focus:border-purple-500/40 rounded-lg px-4 py-2.5 text-zinc-200 outline-none text-xs font-mono disabled:opacity-50 transition-all duration-300 focus:shadow-[0_0_15px_rgba(168,85,247,0.1)]"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 hover:text-white border border-purple-800/50 disabled:opacity-40 disabled:hover:bg-purple-900/40 text-xs px-5 py-2.5 rounded-lg font-mono font-bold transition-all active:scale-[0.98] shadow-[0_2px_10px_rgba(168,85,247,0.1)] hover:shadow-[0_4px_15px_rgba(168,85,247,0.2)]"
          >
            送信
          </button>
        </form>
      </div>
    </div>
  );
}
