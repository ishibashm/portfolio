import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";

export interface ForecastDataPoint {
  date: string;
  mean: number;
  lower_bound_95: number;
  upper_bound_95: number;
}

interface TimesFMChartProps {
  forecastData: ForecastDataPoint[];
  ticker?: string;
}

export const TimesFMChart = ({
  forecastData,
  ticker = "AAPL",
}: TimesFMChartProps) => {
  // もしデータがない場合のモックデータ生成 (useMemoを使用して純粋関数にする)
  const data = useMemo(() => {
    return forecastData && forecastData.length > 0
      ? forecastData
      : Array.from({ length: 30 }).map((_, i) => {
          const base = 150 + i * 0.5 + Math.random() * 2;
          const margin = (i + 1) * 0.3;
          const d = new Date();
          d.setDate(d.getDate() + i);
          return {
            date: d.toISOString(),
            mean: Number(base.toFixed(2)),
            lower_bound_95: Number((base - margin).toFixed(2)),
            upper_bound_95: Number((base + margin).toFixed(2)),
          };
        });
  }, [forecastData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900/95 border border-slate-700/80 p-3 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.3)] backdrop-blur-md">
          <p className="text-slate-400 text-xs mb-2 font-mono">
            {format(parseISO(label), "yyyy MMM dd")}
          </p>
          <div className="space-y-1 font-mono text-sm">
            <p className="text-blue-400 flex justify-between gap-4">
              <span>Upper (95%):</span>{" "}
              <span>${payload[0].payload.upper_bound_95.toFixed(2)}</span>
            </p>
            <p className="text-white font-bold flex justify-between gap-4 border-l-2 border-blue-500 pl-2">
              <span>Mean:</span>{" "}
              <span>${payload[0].payload.mean.toFixed(2)}</span>
            </p>
            <p className="text-blue-400/70 flex justify-between gap-4">
              <span>Lower (95%):</span>{" "}
              <span>${payload[0].payload.lower_bound_95.toFixed(2)}</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const startValue = data[0].mean;
  const endValue = data[data.length - 1].mean;
  const changePct = ((endValue - startValue) / startValue) * 100;
  const isPositive = changePct >= 0;

  return (
    <div className="w-full h-full flex flex-col font-sans">
      {/* Header Area */}
      <div className="flex justify-between items-start mb-2 px-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h4 className="text-2xl font-extrabold text-white tracking-tighter">
              {ticker}
            </h4>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
              TIMESFM-200M
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 uppercase tracking-widest font-medium">
            30-Day Predictive Horizon
          </p>
        </div>
        <div className="flex flex-col items-end">
          <p
            className={`text-xl font-mono font-bold tracking-tight ${isPositive ? "text-emerald-400" : "text-rose-400"}`}
          >
            {isPositive ? "+" : ""}
            {changePct.toFixed(2)}%
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">
            Expected Delta
          </p>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 w-full relative mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
          >
            <defs>
              {/* Gradient for the 95% Confidence Interval Band */}
              <linearGradient id="colorBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
              {/* Gradient for Mean Line */}
              <linearGradient id="colorMean" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1e293b"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={(str) => format(parseISO(str), "MM/dd")}
              stroke="#475569"
              tick={{ fill: "#64748b", fontSize: 10, fontFamily: "monospace" }}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
            />
            <YAxis
              domain={["dataMin - 5", "dataMax + 5"]}
              stroke="#475569"
              tick={{ fill: "#64748b", fontSize: 10, fontFamily: "monospace" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `$${val}`}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "#3b82f6",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />

            {/* The Confidence Interval Area. We use an Area chart where bottom is lower_bound and top is upper_bound.
                Recharts trick: we stack them or just draw upper and lower. 
                Instead, we draw [lower, upper] by formatting data if possible, or just draw upper with fill, and another area for lower with bg color.
                A cleaner way in Recharts is using dataKey={["lower_bound_95", "upper_bound_95"]} for Area.
            */}
            <Area
              type="monotone"
              dataKey="upper_bound_95"
              stroke="none"
              fill="url(#colorBand)"
              activeDot={false}
            />
            <Area
              type="monotone"
              dataKey="lower_bound_95"
              stroke="none"
              fill="#0f172a" /* Masking the bottom part to create a band */
              activeDot={false}
            />

            {/* The Mean Line */}
            <Area
              type="monotone"
              dataKey="mean"
              stroke="url(#colorMean)"
              strokeWidth={2}
              fill="none"
              activeDot={{
                r: 4,
                fill: "#3b82f6",
                stroke: "#0f172a",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
