"use client";

import { useState } from "react";
import Link from "next/link";
import {
  nextVoidYears,
  tenchusatsuForBirthDate,
  type TenchusatsuGroupName,
} from "@/lib/tenchusatsuLite";
import { loadSettings } from "@/lib/userSettings";

export interface CheckerMonth {
  year: number;
  month: number;
  /** /calendar/YYYY-MM がある月だけ入る */
  calendarHref: string | null;
}

/**
 * 生年月日 → 天中殺グループ・今年/向こう 3 年の天中殺月。
 * 月表はサーバーで計算済み（props）。ここは日柱の算術だけで暦エンジンを引かない。
 */
export function TenchusatsuChecker({
  months,
  byGroup,
  currentYear,
}: {
  months: CheckerMonth[];
  byGroup: Record<
    TenchusatsuGroupName,
    { monthVoid: boolean; yearVoid: boolean }[]
  >;
  currentYear: number;
}) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState("");
  const result = tenchusatsuForBirthDate(value);

  async function fromProfile() {
    const { settings } = await loadSettings();
    const bd =
      typeof settings.birth_date === "string"
        ? settings.birth_date.slice(0, 10)
        : "";
    if (!bd) {
      setNotice("プロフィールに生年月日が見つかりませんでした。");
      return;
    }
    setNotice("");
    setValue(bd);
  }

  const flags = result ? byGroup[result.group] : null;
  const nowVoid = flags?.[0];
  const voidYears = result ? nextVoidYears(result.group, currentYear) : null;
  const upcoming = flags
    ? months.filter((_, i) => flags[i].monthVoid || flags[i].yearVoid)
    : [];

  return (
    <div>
      <label className="block text-sm font-bold text-slate-900">
        生年月日
        <input
          type="date"
          value={value}
          min="1900-01-01"
          max="2099-12-31"
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 block w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-base"
        />
      </label>
      <button
        type="button"
        onClick={fromProfile}
        className="mt-2 text-xs text-rose-600 underline hover:text-rose-700"
      >
        プロフィールの生年月日を使う
      </button>
      {notice && <p className="mt-1 text-xs text-slate-600">{notice}</p>}

      {result && flags && voidYears && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <div
            className={`rounded-2xl border p-4 ${
              nowVoid?.monthVoid || nowVoid?.yearVoid
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <p className="text-xs font-bold">結論</p>
            <p className="mt-1 font-serif text-lg font-bold">
              {nowVoid?.yearVoid
                ? "今年は年の天中殺です。引越しは急がず、時期をずらすのが無難です。"
                : nowVoid?.monthVoid
                  ? "今月は天中殺の月です。契約・入居は来月以降が無難です。"
                  : "今は天中殺ではありません。方位と日取りを選べば動けます。"}
            </p>
            <p className="mt-2 text-sm">
              あなたは<b>{result.group}天中殺</b>（日柱 {result.ganZhi}
              ）。年の天中殺は
              <b className="font-mono">
                {voidYears[0]}〜{voidYears[1]}年
              </b>
              です（立春で切り替え）。
            </p>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-900">
              向こう 3 年の天中殺の月
            </p>
            <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
              {months.map((m, i) => {
                const f = flags[i];
                const bad = f.monthVoid || f.yearVoid;
                const cls = `block rounded-lg border px-1.5 py-1 text-center text-xs ${
                  f.monthVoid
                    ? "border-rose-300 bg-rose-100 font-bold text-rose-900"
                    : f.yearVoid
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                      : "border-stone-200 bg-white text-stone-700"
                }`;
                const label = (
                  <>
                    <span className="font-mono">
                      {m.year % 100}/{m.month}
                    </span>
                    <span className="block">
                      {f.monthVoid ? "月×" : f.yearVoid ? "年×" : "○"}
                    </span>
                  </>
                );
                return (
                  <li key={`${m.year}-${m.month}`} title={bad ? "天中殺" : ""}>
                    {m.calendarHref ? (
                      <Link
                        prefetch={false}
                        href={m.calendarHref}
                        className={cls}
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className={cls}>{label}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-slate-600">
              月×＝月の天中殺、年×＝年の天中殺の期間、○＝該当なし。月は節入り（毎月
              4〜8 日ごろ）で替わります。該当 {upcoming.length} か月。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
