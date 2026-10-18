"use client";

import { useState } from "react";
import { toJapanDateString } from "@/utils/japanDate";
import type { MunicipalityPoint } from "@/lib/municipalityCoords";

const chip =
  "rounded-lg border bg-white px-3 py-2 aria-pressed:border-teal-700 aria-pressed:bg-teal-100";
const presets = {
  today: "今日",
  month: "1か月後",
  quarter: "3か月後",
  half: "半年後",
} as const;

/** 月末は移動先の月の最終日に収める。端末のタイムゾーンに依存しない。 */
export function presetDate(
  kind: keyof typeof presets,
  todayISO: string,
): string {
  const [year, month, day] = todayISO.split("-").map(Number);
  const offset = { today: 0, month: 1, quarter: 3, half: 6 }[kind];
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}

export function DateChips({
  value,
  onChange,
  today = toJapanDateString(new Date()),
}: {
  value?: string;
  onChange: (value: string) => void;
  today?: string;
}) {
  const [custom, setCustom] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(presets) as (keyof typeof presets)[]).map((kind) => (
        <button
          key={kind}
          type="button"
          className={chip}
          aria-pressed={value === presetDate(kind, today)}
          onClick={() => {
            setCustom(false);
            onChange(presetDate(kind, today));
          }}
        >
          {presets[kind]}
        </button>
      ))}
      <button
        type="button"
        className={chip}
        aria-expanded={custom}
        onClick={() => setCustom(!custom)}
      >
        日付を選ぶ
      </button>
      {custom && (
        <input
          type="date"
          aria-label="日付を選ぶ"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

export function BirthYearPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string) => void;
}) {
  const [decade, setDecade] = useState<number>();
  if (value)
    return (
      <div>
        {value}年{" "}
        <button
          type="button"
          className={chip}
          onClick={() => {
            setDecade(undefined);
            onChange("");
          }}
        >
          変える
        </button>
      </div>
    );
  return (
    <fieldset>
      <legend>生まれ年は？</legend>
      <div className="flex flex-wrap gap-2">
        {decade === undefined ? (
          Array.from({ length: 8 }, (_, i) => 1940 + i * 10).map((year) => (
            <button
              key={year}
              type="button"
              className={chip}
              onClick={() => setDecade(year)}
            >
              {year}年代
            </button>
          ))
        ) : (
          <>
            <button
              type="button"
              className={chip}
              onClick={() => setDecade(undefined)}
            >
              年代を選び直す
            </button>
            {Array.from({ length: 10 }, (_, i) => decade + i).map((year) => (
              <button
                key={year}
                type="button"
                className={chip}
                onClick={() => onChange(String(year))}
              >
                {year}年
              </button>
            ))}
          </>
        )}
      </div>
    </fieldset>
  );
}

export function MonthDayPicker({
  year,
  value,
  onChange,
}: {
  year: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  const [month, setMonth] = useState(
    value?.startsWith(`${year}-`) ? Number(value.slice(5, 7)) : 0,
  );
  const days = month
    ? new Date(Date.UTC(Number(year), month, 0)).getUTCDate()
    : 0;
  return (
    <div>
      <fieldset>
        <legend>生まれた月は？</legend>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <button
              key={m}
              type="button"
              className={chip}
              aria-pressed={month === m}
              onClick={() => {
                setMonth(m);
                onChange("");
              }}
            >
              {m}月
            </button>
          ))}
        </div>
      </fieldset>
      {!!month && (
        <fieldset>
          <legend>生まれた日は？</legend>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
              const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              return (
                <button
                  key={day}
                  type="button"
                  className={chip}
                  aria-pressed={value === date}
                  onClick={() => onChange(date)}
                >
                  {day}日
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}

export type PickedOrigin = { name: string; lat?: number; lon?: number };

export function OriginChooser({
  onPick,
  savedLabel,
  onUseSaved,
  chooseLabel = "選ぶ",
}: {
  onPick: (origin: PickedOrigin) => void;
  savedLabel?: string;
  onUseSaved?: () => void;
  chooseLabel?: string;
}) {
  const [points, setPoints] = useState<MunicipalityPoint[]>([]);
  const [pref, setPref] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function choose() {
    setError("");
    try {
      const { MUNICIPALITY_POINTS } = await import("@/lib/municipalityCoords");
      setPoints(MUNICIPALITY_POINTS);
    } catch {
      setError("市区町村を読み込めませんでした。もう一度お試しください。");
    }
  }
  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("この端末では位置情報を利用できません。");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            `/api/geocode/reverse?lat=${position.coords.latitude.toFixed(2)}&lon=${position.coords.longitude.toFixed(2)}`,
          );
          if (!response.ok) throw new Error("reverse-failed");
          const data = await response.json();
          if (typeof data.data?.name !== "string" || !data.data.name)
            throw new Error("municipality-not-found");
          // 精密な現在地は使わず、市区町村の代表点に置き換える。
          // 座標が要る道具（吉日・街探し）でも、打ち直しや再検索が要らない。
          const { MUNICIPALITY_POINTS } =
            await import("@/lib/municipalityCoords");
          const point = MUNICIPALITY_POINTS.find(
            (p) => p.code === data.data.code,
          );
          onPick(
            point
              ? { name: data.data.name, lat: point.lat, lon: point.lon }
              : { name: data.data.name },
          );
        } catch {
          setError("市区町村を取得できませんでした。");
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setError(
          "位置情報を取得できませんでした。「選ぶ」から市区町村を選んでください。",
        );
      },
      { timeout: 10000 },
    );
  }
  return (
    <fieldset disabled={busy}>
      <legend>どこから？</legend>
      <div className="flex flex-wrap gap-2">
        {savedLabel && (
          <button
            type="button"
            className={chip}
            onClick={() =>
              onUseSaved ? onUseSaved() : onPick({ name: savedLabel })
            }
          >
            登録した出発地（{savedLabel}）
          </button>
        )}
        <button type="button" className={chip} onClick={locate}>
          {busy ? "現在地を確認中…" : "現在地"}
        </button>
        <button type="button" className={chip} onClick={() => void choose()}>
          {chooseLabel}
        </button>
      </div>
      <p className="text-xs text-slate-600">
        位置情報はボタンを押したときだけ使い、市区町村名にしてから使います。
      </p>
      {!!points.length && (
        <fieldset>
          <legend>都道府県を選ぶ</legend>
          <div className="flex flex-wrap gap-2">
            {[...new Set(points.map((p) => p.pref))].map((name) => (
              <button
                key={name}
                type="button"
                className={chip}
                aria-pressed={pref === name}
                onClick={() => setPref(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {pref && (
        <fieldset>
          <legend>市区町村を選ぶ</legend>
          <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
            {points
              .filter((p) => p.pref === pref)
              .map((p) => (
                <button
                  key={p.code}
                  type="button"
                  className={chip}
                  onClick={() =>
                    onPick({
                      name: `${p.pref}${p.city}`,
                      lat: p.lat,
                      lon: p.lon,
                    })
                  }
                >
                  {p.city}
                </button>
              ))}
          </div>
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
