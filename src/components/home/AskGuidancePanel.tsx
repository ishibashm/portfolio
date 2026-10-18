"use client";
import { useState, type FormEvent } from "react";
import {
  DateChips,
  BirthYearPicker,
  MonthDayPicker,
  OriginChooser,
  type PickedOrigin,
} from "@/components/inputs/QuickChoices";
import {
  readSettingsSync,
  settingString,
  settingNumber,
  writeLocalSettings,
  type Settings,
} from "@/lib/userSettings";
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
  const [year, setYear] = useState("");
  const [ownedBirth, setOwnedBirth] = useState<string>();
  const [ownedOrigin, setOwnedOrigin] = useState<PickedOrigin>();
  const [representative, setRepresentative] = useState(false);
  const [saveChoice, setSaveChoice] = useState(() =>
    settingString(readSettingsSync(), "consult_save_choice"),
  );
  const [savedNote, setSavedNote] = useState(false);
  const hasOwned = !!(ownedBirth || ownedOrigin);

  function saveOwned(
    result: GuidanceCard,
    remember = false,
    origin = ownedOrigin,
  ) {
    const config = readSettingsSync();
    const patch: Settings = remember ? { consult_save_choice: "save" } : {};
    if (
      ownedBirth &&
      result.values.birthDate === ownedBirth &&
      !settingString(config, "birth_date")
    ) {
      patch.birth_date = ownedBirth;
    }
    if (origin && result.values.municipality) {
      const label = settingString(config, "base_label");
      const lat = settingNumber(config, "base_lat");
      const lon = settingNumber(config, "base_lon");
      const query = new URL(result.links[0].href, "https://cloud-palette.com")
        .searchParams;
      const number = (key: string) => {
        const value = query.get(key);
        return value?.trim() && Number.isFinite(Number(value))
          ? Number(value)
          : undefined;
      };
      const nextLat = number("baseLat") ?? origin.lat;
      const nextLon = number("baseLon") ?? origin.lon;
      // 地名と座標は一組。別地点の既存値に欠けた片方だけを継ぎ足さない。
      if (
        (!label || label === result.values.municipality) &&
        (lat === undefined || lat === nextLat) &&
        (lon === undefined || lon === nextLon)
      ) {
        if (!label) patch.base_label = result.values.municipality;
        if (lat === undefined && nextLat !== undefined)
          patch.base_lat = nextLat;
        if (lon === undefined && nextLon !== undefined)
          patch.base_lon = nextLon;
      }
    }
    if (Object.keys(patch).length) {
      writeLocalSettings(patch);
      setSavedNote(true);
    }
  }
  function chooseSave() {
    saveOwned(card, true);
    setSaveChoice("save");
  }
  async function request(
    next: GuidanceValues,
    action: "resolve" | "search" = "resolve",
    origin = ownedOrigin,
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
      if (
        result.links.length &&
        (ownedBirth || origin) &&
        saveChoice === "save"
      )
        saveOwned(result, false, origin);
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
    void request({
      ...candidate,
      birthDate: candidate.birthDate?.slice(0, 10),
      ...known,
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (card.fields.some((field) => !values[field])) return;
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
              <fieldset
                key={field}
                disabled={busy}
                aria-label={GUIDANCE_FIELDS[field]}
              >
                <legend>{GUIDANCE_FIELDS[field]}</legend>
                {field === "date" && (
                  <DateChips
                    value={values.date}
                    onChange={(date) =>
                      setValues({ ...values, date: date || undefined })
                    }
                  />
                )}
                {field === "birthDate" && (
                  <>
                    <BirthYearPicker
                      value={year}
                      onChange={(next) => {
                        setYear(next);
                        setOwnedBirth(undefined);
                        setRepresentative(false);
                        setValues({ ...values, birthDate: undefined });
                      }}
                    />
                    {year && (
                      <>
                        <MonthDayPicker
                          key={year}
                          year={year}
                          value={values.birthDate}
                          onChange={(date) => {
                            setOwnedBirth(date || undefined);
                            setRepresentative(false);
                            setValues({
                              ...values,
                              birthDate: date || undefined,
                            });
                          }}
                        />
                        {card.intent === "star" && (
                          <button
                            type="button"
                            className="rounded-lg border bg-white px-3 py-2"
                            onClick={() => {
                              setOwnedBirth(undefined);
                              setRepresentative(true);
                              setValues({
                                ...values,
                                birthDate: `${year}-07-01`,
                              });
                            }}
                          >
                            月日がわからない
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
                {field === "municipality" && (
                  <>
                    <OriginChooser
                      savedLabel={profile?.residence}
                      onUseSaved={() => {
                        setOwnedOrigin(undefined);
                        setValues({
                          ...values,
                          municipality: profile?.residence,
                        });
                      }}
                      onPick={(origin) => {
                        setOwnedOrigin(origin);
                        setValues({ ...values, municipality: origin.name });
                      }}
                    />
                    {values.municipality && <p>{values.municipality}</p>}
                    <button
                      type="button"
                      disabled={busy || !values.municipality}
                      className="mt-1 underline"
                      onClick={() => void request(values, "search")}
                    >
                      市区町村の候補を探す
                    </button>
                  </>
                )}
              </fieldset>
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
                    onClick={() => {
                      setOwnedOrigin({ name: candidate.name });
                      void request(
                        { ...values, municipality: candidate.name },
                        "resolve",
                        { name: candidate.name },
                      );
                    }}
                  >
                    {candidate.name}
                  </button>
                ))
              ) : (
                <p>
                  候補がありません。「選ぶ」から別の市区町村を選んでください。
                </p>
              )}
            </div>
          )}
          <button
            disabled={busy || card.fields.some((field) => !values[field])}
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
      {representative && (
        <p className="mt-2 text-xs">
          年の代表日（7月1日）で計算します。立春前の生まれでは本命星が異なる場合があります。この日付は保存しません。
        </p>
      )}
      {!!card.links.length && hasOwned && (
        <div className="mt-3 text-xs">
          {saveChoice !== "save" && saveChoice !== "once" && (
            <>
              <p>この条件をこの端末に保存しますか？</p>
              <button
                type="button"
                className="rounded-lg border bg-white px-3 py-2"
                onClick={chooseSave}
              >
                保存する
              </button>
              <button
                type="button"
                className="rounded-lg border bg-white px-3 py-2"
                onClick={() => {
                  writeLocalSettings({ consult_save_choice: "once" });
                  setSaveChoice("once");
                }}
              >
                今回だけ
              </button>
            </>
          )}
          {saveChoice === "once" && (
            <button type="button" className="underline" onClick={chooseSave}>
              保存する
            </button>
          )}
          {savedNote && (
            <p>
              保存しました（
              <a href="/profile" className="underline">
                編集・消す: /profile
              </a>
              ）
            </p>
          )}
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
