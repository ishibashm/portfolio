import React from "react";
import { KYUSEI, getKyuseiBoard } from "../utils/kigaku";

interface KigakuBoardProps {
  centerStar: (typeof KYUSEI)[0];
}

export function KigakuBoard({ centerStar }: KigakuBoardProps) {
  const board = getKyuseiBoard(centerStar);

  // Labels for standard projection (South at Top is common in board View?
  // Or standard Map View North at Top?
  // "Fixed Board" (Luo Shu base) usually puts South at Top for data.
  // But let's stick to the visual grid defined in utils:
  // [SE] [S ] [SW]
  // [E ] [C ] [W ]
  // [NE] [N ] [NW]

  // Japanese Labels
  const directionsJp = [
    "南東",
    "南",
    "南西",
    "東",
    "中",
    "西",
    "北東",
    "北",
    "北西",
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="grid grid-cols-3 gap-2 p-4 bg-white/80 rounded-xl border border-stone-200 shadow-2xl md:backdrop-blur-xl max-w-[300px]">
        {board.map((star, index) => {
          const isCenter = index === 4;
          const label = directionsJp[index];

          return (
            <div
              key={index}
              className={`
                relative flex flex-col items-center justify-center w-20 h-20 rounded-lg border transition-all duration-500
                ${
                  isCenter
                    ? "bg-emerald-50 border-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                    : "bg-white/80 border-stone-200 hover:bg-stone-100/80 hover:border-stone-300"
                }
              `}
            >
              {/* Direction Label */}
              <span className="absolute top-1 left-1.5 text-[10px] text-stone-600 uppercase tracking-widest font-light">
                {label}
              </span>

              {/* Star Number & Name */}
              <div className="flex flex-col items-center mt-1">
                <span
                  className={`text-2xl font-serif ${isCenter ? "text-emerald-600 text-glow" : "text-stone-500"}`}
                >
                  {star.japanese.substring(2)}{" "}
                  {/* Extract "Ki-Sei", "Kin-Sei" etc? No. "Ippaku Suisei" -> "Suisei"? Use Number? */}
                  {/* Actually standard display is Number + Color/Element or Kanji.
                       Let's display the full "One White" or just "One".
                       Usually: "一白", "二黒".
                       star.japanese is "一白水星".
                       First 2 chars are usually the identifier.
                   */}
                  {star.japanese.substring(0, 2)}
                </span>
                <span
                  className={`text-[9px] uppercase tracking-widest mt-1 ${isCenter ? "text-emerald-600" : "text-stone-600"}`}
                >
                  {star.japanese.substring(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[9px] text-stone-600 tracking-widest uppercase">
        Luo Shu Layout (South Top)
      </div>
    </div>
  );
}
