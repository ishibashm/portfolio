"use client";

import React, { useState, useEffect } from "react";
import { getRokuyo, getWeedingScore } from "../utils/lunar";

/**
 * Wedding Date Selector Component
 *
 * Demonstrates:
 * 1. Complex Calendar Logic (Rokuyo + Weekend + Custom Rules)
 * 2. React State Management (Year/Month Selection)
 * 3. Dynamic UI Rendering (Scoring based List)
 */
export const WeddingDateSelector: React.FC = () => {
  const [year, setYear] = useState<number>(2026);
  const [month, setMonth] = useState<number>(10); // Default October (Popular)
  const [dates, setDates] = useState<any[]>([]);

  useEffect(() => {
    generateCalendar();
  }, [year, month]);

  const generateCalendar = () => {
    const list = [];
    // Generate dates for the selected month
    const daysInMonth = new Date(year, month, 0).getDate(); // 0th day of next month is last day of current

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d); // Month is 0-indexed in JS Date

      // Calculate Logic
      // 1. Rokuyo (Six Labels)
      // Note: Our simple lunar logic might need offset tuning, but for demo visualization it works.
      // Need consistent "Solar -> Lunar" mapping.
      // We'll use a simplified cyclic pattern for demonstration if the lookup fails,
      // but let's try our utility first.

      // Since our simple utility is naive, we will display whatever comes out to prove logic integration.
      // Just ensure the cycle (Sensho -> Tomobiki...) is visible.
      // Actually, let's just use a simple cycle based on JD or similar if strict accuracy isn't critical.
      // BUT we implemented getRokuyo in utils, so let's use it.

      const rokuyo = getRokuyo(date); // This returns "大安 (Taian)" etc.

      // 2. Score
      const score = getWeedingScore(date, rokuyo);

      // 3. Recommendation Label
      let label = "";
      if (score >= 8) label = "◎ 大変おすすめ";
      else if (score >= 5) label = "○ おすすめ";
      else if (score >= 3) label = "△ 挙行可能";
      else label = "× 避けるべき";

      list.push({
        date: date,
        dayOfWeek: ["日", "月", "火", "水", "木", "金", "土"][date.getDay()],
        rokuyo: rokuyo,
        score: score,
        label: label,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      });
    }
    setDates(list);
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100 max-w-4xl mx-auto my-8">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          💒 結婚式吉日セレクター
        </h2>
        <p className="text-gray-500 text-sm">
          「プランB」デモ: 複雑なビジネスルールに基づく吉日選択シミュレーション
        </p>
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-4 mb-8">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-4 py-2 border rounded-lg bg-gray-50 hover:bg-white transition-colors cursor-pointer"
        >
          <option value={2025}>2025</option>
          <option value={2026}>2026</option>
          <option value={2027}>2027</option>
        </select>

        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="px-4 py-2 border rounded-lg bg-gray-50 hover:bg-white transition-colors cursor-pointer"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m}月
            </option>
          ))}
        </select>
      </div>

      {/* Results Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 border-b">
              <th className="p-4 font-semibold">日付</th>
              <th className="p-4 font-semibold">曜日</th>
              <th className="p-4 font-semibold">六曜</th>
              <th className="p-4 font-semibold">スコア</th>
              <th className="p-4 font-semibold">推奨度</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((item, index) => (
              <tr
                key={index}
                className={`border-b transition-colors hover:bg-gray-50 ${item.score >= 8 ? "bg-amber-50" : ""}`}
              >
                <td className="p-4 text-gray-800">{item.date.getDate()}</td>
                <td
                  className={`p-4 font-medium ${item.dayOfWeek === "日" ? "text-red-500" : item.dayOfWeek === "土" ? "text-blue-500" : "text-gray-600"}`}
                >
                  {item.dayOfWeek}
                </td>
                <td className="p-4">
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold ${
                      item.rokuyo.includes("大安")
                        ? "bg-red-100 text-red-700"
                        : item.rokuyo.includes("仏滅")
                          ? "bg-gray-200 text-gray-500"
                          : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {item.rokuyo}
                  </span>
                </td>
                <td className="p-4 font-mono text-gray-600">{item.score}</td>
                <td className="p-4">
                  <span
                    className={`font-bold ${
                      item.score >= 8
                        ? "text-amber-600"
                        : item.score >= 5
                          ? "text-green-600"
                          : "text-gray-400"
                    }`}
                  >
                    {item.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-xs text-gray-400 text-center">
        ※実装ロジック: (太陽暦 &rarr; 簡易旧暦計算 &rarr; 六曜算出) +
        土日祝ウェイト
      </div>
    </div>
  );
};
