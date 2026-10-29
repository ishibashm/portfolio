"use client";

import { useState } from "react";
import Link from "next/link";
import { isValidBirthDateInput } from "@/lib/birthDateInput";
import { tenchusatsuForCivilDate } from "@/utils/tenchusatsuCore";
import type { TenchusatsuTimeline } from "@/lib/tenchusatsuTimeline";

export function TenchusatsuChecker({
  timeline,
}: {
  timeline: TenchusatsuTimeline;
}) {
  const [birth, setBirth] = useState("");
  const valid = isValidBirthDateInput(birth) && birth <= timeline.today;
  const result = valid
    ? tenchusatsuForCivilDate(
        ...(birth.split("-").map(Number) as [number, number, number]),
      )
    : null;
  const branches = result?.tenchusatsu.voidBranches ?? [];
  const yearVoid = branches.includes(timeline.yearBranch);
  const monthVoid = branches.includes(timeline.monthBranch);

  return (
    <section className="space-y-6" aria-label="天中殺と引越しの確認">
      <div className="wg-card p-6" aria-live="polite">
        <h2 className="text-xl font-bold text-rose-800">
          {!result
            ? "引越しの可否は、天中殺だけでは決まりません"
            : yearVoid || monthVoid
              ? "今は慎重に。引越しの事情と時期を確認しましょう"
              : "天中殺の年・月には該当しません。次に方位と日取りを確認"}
        </h2>
        {result && (
          <p className="mt-3 font-bold">
            あなたは{result.tenchusatsu.name}天中殺（日柱：{result.ganZhi}
            ）。今年の節年（{timeline.yearNumber}年）は
            {yearVoid ? "天中殺です" : "天中殺ではありません"}。現在の節月は
            {monthVoid ? "天中殺です" : "天中殺ではありません"}。
          </p>
        )}
        <p className="mt-3 text-sm">
          伝統的には自発的な新生活を慎む時期とされますが、流派で扱いが異なります。転勤など避けられない引越しは、次の3点を個別に検討します。
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <b>方位：</b>
            <Link href="/houi" className="text-rose-700 underline">
              移転先の方位を確認
            </Link>
            。五黄殺・暗剣殺は誰にとっても凶方位です。吉方位でも天中殺が消えるわけではありません。
          </li>
          <li>
            <b>日取り：</b>
            <Link href="/calendar" className="text-rose-700 underline">
              契約日・入居日を検討
            </Link>
            。年・月・日のどこまでを避けるかは流派で異なります。
          </li>
          <li>
            <b>仮住まい：</b>
            短期滞在と本移転を分ける考え方もあります。期間・費用・生活への負担を含めて相談し、万能な回避策とは考えません。
          </li>
        </ul>
      </div>
      <div className="wg-card p-6">
        <label htmlFor="tenchusatsu-birth" className="block font-bold">
          生年月日から天中殺を調べる
        </label>
        <input
          id="tenchusatsu-birth"
          type="date"
          min="1900-01-01"
          max={timeline.today < "2050-12-31" ? timeline.today : "2050-12-31"}
          value={birth}
          onChange={(e) => setBirth(e.target.value)}
          aria-describedby="tenchusatsu-help"
          className="mt-3 rounded-lg border border-rose-200 bg-white p-3"
        />
        <p id="tenchusatsu-help" className="mt-2 text-sm text-stone-600">
          日本標準時・日付のみで計算します。生年月日は保存・送信しません。
        </p>
        {birth && !valid && (
          <p role="alert" className="mt-2 text-rose-700">
            1900年以降の、今日までの実在する生年月日を入力してください。
          </p>
        )}
      </div>
      {result && (
        <div className="wg-card p-6">
          <h2 className="text-xl font-bold">これから3年間の天中殺月</h2>
          <p className="mt-2 text-sm">
            色と「天中殺月」の文字が該当月です。年天中殺は月の印とは別です。各月は節入りから次の節入り直前まで（JST）。日付は目安で、境界当日は時刻によって変わります。
          </p>
          <p className="mt-2 text-sm text-stone-600">
            月別ページの公開範囲外はカレンダー一覧へ進みます。天中殺ではない月も、引越しの吉を保証しません。
          </p>
          <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {timeline.months.map((m) => (
              <li key={m.slug}>
                <Link
                  href={m.href}
                  className={`block rounded-xl border p-3 text-sm ${branches.includes(m.branch) ? "border-rose-300 bg-rose-50 text-rose-900" : "border-stone-200"}`}
                >
                  <b>
                    {m.year}年{m.month}月・{m.branch}
                  </b>
                  <br />
                  {branches.includes(m.branch) ? "天中殺月" : "月の天中殺なし"}
                  <br />
                  <span className="text-xs">
                    {m.start.slice(5)}〜{m.end.slice(5)}節入り前
                  </span>
                  <br />
                  <span className="text-xs underline">
                    {m.href === "/calendar"
                      ? "カレンダー一覧"
                      : "この月の日取り"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
