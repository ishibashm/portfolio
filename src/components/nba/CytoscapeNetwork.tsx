"use client";

import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

export interface CytoscapeNetworkProps {
  nbaData: any;
}

export const CytoscapeNetwork: React.FC<CytoscapeNetworkProps> = ({ nbaData }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current || !nbaData?.actionResult) return;

    const { stateVector } = nbaData;
    const { qValues, probabilities, suggestedAction } = nbaData.actionResult;

    if (!qValues || !probabilities) return;

    // Define nodes
    const nodes = [
      // Input Features
      { data: { id: 'F1', label: `自律神経\n${stateVector.ansLoad?.toFixed(1) || 0}`, type: 'feature' } },
      { data: { id: 'F2', label: `シールド\n${stateVector.shieldCapacity?.toFixed(1) || 0}`, type: 'feature' } },
      { data: { id: 'F3', label: `環境リスク\n${stateVector.environmentalRisk?.toFixed(1) || 50}`, type: 'feature' } },
      { data: { id: 'F4', label: `太陽位相\n${stateVector.solarPhase?.toFixed(1) || 0}°`, type: 'feature' } },

      // Output Actions
      { data: { id: 'DEEP_REST', label: `休息\nQ:${qValues['DEEP_REST']?.toFixed(2)}\n${(probabilities['DEEP_REST']*100).toFixed(1)}%`, type: 'action', isBest: suggestedAction === 'DEEP_REST' } },
      { data: { id: 'SHIELD_UP', label: `防御\nQ:${qValues['SHIELD_UP']?.toFixed(2)}\n${(probabilities['SHIELD_UP']*100).toFixed(1)}%`, type: 'action', isBest: suggestedAction === 'SHIELD_UP' } },
      { data: { id: 'NORMAL_OPS', label: `通常\nQ:${qValues['NORMAL_OPS']?.toFixed(2)}\n${(probabilities['NORMAL_OPS']*100).toFixed(1)}%`, type: 'action', isBest: suggestedAction === 'NORMAL_OPS' } },
      { data: { id: 'HIGH_INTENSITY_EXECUTION', label: `実行\nQ:${qValues['HIGH_INTENSITY_EXECUTION']?.toFixed(2)}\n${(probabilities['HIGH_INTENSITY_EXECUTION']*100).toFixed(1)}%`, type: 'action', isBest: suggestedAction === 'HIGH_INTENSITY_EXECUTION' } },
    ];

    // Define edges based on PolicyWeights
    const policyWeights: Record<string, { w_ans: number; w_shield: number; w_risk: number; w_solar: number }> = {
      DEEP_REST: { w_ans: 0.6, w_shield: -0.5, w_risk: 0.2, w_solar: 0.0 },
      SHIELD_UP: { w_ans: 0.2, w_shield: 0.1, w_risk: 0.7, w_solar: -0.2 },
      NORMAL_OPS: { w_ans: -0.2, w_shield: 0.3, w_risk: -0.2, w_solar: 0.2 },
      HIGH_INTENSITY_EXECUTION: { w_ans: -0.6, w_shield: 0.8, w_risk: -0.4, w_solar: 0.5 }
    };

    const edges: any[] = [];
    const featureMap = { F1: 'w_ans', F2: 'w_shield', F3: 'w_risk', F4: 'w_solar' };
    
    Object.keys(policyWeights).forEach(actionId => {
      Object.entries(featureMap).forEach(([fId, wKey]) => {
        const weight = policyWeights[actionId][wKey as keyof typeof policyWeights[typeof actionId]];
        if (Math.abs(weight) > 0) { // Only draw significant weights
          edges.push({
            data: {
              id: `${fId}-${actionId}`,
              source: fId,
              target: actionId,
              weight: weight,
              label: weight.toFixed(1)
            }
          });
        }
      });
    });

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: 'node[type="feature"]',
          style: {
            'background-color': '#1f2937',
            'border-color': '#60a5fa',
            'border-width': 2,
            'color': '#9ca3af',
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'font-size': 10,
            'width': 60,
            'height': 60,
            'shape': 'hexagon',
          }
        },
        {
          selector: 'node[type="action"]',
          style: {
            'background-color': '#111827',
            'border-color': '#4b5563',
            'border-width': 2,
            'color': '#d1d5db',
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'font-size': 10,
            'width': 70,
            'height': 70,
            'shape': 'round-rectangle',
          }
        },
        {
          selector: 'node[isBest]',
          style: {
            'border-color': '#10b981',
            'border-width': 3,
            'background-color': 'rgba(16, 185, 129, 0.1)',
            'color': '#10b981',
            'font-weight': 'bold',
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 'mapData(weight, -1, 1, 1, 4)',
            'line-color': (ele) => ele.data('weight') > 0 ? 'rgba(52, 211, 153, 0.4)' : 'rgba(248, 113, 113, 0.4)',
            'target-arrow-color': (ele) => ele.data('weight') > 0 ? 'rgba(52, 211, 153, 0.4)' : 'rgba(248, 113, 113, 0.4)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': 8,
            'color': '#6b7280',
            'text-rotation': 'autorotate',
            'text-margin-y': -8
          }
        }
      ],
      layout: {
        name: 'breadthfirst',
        directed: true,
        padding: 10,
        spacingFactor: 1.2
      },
      userZoomingEnabled: false,
      userPanningEnabled: false,
    });

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, [mounted, nbaData]);

  if (!mounted) return null;

  return (
    <div className="w-full h-[400px] relative bg-black/40 border border-zinc-800 rounded-xl overflow-hidden mt-4">
      <div className="absolute top-2 left-3 z-10">
        <h3 className="text-xs text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          ポリシーネットワーク可視化 (Q値)
        </h3>
        <p className="text-[10px] text-zinc-500 mt-1">緑の線: 正の重み。 赤の線: 負の重み。</p>
      </div>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
