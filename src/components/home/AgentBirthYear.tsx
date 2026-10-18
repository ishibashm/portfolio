"use client";
import { useEffect, useRef, useState } from "react";
import {
  BirthYearPicker,
  MonthDayPicker,
} from "@/components/inputs/QuickChoices";
import {
  loadSettings,
  readSettingsSync,
  settingString,
} from "@/lib/userSettings";

/** 本命星だけの簡易入力。日柱・空亡の計算へ代表日を渡さない。 */
export function AgentBirthYear() {
  const [savedDate, setSavedDate] = useState("");
  const [manual, setManual] = useState(false);
  const edited = useRef(false);
  const [year, setYear] = useState("");
  const [boundary, setBoundary] = useState("");
  const [date, setDate] = useState("");
  const [result, setResult] = useState({ birth: "", text: "" });
  useEffect(() => {
    let active = true;
    const apply = (settings: ReturnType<typeof readSettingsSync>) => {
      if (!active || edited.current) return;
      const birth = (settingString(settings, "birth_date") ?? "").slice(0, 10);
      setSavedDate(/^\d{4}-\d{2}-\d{2}$/.test(birth) ? birth : "");
    };
    const local = readSettingsSync();
    void Promise.resolve().then(() => apply(local));
    void loadSettings().then(({ settings }) => apply(settings));
    return () => {
      active = false;
    };
  }, []);
  const usingSaved = !!savedDate && !manual;
  const n = Number(year);
  const birth = usingSaved
    ? savedDate
    : Number.isInteger(n) && n >= 1900 && n <= 2100 && boundary
      ? boundary === "yes"
        ? date
        : `${year}-07-01`
      : "";
  const exactDate = usingSaved || boundary === "yes";
  useEffect(() => {
    let active = true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return;
    if (!usingSaved && !birth.startsWith(year + "-")) return;
    const d = new Date(birth + "T12:00:00+09:00");
    if (!Number.isFinite(d.getTime())) return;
    void import("@/utils/ephemerisEngine").then(({ getHonmeiStar }) => {
      if (active)
        setResult({
          birth,
          text: `本命星は${getHonmeiStar(d)}です。${!exactDate ? "節分境界外の年の代表日（7月1日）で計算しました。" : "指定日の正午を代表値として計算しました。立春当日は出生時刻により変わる場合があります。"}九星気学の参考情報です。`,
        });
    });
    return () => {
      active = false;
    };
  }, [birth, usingSaved, year, exactDate]);
  return (
    // 未登録の人には畳んだまま置く。相談の画面にボタンを並べ続けない。
    <details className="text-sm" open={usingSaved || manual}>
      <summary className="cursor-pointer">
        本命星だけなら、生年から調べる
      </summary>
      {usingSaved ? (
        <button
          type="button"
          className="mt-3 underline"
          onClick={() => {
            edited.current = true;
            setManual(true);
          }}
        >
          別の生まれ年で見る
        </button>
      ) : (
        <>
          <BirthYearPicker
            value={year}
            onChange={(value) => {
              edited.current = true;
              setManual(true);
              setYear(value);
              setBoundary("");
              setDate("");
            }}
          />
          {year && (
            <fieldset className="mt-3">
              <legend>1月1日〜2月4日生まれですか</legend>
              {[
                ["yes", "1月1日〜2月4日生まれ"],
                ["no", "2月5日以降・わからない"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={boundary === value}
                  className="m-1 rounded-lg border px-3 py-2"
                  onClick={() => {
                    setBoundary(value);
                    setDate("");
                  }}
                >
                  {label}
                </button>
              ))}
            </fieldset>
          )}
          {year && boundary === "yes" && (
            <MonthDayPicker
              key={year}
              year={year}
              value={date}
              onChange={setDate}
            />
          )}
        </>
      )}
      {birth && result.birth === birth && <p className="mt-3">{result.text}</p>}
    </details>
  );
}
