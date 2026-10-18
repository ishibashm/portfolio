"use client";
import { useState, type FormEvent } from "react";
import { readSettingsSync, settingString } from "@/lib/userSettings";
import {
  GUIDANCE_FIELDS,
  GUIDANCE_DIRECTIONS,
  type GuidanceCard,
  type GuidanceValues,
} from "@/lib/askGuidance";

export function AskGuidancePanel({
  initial,
  saved,
  previous,
  onDismiss,
}: {
  initial: GuidanceCard;
  saved?: { name: string; birthDate?: string; residence?: string };
  previous?: GuidanceValues;
  onDismiss: () => void;
}) {
  const [localProfile] = useState(() => {
    const config = readSettingsSync();
    return {
      name: "この端末",
      birthDate: settingString(config, "birth_date"),
      residence: settingString(config, "base_label"),
    };
  });
  const profile =
    saved ??
    (localProfile.birthDate || localProfile.residence
      ? localProfile
      : undefined);
  const [card, setCard] = useState(initial);
  const [values, setValues] = useState(initial.values);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function request(
    next: GuidanceValues,
    action: "resolve" | "search" = "resolve",
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ask-guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ intent: card.intent, values: next, action }),
      });
      if (!response.ok)
        throw new Error("入力を確認して、もう一度お試しください。");
      const result: GuidanceCard = await response.json();
      setCard(result);
      setValues(result.values);
    } catch {
      setError(
        "条件を確認できませんでした。少し待つか、入力を見直してお試しください。",
      );
    } finally {
      setBusy(false);
    }
  }
  function reuse(candidate: GuidanceValues) {
    const known = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value),
    );
    void request({ ...candidate, ...known });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void request(values);
  }
  return (
    <aside
      className="mt-3 min-w-0 rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-sm"
      aria-label="計算ページへの案内"
    >
      <p className="font-bold">
        {card.fields.length
          ? "続けるために、こちらだけ教えてください"
          : "この条件で計算ページを開けます"}
      </p>
      <p className="mt-1 text-xs text-slate-600">
        生年月日はリンクに含めません。飛び先では使用中のプロフィールを確認し、未登録なら入力してください。
      </p>
      {!card.links.length && (
        <form onSubmit={submit} className="mt-3 space-y-3">
          {profile &&
            card.fields.some(
              (field) => field === "birthDate" || field === "municipality",
            ) && (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border bg-white px-3 py-2"
                onClick={() =>
                  reuse({
                    birthDate: profile.birthDate || undefined,
                    municipality: profile.residence || undefined,
                  })
                }
              >
                {profile.name}の登録情報を使いますか？
              </button>
            )}
          {previous && Object.values(previous).some(Boolean) && (
            <button
              type="button"
              disabled={busy}
              className="ml-1 rounded-lg border bg-white px-3 py-2"
              onClick={() => reuse(previous)}
            >
              前の相談の条件を使いますか？
            </button>
          )}
          {card.fields.map((field) =>
            field === "direction" ? (
              <fieldset key={field} disabled={busy}>
                <legend>{GUIDANCE_FIELDS[field]}</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {Object.entries(GUIDANCE_DIRECTIONS).map(([value, label]) => (
                    <label
                      key={value}
                      className="rounded-lg border bg-white px-3 py-2"
                    >
                      <input
                        type="radio"
                        name="guidance-direction"
                        value={value}
                        checked={values.direction === value}
                        required
                        onChange={() =>
                          setValues({
                            ...values,
                            direction: value as GuidanceValues["direction"],
                          })
                        }
                      />{" "}
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <label key={field} className="block">
                {GUIDANCE_FIELDS[field]}
                <input
                  aria-label={GUIDANCE_FIELDS[field]}
                  type={field === "municipality" ? "text" : "date"}
                  required
                  disabled={busy}
                  maxLength={80}
                  autoComplete="off"
                  value={values[field] ?? ""}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      [field]: event.target.value || undefined,
                    })
                  }
                  className="mt-1 block min-w-0 w-full rounded-lg border bg-white p-2"
                />
                {field === "municipality" && (
                  <button
                    type="button"
                    disabled={busy || !values.municipality}
                    className="mt-1 underline"
                    onClick={() => void request(values, "search")}
                  >
                    市区町村の候補を探す
                  </button>
                )}
              </label>
            ),
          )}
          {card.candidates && (
            <div className="flex flex-wrap gap-2">
              {card.candidates.length ? (
                card.candidates.map((candidate) => (
                  <button
                    key={candidate.code}
                    type="button"
                    disabled={busy}
                    className="rounded-lg border bg-white px-3 py-2"
                    onClick={() =>
                      void request({ ...values, municipality: candidate.name })
                    }
                  >
                    {candidate.name}
                  </button>
                ))
              ) : (
                <p>候補がありません。市区町村名で入力してください。</p>
              )}
            </div>
          )}
          <button
            disabled={busy}
            className="rounded-lg bg-teal-800 px-4 py-2 text-white"
          >
            {busy ? "確認中…" : "条件を確認する（AI不要）"}
          </button>
          <button
            type="button"
            disabled
            className="ml-2 rounded-lg border px-3 py-2 text-slate-400"
          >
            計算ページを開く
          </button>
          {!card.fields.length && (
            <p className="text-xs">
              まだリンクがない場合は、道具で候補を確認します。候補がなければ別の日付・方位をチャットで指定してください。
            </p>
          )}
        </form>
      )}
      {!!card.links.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg bg-teal-800 px-4 py-2 text-white"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={onDismiss}
        className="mt-3 text-xs underline"
      >
        今はしない
      </button>
    </aside>
  );
}
