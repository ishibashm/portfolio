"use client";

import React, { useState, useEffect } from "react";
import { Solar } from "lunar-javascript";
import { getZonedDateTimeFields } from "@/utils/solarTime";
import { getRokuyo } from "@/utils/lunar";

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

  /*
    見出しが「Standard JST」なので、端末の時計ではなく日本時間で出す。
    timeZone を付けないと toLocaleTimeString は端末のタイムゾーンで
    描くので、海外の端末では JST と名乗って現地時刻が出ていた。太陽時
    （この JST に eot + 経度差を足したもの）も同じぶんずれていた。
  */
  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Tokyo",
    });

  /*
    暦は**日本時間で**引く。Lunar.fromDate(date) は実行環境のタイムゾーンで
    年月日を読むため、海外の端末では日本と違う旧暦・六曜・月相が出ていた
    （#456 の Solar.fromDate と同じ罠。総点検が Solar の字面だけを
    探していて、Lunar 側のこの 1 件が網から漏れていた）。
  */
  /*
    日付は評価日（targetDate）の日本時間の年月日、時刻はいまの日本時間。
    以前は端末の現地時間で年月日と時分秒を組んでから JST に読み替えて
    いたので、日本より西の端末では旧暦・六曜が翌日にずれていた
    （UTC 20:00 の 9/6 → JST では 9/7）。
  */
  const day = getZonedDateTimeFields(targetDate, 9);
  const clock = getZonedDateTimeFields(now, 9);
  const lunarDate = Solar.fromYmdHms(
    day.year,
    day.month,
    day.day,
    clock.hours,
    clock.minutes,
    clock.seconds,
  ).getLunar();
  /*
    六曜は utils/lunar の getRokuyo に任せる。ここに同じ表と式
    （(月 + 日) % 6）の写しがあったが、lunar-javascript は閏月を**負の
    月番号**で返す（閏5月 → -5）ので、月初の数日で添字が負になり
    undefined を引いていた。下の startsWith / split で TypeError になり、
    評価日に 2028-06-23〜26 などを選ぶと時期タブごと落ちる。
    getRokuyo は絶対値を取ってこれを避けている（写しには入っていなかった）。
  */
  const lunarMonth = lunarDate.getMonth();
  const lunarDay = lunarDate.getDay();
  const rokuyoName = getRokuyo(targetDate);
  const yueXiang = lunarDate.getYueXiang(); // Phase name
  // 閏月は「閏5月」と出す。負の数をそのまま出すと「-5月」になる。
  const lunarMonthLabel =
    lunarMonth < 0 ? `閏${Math.abs(lunarMonth)}` : String(lunarMonth);
  const lunarDateString = `旧暦 ${lunarMonthLabel}月${lunarDay}日`;

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
        {/* 以前は "Matrix Phase (地磁気と太陽角による空間位相)" と書いて
            いたが、出しているのは真太陽時で切った 2 時間ごとの刻の十二支
            そのもの（getKimonHour）。地磁気は見ていない。実装のとおりに書く。 */}
        <div className="text-[10px] tracking-[0.2em] text-stone-600 mb-1">
          いまの刻
          <span className="hidden sm:block text-[10px] tracking-normal text-stone-600 mt-1 font-sans whitespace-nowrap">
            （真太陽時で切る 2 時間ごとの十二支）
          </span>
        </div>
        <div
          className={`text-4xl sm:text-5xl font-serif font-thin tracking-widest ${isVoidTime ? "text-red-500 text-glow-red md:animate-pulse" : "text-emerald-500 text-glow"}`}
        >
          {kimon?.japanese || "--"}
        </div>
        <div className="text-xs md:text-sm tracking-widest text-stone-500 font-serif">
          {kimon ? (isVoidTime ? "天中殺の刻" : "の刻") : "--"}
        </div>
      </div>

      {/* 2. Lunar Phase & Rokuyo */}
      <div className="text-center space-y-1 border-x border-stone-200 px-4 w-1/3">
        <div className="text-[10px] tracking-[0.2em] text-purple-500 mb-1">
          六曜・旧暦
          <span className="hidden sm:block text-[10px] tracking-normal text-stone-600 mt-1 font-sans whitespace-nowrap">
            （日本時間の暦日で引く）
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
          <div className="text-[10px] tracking-widest text-emerald-900/80">
            真太陽時
          </div>
          <div className="text-2xl sm:text-3xl font-mono font-light text-emerald-600">
            {formatTime(new Date(now.getTime() + (eot + longOffset) * 60000))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] tracking-widest text-stone-600">
            日本標準時
          </div>
          <div className="text-lg font-mono font-light text-stone-600">
            {formatTime(now)}
          </div>
        </div>
        {/* 真太陽時 ＝ 日本標準時 ＋ 均時差 ＋ 経度差。内訳を分で出す。 */}
        <div className="text-[10px] font-mono text-stone-600 gap-2 flex justify-end">
          <span>均時差 {eot.toFixed(1)} 分</span>
          <span>経度差 {longOffset.toFixed(1)} 分</span>
        </div>
      </div>
    </div>
  );
}
