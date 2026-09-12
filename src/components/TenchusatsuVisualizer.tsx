"use client";

import React, { useMemo } from "react";
import { calculateTenchusatsu } from "../utils/tenchusatsu";
import { honmeiYearFor } from "../utils/honmeiYear";
import { parseJapanDateTime } from "@/utils/japanDate";

interface TenchusatsuVisualizerProps {
  birthDateStr: string;
}

export const TenchusatsuVisualizer: React.FC<TenchusatsuVisualizerProps> = ({
  birthDateStr,
}) => {
  /*
    いまの年。**立春基準**で切る。暦年（getFullYear）で切ると 1/1〜立春の
    5 週間は次の年の干支で「年の天中殺」を出し、同じ日に
    /api/relocation/auspicious-days（getYearZhiExact = 立春切り）が
    「天中殺ではない」と言う。午未の人なら 2026-01-20 に食い違う。

    **判定と札で同じ値を使う。**判定だけを立春で切って、札
    （Current Year Status (2026)）は `new Date().getFullYear()` の
    ままだったので、1/1〜立春のあいだは**同じ枠の中で中身と札が
    別の年を指していた**（2026-01-20 なら 2025 年の状態に「2026」の
    札が付く）。暦年は実行環境のタイムゾーンでも変わるので、
    本番（UTC）でさらに 1 年ずれうる。
  */
  const currentYear = useMemo(() => honmeiYearFor(new Date()), []);

  const data = useMemo(() => {
    try {
      const bDate = parseJapanDateTime(birthDateStr);
      if (isNaN(bDate.getTime())) return null;
      // Calculate for a 12-year window around the current year
      return calculateTenchusatsu(bDate, currentYear);
    } catch {
      // 生年月日が読めない・干支が引けない。何も出さない。
      return null;
    }
  }, [birthDateStr, currentYear]);

  if (!data) return null;

  const baseYear = currentYear - 3;
  /*
    8 年ぶんの帯。見出しが「天中殺の周期」なのに、長らく日干支の欄と
    今年の状態の 2 枚しか描いておらず、この配列は計算だけして捨てて
    いた（CLAUDE.md 4 節の「消してはいけない未使用」に載せていた
    `years`）。総点検（2026-09-12）で描く先を作って繋いだ。
    12 年に 2 年が天中殺なので、3 年前から 4 年先までの 8 年を出せば
    必ず 1 回は見える。
  */
  const years = Array.from({ length: 8 }).map((_, i) => {
    const y = baseYear + i;
    const isVoid =
      data.previousVoidYears.includes(y) ||
      (y === currentYear && data.isYearTenchusatsu);
    return {
      year: y,
      status: isVoid ? "VOID" : "CLEAR",
    };
  });

  return (
    /*
      幅の上限はここでは持たない。以前は max-w-4xl（896px）を自分で持って
      いて、外側を広げても効かず両端に余白が残っていた。置かれる側が
      列で幅を決める。
    */
    <div className="bg-white/80 rounded-sm shadow-lg border border-stone-200 p-4 mt-4 w-full h-full">
      <h3 className="text-[10px] tracking-widest text-stone-500 mb-4 border-b border-stone-200 pb-2 flex items-center gap-2">
        <span className="text-red-500 blur-[0.5px]">◆</span> 天中殺の周期
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Profile */}
        <div className="bg-white/70 p-3 rounded-sm border border-stone-200 flex flex-col justify-center">
          <h4 className="font-semibold text-[10px] text-stone-600 tracking-widest mb-2 border-b border-stone-200 pb-1">
            生まれた日の干支
          </h4>
          {/*
              左右に振る行は、収まらないときだけ 2 段にする。以前は
              flex-nowrap のまま縮めていたので、狭い列（タブレットで
              2 列に割れたとき）に「Void Zodiac / Group:」とラベルが
              割れ、値も「午未 (Uma-/Hitsuji)」と語中で折れていた。
              ラベルと値それぞれは割らせず（whitespace-nowrap）、
              入らなければ値ごと次の行へ落とす。落ちても右寄せのまま
              にするため ml-auto を付ける。
            */}
          <dl className="space-y-1 text-sm font-mono">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="text-stone-600 text-[10px] whitespace-nowrap">
                生年月日
              </dt>
              <dd className="text-stone-600 ml-auto whitespace-nowrap">
                {birthDateStr}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="text-stone-600 text-[10px] whitespace-nowrap">
                日干支
              </dt>
              <dd className="font-bold text-stone-600 ml-auto whitespace-nowrap">
                {data.ganZhi}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="text-stone-600 text-[10px] whitespace-nowrap">
                天中殺（空亡）
              </dt>
              <dd className="text-red-700 font-bold tracking-widest ml-auto whitespace-nowrap">
                {data.tenchusatsu.name}
              </dd>
            </div>
          </dl>
          <div className="mt-3 text-[10px] text-stone-600 leading-tight">
            日干支から、四柱推命でいう天中殺（空亡）の年を求めています。12
            年のうち 2
            年で、伝統的に大きな決断や移動を控えるのが良いとされる期間です。
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col justify-center">
          <div
            className={`p-4 rounded-sm border ${data.isYearTenchusatsu ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"} text-center flex flex-col justify-center gap-2 h-full`}
          >
            <span className="text-[10px] tracking-widest font-bold text-stone-600">
              今年（{currentYear} 年・立春から）
            </span>
            {data.isYearTenchusatsu ? (
              <>
                <span className="text-xl md:text-2xl font-bold tracking-[0.2em] text-red-500">
                  年の天中殺
                </span>
                {/* 以前は red-400/80。赤地（red-50）に対して約 1.9:1 で
                    読めなかった。red-700 で 5.9:1。 */}
                <span className="text-[10px] text-red-700">
                  今年はあなたの天中殺の年です。伝統的に、引越しや大きな決断は避けるとされます。
                </span>
              </>
            ) : (
              <>
                <span className="text-xl md:text-2xl font-bold tracking-[0.2em] text-emerald-700">
                  天中殺ではない
                </span>
                <span className="text-[10px] text-emerald-700">
                  今年はあなたの天中殺の年ではありません。
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 8 年の帯。見出しの「周期」を実際に描く。 */}
      <ol
        className="mt-4 grid grid-cols-4 gap-1 sm:grid-cols-8"
        aria-label="前後 8 年の天中殺"
      >
        {years.map((y) => (
          <li
            key={y.year}
            className={`rounded-sm border px-1 py-1.5 text-center text-[10px] ${
              y.status === "VOID"
                ? "border-red-200 bg-red-50 text-red-700 font-bold"
                : "border-stone-200 bg-white/70 text-stone-600"
            } ${y.year === currentYear ? "ring-1 ring-stone-400" : ""}`}
          >
            <div>{y.year}</div>
            <div>{y.status === "VOID" ? "天中殺" : "—"}</div>
          </li>
        ))}
      </ol>
    </div>
  );
};
