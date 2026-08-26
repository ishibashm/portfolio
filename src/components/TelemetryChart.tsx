"use client";

import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/** 読み込みの結末。「空」と「失敗」を別に扱う（案内する文言が違う）。 */
type Phase = "loading" | "ready" | "empty" | "error";

export default function TelemetryChart() {
  /* API の行。読むのは recharts の dataKey（date / sunLon など）と
     CSV 書き出しの Object.keys/values だけなので Record で受ける。 */
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/telemetry/history");
        if (!res.ok) {
          setPhase("error");
          return;
        }
        const json = await res.json();
        if (!Array.isArray(json) || json.length === 0) {
          setPhase("empty");
          return;
        }
        setData(json);
        setPhase("ready");
      } catch (e) {
        console.error(e);
        setPhase("error");
      }
    }

    fetchData();
  }, []);

  const exportData = () => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).join(",");
    const csv = [
      headers,
      ...data.map((row) => Object.values(row).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `telemetry-history-${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (phase === "loading")
    return (
      <div className="text-stone-600 font-mono text-xs">
        Loading chart data...
      </div>
    );

  /*
    記録が無いとき・取れなかったときは、**そう書く。**

    以前はここで Math.random() の作り物に差し替えて、そのまま描いていた。
    画面には作り物であることが一切出ず、利用者は自分の記録として乱数の
    グラフを見ていた。九星（yearStar / monthStar / dayStar）まで乱数
    だったので、明らかに嘘の数字が出ていた。CSV の書き出しも同じ乱数を
    そのまま出していて、手元に作り物のデータが残る状態だった。

    **数字を作らない。**貯まっていないなら「貯まっていない」と出す。
  */
  if (phase !== "ready") {
    return (
      <div className="w-full bg-white/80 border border-stone-200 rounded-xl p-6 text-center">
        <p className="text-sm font-bold text-stone-700 mb-2">
          {phase === "empty"
            ? "まだ記録がありません"
            : "記録を読み込めませんでした"}
        </p>
        <p className="text-xs text-stone-500 leading-relaxed max-w-[70ch] mx-auto">
          {phase === "empty"
            ? "この画面は、日ごとの環境（天体の位置・宇宙天気・地磁気）と体調の記録を並べて、引越しの前後で何が変わったかを後から見返すためのものです。記録は夜間の巡回で 1 日 1 件ずつ貯まります。"
            : "時間をおいて開き直してください。直らない場合は記録の巡回が止まっている可能性があります。"}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex justify-end mb-2">
        <button
          onClick={exportData}
          className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-600 text-[10px] font-mono uppercase tracking-widest rounded-lg border border-stone-300 transition-colors flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export All Data (CSV)
        </button>
      </div>
      {/* Chart 1: Raw Ephemeris Coordinates */}
      <div className="w-full h-64 bg-white/80 rounded-xl p-4 border border-stone-200">
        <h3 className="text-xs text-stone-600 font-bold uppercase tracking-widest mb-4 border-b border-stone-200 pb-2">
          <span className="text-emerald-600 mr-2">🪐</span>
          Raw Ephemeris / 天体黄経 (度数)
        </h3>
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="date"
              stroke="#666"
              tick={{ fill: "#888", fontSize: 10 }}
            />
            <YAxis stroke="#888" tick={{ fontSize: 10 }} domain={[0, 360]} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #3f3f46",
                fontSize: "10px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "10px" }} />
            <Line
              type="monotone"
              dataKey="sunLon"
              stroke="#fbbf24"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="太陽 (Sun)"
            />
            <Line
              type="monotone"
              dataKey="moonLon"
              stroke="#e2e8f0"
              strokeWidth={1}
              dot={{ r: 2 }}
              name="月 (Moon)"
            />
            <Line
              type="monotone"
              dataKey="jupiterLon"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="木星 (Jupiter)"
            />
            <Line
              type="monotone"
              dataKey="lunarNode"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="交点 (Node)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2: Space Weather */}
      <div className="w-full h-64 bg-white/80 rounded-xl p-4 border border-stone-200">
        <h3 className="text-xs text-stone-600 font-bold uppercase tracking-widest mb-4 border-b border-stone-200 pb-2">
          <span className="text-rose-600 mr-2">☀️</span>
          Space Weather / 宇宙天気
        </h3>
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="date"
              stroke="#666"
              tick={{ fill: "#888", fontSize: 10 }}
            />
            <YAxis
              yAxisId="left"
              stroke="#eab308"
              tick={{ fontSize: 10 }}
              domain={[0, 9]}
              label={{
                value: "Kp-Index",
                angle: -90,
                position: "insideLeft",
                style: { fill: "#eab308", fontSize: "10px" },
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#f43f5e"
              tick={{ fontSize: 10 }}
              scale="log"
              domain={["auto", "auto"]}
              label={{
                value: "X-Ray Flux",
                angle: 90,
                position: "insideRight",
                style: { fill: "#f43f5e", fontSize: "10px" },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #3f3f46",
                fontSize: "10px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "10px" }} />
            <Line
              yAxisId="left"
              type="step"
              dataKey="kpIndex"
              stroke="#eab308"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="磁気嵐指数 (Kp)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="xrayFlux"
              stroke="#f43f5e"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="X線フラックス (X-Ray)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 3: Geomagnetics */}
      <div className="w-full h-64 bg-white/80 rounded-xl p-4 border border-stone-200">
        <h3 className="text-xs text-stone-600 font-bold uppercase tracking-widest mb-4 border-b border-stone-200 pb-2">
          <span className="text-blue-600 mr-2">🧲</span>
          Geomagnetic Field / 局所地磁気ベクトル
        </h3>
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="date"
              stroke="#666"
              tick={{ fill: "#888", fontSize: 10 }}
            />
            <YAxis
              yAxisId="left"
              stroke="#3b82f6"
              tick={{ fontSize: 10 }}
              domain={["auto", "auto"]}
              label={{
                value: "Intensity F (nT)",
                angle: -90,
                position: "insideLeft",
                style: { fill: "#3b82f6", fontSize: "10px" },
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#06b6d4"
              tick={{ fontSize: 10 }}
              domain={["auto", "auto"]}
              label={{
                value: "Angle (°)",
                angle: 90,
                position: "insideRight",
                style: { fill: "#06b6d4", fontSize: "10px" },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #3f3f46",
                fontSize: "10px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "10px" }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="magneticF"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="全磁力 (F)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="magneticD"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="偏角 (D)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="magneticI"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="伏角 (I)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/*
        生体自律神経（HRV/GSR/自律神経負荷/防御容量）のグラフはここにあったが、
        これらは利用者ごとの値で、サイト全体の日次ログには記録されない。
        保存先が無いまま [MOCK DATA] の空グラフを公開ページに出していたので外した。
        個人の生体データはホームのプロフィール設定から入力し、その場の判定に使う。
      */}
      {/* Chart 5: Geomancy & Lunar */}
      <div className="w-full h-64 bg-white/80 rounded-xl p-4 border border-stone-200 relative">
        <h3 className="text-xs text-stone-600 font-bold uppercase tracking-widest mb-4 border-b border-stone-200 pb-2 flex items-center justify-between">
          <div>
            <span className="text-emerald-500 mr-2">🧭</span>
            Geomancy & Lunar Phase / 気学星・月相
          </div>
        </h3>
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="date"
              stroke="#666"
              tick={{ fill: "#888", fontSize: 10 }}
            />
            <YAxis
              yAxisId="left"
              stroke="#10b981"
              tick={{ fontSize: 10 }}
              domain={[1, 9]}
              label={{
                value: "Star Number",
                angle: -90,
                position: "insideLeft",
                style: { fill: "#10b981", fontSize: "10px" },
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#e2e8f0"
              tick={{ fontSize: 10 }}
              domain={[0, 100]}
              label={{
                value: "Illumination %",
                angle: 90,
                position: "insideRight",
                style: { fill: "#e2e8f0", fontSize: "10px" },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #3f3f46",
                fontSize: "10px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "10px" }} />
            <Line
              yAxisId="left"
              type="step"
              dataKey="yearStar"
              stroke="#059669"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="年盤星"
            />
            <Line
              yAxisId="left"
              type="step"
              dataKey="monthStar"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="月盤星"
            />
            <Line
              yAxisId="left"
              type="step"
              dataKey="dayStar"
              stroke="#34d399"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="日盤星"
            />
            {/*
              以前は <Area> を <LineChart> の中に置いていた。Recharts では
              描画されない組み合わせなので、データがあっても月相は出なかった。
            */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="lunarIllumination"
              stroke="#94a3b8"
              strokeWidth={2}
              dot={false}
              name="月相 (輝面率 %)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
