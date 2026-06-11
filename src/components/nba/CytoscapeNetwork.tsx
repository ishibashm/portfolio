"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  ShieldAlert,
  Eye,
  Clock,
  Rocket,
  AlertTriangle,
  ShieldCheck,
  Sun,
  Activity,
} from "lucide-react";

export interface CytoscapeNetworkProps {
  nbaData: any;
}

export const CytoscapeNetwork: React.FC<CytoscapeNetworkProps> = ({
  nbaData,
}) => {
  if (!nbaData?.actionResult || !nbaData?.stateVector) return null;

  const { stateVector } = nbaData;
  const { qValues, suggestedAction } = nbaData.actionResult;

  if (!qValues) return null;

  // Define policy weights (same as the backend logic)
  const policyWeights: Record<
    string,
    { w_ans: number; w_shield: number; w_risk: number; w_solar: number }
  > = {
    ABORT_AND_SHIELD: { w_ans: 0.6, w_shield: -0.5, w_risk: 0.2, w_solar: 0.0 },
    GATHER_INTEL: { w_ans: 0.2, w_shield: 0.1, w_risk: 0.7, w_solar: -0.2 },
    PREPARE_AND_WAIT: {
      w_ans: -0.2,
      w_shield: 0.3,
      w_risk: -0.2,
      w_solar: 0.2,
    },
    EXECUTE_PURGE_RELOCATION: {
      w_ans: -0.2,
      w_shield: 1.0,
      w_risk: -0.4,
      w_solar: 0.2,
    },
    EXECUTE_RELOCATION: {
      w_ans: -0.6,
      w_shield: 0.8,
      w_risk: -0.4,
      w_solar: 0.5,
    },
  };

  const actionMeta: Record<
    string,
    { label: string; icon: React.ReactNode; desc: string }
  > = {
    ABORT_AND_SHIELD: {
      label: "休息・撤退",
      icon: <ShieldAlert className="w-4 h-4" />,
      desc: "現状維持を諦め、早急に回復を図る行動",
    },
    GATHER_INTEL: {
      label: "防御・様子見",
      icon: <Eye className="w-4 h-4" />,
      desc: "決定を保留し、周囲の情報を集める行動",
    },
    PREPARE_AND_WAIT: {
      label: "通常進行",
      icon: <Clock className="w-4 h-4" />,
      desc: "予定通りに、ただし慎重に進める行動",
    },
    EXECUTE_PURGE_RELOCATION: {
      label: "浄化・受動的移住",
      icon: <Rocket className="w-4 h-4" />,
      desc: "天中殺時の例外的な受け身の移動",
    },
    EXECUTE_RELOCATION: {
      label: "実行・前進",
      icon: <Rocket className="w-4 h-4" />,
      desc: "リソースを消費してでも強く前進する行動",
    },
  };

  const featureLabels = {
    w_ans: {
      name: "自律神経負荷",
      value: stateVector.ansLoad,
      icon: <Activity className="w-3 h-3" />,
    },
    w_shield: {
      name: "シールド残量",
      value: stateVector.shieldCapacity,
      icon: <ShieldCheck className="w-3 h-3" />,
    },
    w_risk: {
      name: "環境リスク",
      value: stateVector.environmentalRisk || 50,
      icon: <AlertTriangle className="w-3 h-3" />,
    },
    w_solar: {
      name: "太陽位相",
      value: stateVector.solarPhase,
      icon: <Sun className="w-3 h-3" />,
    },
  };

  const renderFactorBars = (actionId: string) => {
    const weights = policyWeights[actionId];
    if (!weights) return null;

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        {(
          Object.entries(weights) as [keyof typeof featureLabels, number][]
        ).map(([key, weight]) => {
          if (weight === 0) return null;

          const isPositive = weight > 0;
          const factor = featureLabels[key];

          return (
            <div
              key={key}
              className="flex flex-col gap-1 bg-black/40 p-2 rounded-lg border border-white/5 relative overflow-hidden group"
            >
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                {factor.icon}
                <span className="truncate">{factor.name}</span>
              </div>
              <div className="flex justify-between items-end mt-1">
                <span className="text-[10px] font-mono text-gray-500">
                  Val: {factor.value?.toFixed(0)}
                </span>
                <span
                  className={`text-xs font-bold font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}
                >
                  {isPositive ? "+" : ""}
                  {(weight * 10).toFixed(1)}
                </span>
              </div>
              {/* Progress Bar background */}
              <div className="w-full h-1 bg-black/60 rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${isPositive ? "bg-emerald-500/80" : "bg-red-500/80"}`}
                  style={{ width: `${Math.abs(weight) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col mt-4">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          AIの思考プロセス (要因影響度マトリクス)
        </h3>
        <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
          AIがそれぞれの行動を検討する際に、
          <strong className="text-emerald-400">
            どの入力データがプラス(後押し)
          </strong>
          に働き、<strong className="text-red-400">どれがマイナス(抑制)</strong>
          に働いたのかを可視化しています。
          <br />
          この総合的なバランスによって、最終的な最適解（★）が決定されています。
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {Object.keys(policyWeights).map((actionId) => {
          const isBest = suggestedAction === actionId;
          const qVal = qValues[actionId] || 0;
          const isDeactivated = qVal <= -900;

          // Dynamically adjust meta based on Q-Value
          const meta = { ...actionMeta[actionId] };
          if (actionId === "PREPARE_AND_WAIT" && qVal < 0) {
            meta.label = "警戒待機（マイナス回避）";
            meta.desc =
              "すべての選択肢がマイナス期待値のため、被害を最小限に抑える行動";
          }

          return (
            <motion.div
              key={actionId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl border relative overflow-hidden transition-all ${
                isBest
                  ? "bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                  : "bg-zinc-900/30 border-zinc-800/50 opacity-70 hover:opacity-100"
              }`}
            >
              {isBest && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
              )}

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                    {isBest && (
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500 text-white tracking-wider animate-pulse">
                        ★ FINAL DECISION
                      </span>
                    )}
                    <h4
                      className={`font-bold flex items-center gap-2 ${isBest ? "text-emerald-400 text-lg" : "text-zinc-300"}`}
                    >
                      {meta?.icon} {meta?.label}
                    </h4>
                  </div>
                  <p className="text-[10px] text-zinc-500">{meta?.desc}</p>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-widest">
                      Q-Value (期待値)
                    </span>
                    <span
                      className={`text-xl font-mono font-bold ${isDeactivated ? "text-red-400 text-xs font-bold animate-pulse" : qVal > 0 ? "text-emerald-400" : qVal < 0 ? "text-red-400" : "text-zinc-400"}`}
                    >
                      {isDeactivated
                        ? "DEACTIVATED (天中殺)"
                        : `${qVal > 0 ? "+" : ""}${qVal.toFixed(3)}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-white/5 relative z-10">
                <span className="text-[9px] text-zinc-500 uppercase tracking-widest">
                  評価要因 (Influence Factors)
                </span>
                {renderFactorBars(actionId)}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
