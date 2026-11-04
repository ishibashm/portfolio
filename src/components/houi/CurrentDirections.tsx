"use client";

import { useEffect, useState } from "react";
import {
  loadSettings,
  readSettingsSync,
  settingString,
} from "@/lib/userSettings";
import type { buildCurrentDirections } from "@/lib/todayDirections";

type Result = ReturnType<typeof buildCurrentDirections>;
const time = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));

export function CurrentDirections() {
  const [result, setResult] = useState<Result | null>(null);
  const [lon, setLon] = useState(139.6917);
  const [note, setNote] = useState("東京基準・日本時間（JST）");
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    let active = true;
    let birth = settingString(readSettingsSync(), "birth_date");
    const update = async () => {
      const { buildCurrentDirections } = await import("@/lib/todayDirections");
      if (active) setResult(buildCurrentDirections(new Date(), birth, lon));
    };
    void update();
    void loadSettings().then(({ settings }) => {
      birth = settingString(settings, "birth_date");
      return update();
    });
    const timer = window.setInterval(() => void update(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [lon]);
  const locate = () => {
    const fallback = () => {
      setLon(139.6917);
      setNote(
        "現在地を取得できないため、東京基準・日本時間（JST）で表示しています。",
      );
      setLocating(false);
    };
    if (!navigator.geolocation) return fallback();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (
          !Number.isFinite(coords.longitude) ||
          coords.longitude < 122 ||
          coords.longitude > 154 ||
          coords.latitude < 20 ||
          coords.latitude > 46
        )
          return fallback();
        setLon(coords.longitude);
        setNote("現在地基準・日本時間（JST）");
        setLocating(false);
      },
      fallback,
      { timeout: 10_000, maximumAge: 60_000 },
    );
  };
  return (
    <section
      aria-labelledby="current-directions-heading"
      className="wg-card space-y-2 p-4"
    >
      <h2 id="current-directions-heading" className="text-xl font-bold">
        今の時間の吉方位
      </h2>
      <div aria-live="polite">
        {result ? (
          <>
            <p className="text-sm">
              {result.date} {result.branch}の刻 {time(result.start)}〜
              {time(result.end)}（JST）
            </p>
            <p className="text-sm">
              {result.starName
                ? `保存済みプロフィール：${result.starName}`
                : "一般向け（生年月日の登録なし）"}
            </p>
            <p className="text-lg font-bold text-rose-700">
              吉方位：
              {result.lucky.join("・") ||
                (result.starName ? "なし" : "個人の吉方位は未判定")}
            </p>
            <p className="text-sm">
              避けたい方位：{result.unlucky.join("・") || "なし"}
            </p>
            {!result.starName && (
              <p className="text-xs">全員共通の凶方位を表示しています。</p>
            )}
          </>
        ) : (
          <p>現在の時間帯を確認しています…</p>
        )}
      </div>
      <button
        type="button"
        onClick={locate}
        disabled={locating}
        className="min-h-11 rounded-lg bg-rose-700 px-4 py-2 text-white disabled:opacity-60"
      >
        現在地で調べる
      </button>
      <p className="text-xs text-slate-600" role="status">
        {locating ? "現在地を取得しています…" : note}
      </p>
      <p className="text-xs text-slate-600">
        時盤の吉でも日盤の凶を優先します。真太陽時による簡易算出です。
      </p>
    </section>
  );
}
