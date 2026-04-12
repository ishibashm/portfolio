'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface ExpertCouncilPanelProps {
  actionIntent: string;
  targetDate: Date | null;
  honmeiStar: number | null;
  environmentalFrequencies: any;
  finalVectors: Record<string, string>;
  isPersonalVoid: boolean;
  kpIndex: number | null;
  xrayFlux: string | null;
  magneticF: number | null;
  magneticD: number | null;
  magneticI: number | null;
  hrv: number;
  gsr: number;
  ansLoad: number;
  shieldCapacity: number;
}

export default function ExpertCouncilPanel({
  actionIntent,
  targetDate,
  honmeiStar,
  environmentalFrequencies,
  finalVectors,
  isPersonalVoid,
  kpIndex,
  xrayFlux,
  magneticF,
  magneticD,
  magneticI,
  hrv,
  gsr,
  ansLoad,
  shieldCapacity
}: ExpertCouncilPanelProps) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState('');
  const [expanded, setExpanded] = useState(false);

  const fetchAdvice = async () => {
    if (!targetDate) return;
    setLoading(true);
    setResponse('');
    setExpanded(true);

    const prompt = `あなたは「気学・天体物理学・生体アルゴリズム・戦術司令官・データサイエンティスト」の5人の専門家からなる意思決定会議AIです。
以下の現在の状況を示すデータセットに基づき、対象のアクション「${actionIntent}」を実行すべきか、あるいは避けるべきかについての5人の専門家の見解を簡潔にまとめてください。日本語で応答してください。

【環境データ (Environmental Telemetry)】
- 予定日: ${targetDate.toISOString().split('T')[0]}
- 目的: ${actionIntent}
- ユーザーの本命星: ${honmeiStar}
- 天中殺（パーソナルヴォイド）: ${isPersonalVoid ? '警告（Yes）' : '安全（No）'}
- 宇宙天気 (Kp-Index): ${kpIndex !== null ? kpIndex : '不明'}
- 宇宙天気 (X-Ray Flux): ${xrayFlux || '不明'}
- 局所地磁気 (WMM2020): F(強度)=${magneticF ? magneticF.toFixed(0) : '不明'}nT, D(偏角)=${magneticD ? magneticD.toFixed(2) : '不明'}°, I(伏角)=${magneticI ? magneticI.toFixed(2) : '不明'}°
- 方位ごとのベクトル状態 (NOISE=危険, SAFE/OPTIMAL=安全):
${JSON.stringify(finalVectors, null, 2)}
- 空間周波数（年/月/日）: ${environmentalFrequencies?.yearStar}/${environmentalFrequencies?.monthStar}/${environmentalFrequencies?.dayStar}

【生体同期データ (Bio-Sync Diagnostics)】
- HRV (心拍変動): ${hrv} ms
- GSR (皮膚電気反応): ${gsr} μS
- ANS Overload Index (自律神経負荷): ${ansLoad}%
- Base Shield Cap (防御容量): ${shieldCapacity}%

【出力形式の指定】
必ず以下の5人の専門家のパラグラフを含めて、具体的な戦略分析を解説してください：
1. 🔭 天体物理学者 (Astrophysicist)
2. 🧭 気学師 (Geomancy Engineer)
3. 🧬 生体通信技師 (Bio-Sync Operator)
4. 🎖️ 戦術司令官 (Tactical Commander)
5. 📊 データサイエンティスト (Data Scientist)
`;

    try {
      const res = await fetch('/api/expert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!res.ok) {
        let errStr = "LLM API Error";
        try {
          const errObj = await res.json();
          if (errObj.error) errStr = errObj.error;
        } catch(e) {}
        throw new Error(errStr);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder('utf-8');

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunkStr = decoder.decode(value, { stream: true });
          setResponse(prev => prev + chunkStr);
        }
      }
    } catch (err: any) {
      console.error(err);
      setResponse(`**[System Error]** \n\n${err.message}\n\nSettings（Hardware Init）から Gemini API キーが正しく設定されているか、またはログインしているか確認してください。`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col shadow-lg z-10 transition-all duration-300">
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-2">
          <span className="text-yellow-500 animate-pulse">◆</span>
          <h3 className="text-xs text-zinc-300 font-bold uppercase tracking-widest">Expert Council <span className="text-[9px] text-zinc-500 font-normal ml-1">/ 専門家会議</span></h3>
        </div>
        <button
          onClick={fetchAdvice}
          disabled={loading || !targetDate}
          className="px-4 py-1.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 rounded text-[10px] uppercase font-mono tracking-wider hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
        >
          {loading ? 'Analyzing...' : 'Consult / 諮問する'}
        </button>
      </div>
      <p className="text-[10px] text-zinc-500 mb-3">Gemini APIを利用し、現在のベクトル情報に関する5人の専門家の見解を生成します。</p>
      
      <details className="mb-2 group">
        <summary className="text-[9px] text-zinc-500 cursor-pointer font-mono uppercase tracking-widest hover:text-zinc-400 transition-colors list-none flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform">▶</span> Show Input Telemetry (送出データセット)
        </summary>
        <div className="mt-2 p-2 bg-black/50 border border-zinc-800 rounded-sm text-[8px] md:text-[9px] text-zinc-400 font-mono whitespace-pre-wrap break-all h-32 overflow-y-auto custom-scrollbar">
          {`[ENVIRONMENTAL DATA]
- TARGET DATE: ${targetDate ? targetDate.toISOString().split('T')[0] : 'UNDEFINED'}
- ACTION INTENT: ${actionIntent}
- HONMEI STAR: ${honmeiStar || 'UNDEFINED'}
- PERSONAL VOID: ${isPersonalVoid ? 'YES (WARNING)' : 'NO (SAFE)'}
- KP-INDEX: ${kpIndex !== null ? kpIndex : 'UNDEFINED'}
- X-RAY FLUX: ${xrayFlux || 'UNDEFINED'}
- MAGNETIC (F/D/I): ${magneticF ? magneticF.toFixed(0) : 'UD'}nT / ${magneticD ? magneticD.toFixed(2) : 'UD'}° / ${magneticI ? magneticI.toFixed(2) : 'UD'}°
- FREQUENCIES: Y:${environmentalFrequencies?.yearStar || 'UD'} / M:${environmentalFrequencies?.monthStar || 'UD'} / D:${environmentalFrequencies?.dayStar || 'UD'}

[BIO-SYNC DIAGNOSTICS]
- HRV: ${hrv} ms
- GSR: ${gsr} μS
- ANS LOAD: ${ansLoad}%
- SHIELD CAP: ${shieldCapacity}%

- VECTOR STATE:`}
          <br/>{JSON.stringify(finalVectors, null, 2)}
        </div>
      </details>

      {expanded && (
        <div className="mt-3 pt-4 border-t border-zinc-800">
          <div className="text-sm text-zinc-300 leading-relaxed max-h-[500px] overflow-y-auto pr-2 custom-scrollbar space-y-4">
            {response ? (
              <ReactMarkdown 
                components={{
                  h3: ({node, ...props}: any) => <h3 className="text-emerald-400 font-bold text-sm mt-4 mb-2" {...props} />,
                  ul: ({node, ...props}: any) => <ul className="list-disc pl-5 space-y-1 my-2" {...props} />,
                  li: ({node, ...props}: any) => <li className="text-zinc-300 text-xs" {...props} />,
                  p: ({node, ...props}: any) => <p className="text-zinc-300 text-xs mb-3 leading-relaxed" {...props} />,
                  strong: ({node, ...props}: any) => <strong className="text-white font-bold" {...props} />
                }}
              >
                {response}
              </ReactMarkdown>
            ) : (
              <p className="text-zinc-500 italic text-center py-8 animate-pulse font-mono tracking-widest">Connecting to Expert Council Interface...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
