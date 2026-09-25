"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  listingDetailLabels,
  numericListingFields,
  type ListingDetails,
} from "@/lib/listingDetails";
import type { DayKigakuInput } from "@/lib/dayKigakuClient";
import type { SpotTarget } from "./SpotVerdict";
import {
  candidateContextSchema,
  normalizeCandidateUrl,
} from "@/lib/listingCandidateInput";

export function CandidateSave({
  target,
  context,
  url,
  memo,
  ready,
  title,
  onTitleChange,
  onFocus,
  details = {},
  onDetailsChange,
}: {
  details?: ListingDetails;
  onDetailsChange?: (details: ListingDetails) => void;
  target: SpotTarget;
  context: DayKigakuInput;
  url: string;
  memo: string;
  ready: boolean;
  title: string;
  onTitleChange: (title: string) => void;
  onFocus?: (lat: number, lon: number) => void;
}) {
  const [viewed, setViewed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<number | null>(null);
  const [login, setLogin] = useState(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const normalizedUrl = url.trim() ? normalizeCandidateUrl(url.trim()) : null;
  useEffect(() => {
    setDuplicates(null);
    if (!normalizedUrl) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/relocation/candidates/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (res.ok) {
            const b = await res.json();
            if (!controller.signal.aborted) setDuplicates(b.count);
          }
        })
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedUrl]);
  const valid =
    ready &&
    candidateContextSchema.safeParse(context).success &&
    target.source !== "municipality";
  const content = JSON.stringify({
    url: normalizedUrl,
    title,
    memo,
    details,
    target: {
      lat: target.lat,
      lon: target.lon,
      source: target.source ?? target.inputSource ?? "pin",
      approximate: !!target.source,
      confirmed: true,
    },
    context,
  });
  async function save() {
    if (busy) return;
    if (url.trim() && !normalizedUrl) {
      setError(
        "通常のHTTPS URLを入力してください。認証情報・追跡先・フラグメントを含むURLは保存できません。",
      );
      return;
    }
    if (!attempt.current || attempt.current.body !== content)
      attempt.current = { body: content, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/relocation/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...JSON.parse(content),
          requestKey: attempt.current.key,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setLogin(res.status === 401);
        throw new Error(body.error || "保存できませんでした。");
      }
      setSaved(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-2 border-t pt-3 text-xs">
      <p>
        短距離や方位の境界付近では、ピンの位置によって方位が変わるため再確認してください。
      </p>
      <p>候補への方位です。部屋の窓・玄関の向きではありません。</p>
      <p>
        状態:{" "}
        {saved === content ? "保存済み" : confirmed ? "判定可能" : "位置確認"}
      </p>
      {target.source && (
        <p className="text-amber-700">
          概略位置です。住所検索は建物の位置を保証しません。地図で確かめ、必要ならピンを指定し直してください。
        </p>
      )}
      <button
        type="button"
        className="underline"
        onClick={() => {
          onFocus?.(target.lat, target.lon);
          setViewed(true);
        }}
      >
        地図で所在地を確認する
      </button>
      <label className="block">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!viewed || target.source === "municipality"}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{" "}
        地図の所在地を確認しました
        {target.source ? "（概略位置として記録）" : ""}
      </label>
      <label className="block">
        候補タイトル（任意）
        <input
          className="block w-full rounded border p-2"
          maxLength={120}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </label>
      {onDetailsChange && (
        <fieldset className="space-y-2">
          <legend>物件情報（メールからの推測・修正できます）</legend>
          <p>
            住所を直した場合は、住所検索または地図ピンで位置も確認してください。
          </p>
          {Object.entries(listingDetailLabels).map(([rawKey, label]) => {
            const key = rawKey as keyof ListingDetails;
            const numeric = numericListingFields.has(key);
            return (
              <label className="block" key={key}>
                {label}
                <input
                  className="block w-full rounded border p-2"
                  type={numeric ? "number" : "text"}
                  min={0}
                  step={key === "floorAreaM2" ? "any" : 1}
                  maxLength={key === "address" ? 256 : 120}
                  value={details[key] ?? ""}
                  onChange={(event) =>
                    onDetailsChange({
                      ...details,
                      [key]:
                        event.target.value === ""
                          ? null
                          : numeric
                            ? Number(event.target.value)
                            : event.target.value,
                    })
                  }
                />
              </label>
            );
          })}
        </fieldset>
      )}
      {normalizedUrl && (
        <p className="break-all">
          保存する参照リンク:{" "}
          <a
            href={normalizedUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            {normalizedUrl}
          </a>
        </p>
      )}
      {duplicates !== null && duplicates > 0 && (
        <p>
          同じ参照URLの履歴が{duplicates}
          件あります。今回の条件は別の履歴として保存します。
        </p>
      )}
      {!valid && (
        <p>
          生年月日・対象日・出発地を設定し、物件の所在地を指定すると保存できます。
        </p>
      )}
      <button
        type="button"
        className="rounded bg-emerald-800 px-3 py-2 text-white disabled:opacity-40"
        disabled={!valid || !confirmed || busy || saved === content}
        onClick={() => void save()}
      >
        {busy ? "保存中…" : "候補履歴に保存"}
      </button>
      <Link
        className="ml-3 underline"
        href="/relocation/candidates"
        prefetch={false}
      >
        本人の候補履歴
      </Link>
      <p>
        履歴保存にはログインが必要です。ログイン画面へ移動すると、この下書きは消えます。
      </p>
      {login && (
        <Link
          href="/login?next=%2Frelocation%2Farbitrage"
          prefetch={false}
          className="underline"
        >
          ログインする
        </Link>
      )}
      {error && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
      {saved === content && <p role="status">候補履歴に保存しました。</p>}
    </section>
  );
}
