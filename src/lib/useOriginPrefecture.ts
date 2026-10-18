"use client";

import { useEffect, useState } from "react";
import { nearestMunicipality } from "@/lib/nearestMunicipality";
import { PREFECTURE_CENTERS } from "@/lib/prefectureDirection";
import { readSettingsSync, settingNumber } from "@/lib/userSettings";

// 全国の市区町村データを追加せず、既存の県中心から最寄り県を求める。
const centers = Object.entries(PREFECTURE_CENTERS).map(([pref, point]) => ({
  ...point,
  pref,
  code: pref,
  city: "",
}));

function prefectureAt(lat: number, lon: number): string {
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return "";
  return nearestMunicipality(lat, lon, centers, Infinity)?.pref ?? "";
}

export function useOriginPrefecture() {
  const [pref, setPref] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const settings = readSettingsSync();
    const lat = settingNumber(settings, "base_lat");
    const lon = settingNumber(settings, "base_lon");
    // SSR と初回描画を空欄に揃え、マウント後に端末の保存値を反映する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lat !== undefined && lon !== undefined) setPref(prefectureAt(lat, lon));
  }, []);

  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("現在地を取得できません。県を選んでください。");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = prefectureAt(coords.latitude, coords.longitude);
        setPref(next);
        if (!next) setError("現在地を取得できません。県を選んでください。");
        setLocating(false);
      },
      () => {
        setError("現在地を取得できません。県を選んでください。");
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }

  // 県中心は利用者の正確な出発地ではないため、設定には書き戻さない。
  return { pref, setPref, locate, locating, error };
}
