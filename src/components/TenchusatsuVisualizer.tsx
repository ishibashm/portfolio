"use client";

import React from 'react';

/**
 * Tenchusatsu Visualizer
 * 
 * Visualizes the 12-year cycle and the "Void" periods.
 * Specifically highlights:
 * - Mother's Birth: 1957-11-30 (Day Pillar: Hei-Uma / Cycle 42)
 * - Group: Tora-U (Tiger-Rabbit)
 * - Void Years: 2022 (Tiger), 2023 (Rabbit)
 * - Current Year: 2026 (Horse) -> Released!
 */
export const TenchusatsuVisualizer: React.FC = () => {
  // Hardcoded for Demo (Mother's Data)
  // In a real app, this would take props or use the utility.
  // We will display the logic clearly.
  
  const birthDate = "1957-11-30";
  const dayPillar = "丙午 (Hei-Uma)";
  const tenchusatsuGroup = "寅卯 (Tiger-Rabbit)";
  
  const years = [
    { year: 2022, eto: "寅 (Tiger)", status: "VOID", label: "Year Tenchusatsu (Start)" },
    { year: 2023, eto: "卯 (Rabbit)", status: "VOID", label: "Year Tenchusatsu (End)" },
    { year: 2024, eto: "辰 (Dragon)", status: "VOID-S", label: "After-Burn (Month Void)" },
    { year: 2025, eto: "巳 (Snake)", status: "VOID-S", label: "After-Burn (Month Void)" },
    { year: 2026, eto: "午 (Horse)", status: "CLEAR", label: "DAWN (Release!)" },
    { year: 2027, eto: "未 (Sheep)", status: "CLEAR", label: "Growth" },
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 max-w-4xl mx-auto my-8">
      <h3 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">
        Logic Visualization: Why Move in 2026?
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile */}
        <div className="bg-indigo-50 p-4 rounded-lg">
          <h4 className="font-semibold text-indigo-800 mb-2">Subject Profile (Mother)</h4>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Birth Date:</dt><dd>{birthDate}</dd></div>
            <div className="flex justify-between"><dt>Day Pillar:</dt><dd className="font-mono font-bold">{dayPillar}</dd></div>
            <div className="flex justify-between"><dt>Tenchusatsu Group:</dt><dd className="text-red-600 font-bold">{tenchusatsuGroup}</dd></div>
          </dl>
          <div className="mt-4 text-xs text-indigo-600">
            * Calculated from Day Pillar (Gan-Zhi Index 42).
          </div>
        </div>

        {/* Timeline */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-2">Strategic Timeline</h4>
          <div className="space-y-2">
            {years.map((y) => (
              <div 
                key={y.year} 
                className={`flex items-center p-2 rounded border ${
                  y.year === 2026 
                    ? "bg-yellow-100 border-yellow-400 ring-2 ring-yellow-400" 
                    : y.status.startsWith("VOID")
                      ? "bg-gray-100 border-gray-300 opacity-70"
                      : "bg-green-50 border-green-200"
                }`}
              >
                <div className="w-16 font-bold text-gray-600">{y.year}</div>
                <div className="w-24 text-sm text-gray-500">{y.eto}</div>
                <div className="flex-1 font-semibold">
                  {y.status === "VOID" && <span className="text-gray-500">⚠ Void (Tenchusatsu)</span>}
                  {y.status === "VOID-S" && <span className="text-gray-400">⚠ Unstable</span>}
                  {y.status === "CLEAR" && <span className="text-green-600">◎ GO! (Clear)</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-green-50 p-4 rounded text-sm text-green-800">
        <strong>Conclusion:</strong> 
        The subject has exited the "Tiger-Rabbit" void period (2022-2023) and the subsequent buffer years. 
        2026 (Horse) is the <strong>First Favorable Year</strong> for major life changes (Relocation).
      </div>
    </div>
  );
};
