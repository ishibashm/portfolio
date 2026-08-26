"use client";

import React, { useState, useEffect } from "react";
import { Solar } from "lunar-javascript";
import { getZonedDateTimeFields } from "@/utils/solarTime";

interface ClockDisplayProps {
  kimon: {
    name: string;
    japanese: string;
    reading: string;
    note?: string;
  } | null;
  isVoidTime: boolean;
  /**
   * 呼び出し側が `calculateSolarTime` で出した太陽時。
   *
   * **この部品は受け取るだけで描画には使っていない。**渡された値は
   * 呼ばれた瞬間の 1 点で止まるので、そのまま出すと秒針が動かない。
   * 表示は毎秒の `now` に `eot + longOffset` を足して同じ太陽時を
   * 組み直している（128 行）。
   *
   * 受け口は残す。消すと `SolarTimeClock` 側の呼び出しとずれる。
   */
  solarTime: Date;
  eot: number;
  longOffset: number;
  targetDate?: Date;
}

export function ClockDisplay({
  kimon,
  isVoidTime,
  eot,
  longOffset,
  targetDate = new Date(),
}: ClockDisplayProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  // Calculate Lunar & Rokuyo from targetDate (evaluation date) instead of now
  const displayDate = new Date(targetDate);
  displayDate.setHours(
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  );

  /*
    暦は**日本時間で**引く。Lunar.fromDate(date) は実行環境のタイムゾーンで
    年月日を読むため、海外の端末では日本と違う旧暦・六曜・月相が出ていた
    （#456 の Solar.fromDate と同じ罠。総点検が Solar の字面だけを
    探していて、Lunar 側のこの 1 件が網から漏れていた）。
  */
  const jst = getZonedDateTimeFields(displayDate, 9);
  const lunarDate = Solar.fromYmdHms(
    jst.year,
    jst.month,
    jst.day,
    jst.hours,
    jst.minutes,
    jst.seconds,
  ).getLunar();
  const ROKUYO_MAP = [
    "大安 (Taian)",
    "赤口 (Shakku)",
    "先勝 (Sensho)",
    "友引 (Tomobiki)",
    "先負 (Sakimake)",
    "仏滅 (Butsumetsu)",
  ];
  const lunarMonth = lunarDate.getMonth();
  const lunarDay = lunarDate.getDay();
  const rokuyoName = ROKUYO_MAP[(lunarMonth + lunarDay) % 6];
  const yueXiang = lunarDate.getYueXiang(); // Phase name
  const lunarDateString = `旧暦 ${lunarMonth}月${lunarDay}日`;

  const getRokuyoColor = (r: string) => {
    if (r.startsWith("大安")) return "text-emerald-600 font-bold";
    if (r.startsWith("友引")) return "text-blue-600 font-bold";
    if (r.startsWith("仏滅") || r.startsWith("赤口"))
      return "text-red-600 font-bold";
    return "text-stone-600";
  };

  return (
    /*
      幅の上限はここでは持たない（#347 と同じ型）。中身は左右に離して
      置く 2 つの塊なので、広げると間が開くだけになる。そうならないよう
      justify-between をやめ、中央に寄せて間隔で並べる。
    */
    <div className="flex flex-col md:flex-row items-center justify-center gap-10 w-full border border-stone-200 bg-white/70 p-6 rounded-sm md:backdrop-blur-sm relative">
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500"></div>

      {/* 1. Spatial Phase (Kimon) */}
      <div className="text-center md:text-left space-y-1 w-1/3">
        <div className="text-[9px] md:text-[10px] tracking-[0.2em] md:tracking-[0.3em] text-stone-600 uppercase font-mono mb-1">
          Matrix Phase
          <span className="hidden sm:block text-[9px] tracking-normal text-stone-600 mt-1 normal-case font-sans whitespace-nowrap">
            (地磁気と太陽角による空間位相)
          </span>
        </div>
        <div
          className={`text-4xl sm:text-5xl font-serif font-thin tracking-widest ${isVoidTime ? "text-red-500 text-glow-red md:animate-pulse" : "text-emerald-500 text-glow"}`}
        >
          {kimon?.japanese || "--"}
        </div>
        <div className="text-xs md:text-sm tracking-widest text-stone-500 font-serif">
          {kimon?.reading || "--"}
        </div>
      </div>

      {/* 2. Lunar Phase & Rokuyo */}
      <div className="text-center space-y-1 border-x border-stone-200 px-4 w-1/3">
        <div className="text-[9px] md:text-[10px] tracking-[0.2em] md:tracking-[0.3em] text-purple-400/80 uppercase font-mono mb-1">
          Lunar Cycle
          <span className="hidden sm:block text-[9px] tracking-normal text-stone-600 mt-1 normal-case font-sans whitespace-nowrap">
            (太陰暦 / 東洋カレンダー基準)
          </span>
        </div>
        <div
          className={`text-2xl sm:text-3xl font-serif tracking-widest ${getRokuyoColor(rokuyoName)}`}
        >
          {rokuyoName.split(" ")[0]}
        </div>
        <div className="text-[10px] md:text-xs tracking-widest text-stone-500 font-mono mt-2">
          {lunarDateString} / {yueXiang}
        </div>
      </div>

      {/* 3. Temporal Phase (Time) */}
      <div className="flex flex-col items-center md:items-end space-y-3 w-1/3">
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-widest text-emerald-900/80 font-mono">
            True Solar Time
          </div>
          <div className="text-2xl sm:text-3xl font-mono font-light text-emerald-600">
            {formatTime(new Date(now.getTime() + (eot + longOffset) * 60000))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-widest text-stone-600 font-mono">
            Standard JST
          </div>
          <div className="text-lg font-mono font-light text-stone-600">
            {formatTime(now)}
          </div>
        </div>
        <div className="text-[10px] font-mono text-stone-600 gap-2 flex justify-end">
          <span>EOT:{eot.toFixed(1)}m</span>
          <span>OS:{longOffset.toFixed(1)}m</span>
        </div>
      </div>
    </div>
  );
}
