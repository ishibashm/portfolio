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
}

export default function ExpertCouncilPanel({
  actionIntent,
  targetDate,
  honmeiStar,
  environmentalFrequencies,
  finalVectors,
  isPersonalVoid,
  kpIndex
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

【環境データ】
- 予定日: ${targetDate.toISOString().split('T')[0]}
- 目的: ${actionIntent}
- ユーザーの本命星: ${honmeiStar}
- 天中殺（パーソナルヴォイド）: ${isPersonalVoid ? '警告（Yes）' : '安全（No）'}
- 宇宙天気 (Kp-Index): ${kpIndex !== null ? kpIndex : '不明'}
- 方位ごとのベクトル状態 (NOISE=危険, SAFE/OPTIMAL=安全):
${JSON.stringify(finalVectors, null, 2)}
- 空間周波数（年/月/日）: ${environmentalFrequencies?.yearStar}/${environmentalFrequencies?.monthStar}/${environmentalFrequencies?.dayStar}

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
        body: JSON.stringify({ prompt, model: 'gemma4' })
      });

      if (!res.ok) {
        throw new Error('LLM API Error');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder('utf-8');

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunkStr = decoder.decode(value, { stream: true });
          const lines = chunkStr.split('\n').filter(l => l.trim() !== '');
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.response) {
                setResponse(prev => prev + data.response);
              }
            } catch (e) {
              // Ignore partial or malformed lines
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setResponse('**[System Error]** ローカルLLM（Ollama）への接続に失敗しました。Ollamaがポート11434で起動し、gemma4モデルが利用可能か確認してください。\n\n詳細なログ: ' + err);
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
      <p className="text-[10px] text-zinc-500 mb-2 h-4">ローカルLLMを呼び出し、現在のベクトル情報に関する5人の専門家の見解を生成します。</p>
      
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
              <p className="text-zinc-500 italic text-center py-8 animate-pulse font-mono tracking-widest">Connecting to Local AI Interface...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
