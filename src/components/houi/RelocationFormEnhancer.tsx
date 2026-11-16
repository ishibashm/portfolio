"use client";

/**
 * 引越しできる日の一覧のフォームを、JavaScript が動くときだけ便利にする。
 * 頁はサーバーで描いた GET フォームのままで、これが無くても動く。
 *
 * - 結果を出した後：URL の値を欄に戻す（サーバーは個人の値をフォームに
 *   書き戻さない。戻すのはこの端末の中だけ）。市区町村はサーバーが
 *   決めた正式名（resolvedPlace）で入れ直し、次の送信で迷わないようにする。
 * - 何も入れていない状態で開いたとき：端末に保存したプロフィール
 *   （lib/userSettings）の生年月日と、登録した現在地にいちばん近い
 *   市区町村を入れる。近い市区町村は datalist の候補（data-lat / data-lon）
 *   から選ぶ。外へは何も送らない。
 */

import { useEffect, useState } from "react";
import { hasUsableBase } from "@/lib/japanBounds";
import {
  loadSettings,
  readSettingsSync,
  settingString,
  type Settings,
} from "@/lib/userSettings";

const RESTORED_FIELDS = [
  "birthDate",
  "birthTime",
  "place",
  "from",
  "days",
  "lon",
] as const;

type Props = {
  formId: string;
  listId: string;
  /** サーバーが決めた市区町村の正式名（候補から選んだときなど） */
  resolvedPlace?: string;
};

function field(form: HTMLFormElement, name: string): HTMLInputElement | null {
  const el = form.elements.namedItem(name);
  return el instanceof HTMLInputElement ? el : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** datalist の候補から、いちばん近い市区町村名を返す。 */
export function nearestOptionName(
  options: ReadonlyArray<{ name: string; lat: number; lon: number }>,
  lat: number,
  lon: number,
): string | null {
  const k = Math.cos((lat * Math.PI) / 180);
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = (o.lat - lat) ** 2 + ((o.lon - lon) * k) ** 2;
    if (d < bestD) {
      bestD = d;
      best = o.name;
    }
  }
  return best;
}

export function RelocationFormEnhancer({
  formId,
  listId,
  resolvedPlace,
}: Props) {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const params = new URLSearchParams(window.location.search);

    if ([...params.keys()].length > 0) {
      for (const name of RESTORED_FIELDS) {
        const v = params.get(name);
        const el = field(form, name);
        if (el && v !== null && v !== "") el.value = v;
      }
      const placeEl = field(form, "place");
      if (placeEl && resolvedPlace) placeEl.value = resolvedPlace;
      const lonEl = field(form, "lon");
      if (lonEl?.value) {
        const details = lonEl.closest("details");
        if (details) details.open = true;
      }
      return;
    }

    let touched = false;
    const onInput = () => {
      touched = true;
    };
    form.addEventListener("input", onInput);

    const apply = (s: Settings) => {
      if (touched) return;
      const filled: string[] = [];
      const birth = settingString(s, "birth_date")?.slice(0, 10);
      const birthEl = field(form, "birthDate");
      if (
        birthEl &&
        !birthEl.value &&
        birth &&
        /^\d{4}-\d{2}-\d{2}$/.test(birth)
      ) {
        birthEl.value = birth;
        filled.push("生年月日");
      }
      const lat = num(s.base_lat);
      const lon = num(s.base_lon);
      const placeEl = field(form, "place");
      if (
        placeEl &&
        !placeEl.value &&
        lat !== null &&
        lon !== null &&
        hasUsableBase(lat, lon)
      ) {
        const list = document.getElementById(listId);
        const options = list
          ? [...list.querySelectorAll("option")].flatMap((o) => {
              const la = Number(o.dataset.lat);
              const lo = Number(o.dataset.lon);
              return Number.isFinite(la) && Number.isFinite(lo)
                ? [{ name: o.value, lat: la, lon: lo }]
                : [];
            })
          : [];
        const name = nearestOptionName(options, lat, lon);
        if (name) {
          placeEl.value = name;
          filled.push("登録した現在地にいちばん近い市区町村");
        }
      }
      if (filled.length) {
        setNote(
          `保存したプロフィールから、${filled.join("と")}を入れました。違うときは書き換えてください。`,
        );
      }
    };

    apply(readSettingsSync());
    let alive = true;
    void loadSettings()
      .then(({ settings }) => {
        if (alive) apply(settings);
      })
      .catch(() => {});
    return () => {
      alive = false;
      form.removeEventListener("input", onInput);
    };
  }, [formId, listId, resolvedPlace]);

  return note ? (
    <p className="w-full text-sm" aria-live="polite">
      {note}
    </p>
  ) : null;
}
