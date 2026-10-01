/**
 * 公的な民営家賃（総務省 小売物価統計調査）の札。県・市区町村の頁に置く。
 *
 * 頁の家賃の本体は住宅・土地統計調査（5 年ごと、最新 2023 年）。こちらは
 * **毎月**出る値で、県庁所在市と人口 15 万以上の市だけにある。いつの値かと、
 * 単位（借家 1 か月・3.3㎡あたり）を必ず添える。
 *
 * e-Stat の API で取った値なので、規約のクレジットと出典・加工の明記を
 * この札に置く（estatApiCredit が見張る）。
 */

import { ESTAT_API_CREDIT } from "@/lib/estatCredit";
import type { OfficialRent } from "@/lib/officialRentForPlace";

const UNIT_NOTE =
  "借家 1 か月・3.3㎡（1 坪）あたりの額。㎡あたりは 3.3 で割った目安です。調べているのは県庁所在市と人口 15 万以上の市だけです。";
const SOURCE_NOTE =
  "「小売物価統計調査」（総務省）を加工して作成。出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）。";

/** "2026-08" → "2026年8月" */
function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

function yoyText(v: number | null): string {
  if (v === null) return "";
  return `、前年同月比 ${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function OfficialRentNote({
  heading,
  rents,
  month,
}: {
  heading: string;
  rents: OfficialRent[];
  /** 最新月（YYYY-MM） */
  month: string;
}) {
  if (rents.length === 0) return null;
  return (
    <div
      className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4"
      data-testid="official-rent"
    >
      <h3 className="text-xs font-bold text-slate-700">
        {`${heading}（${monthLabel(month)}、毎月の公的統計）`}
      </h3>
      <ul className="mt-2 space-y-1 text-xs text-slate-700">
        {rents.map((r) => (
          <li key={r.areaCode}>
            <b>{r.name}</b>
            {`: 3.3㎡あたり ${r.yen.toLocaleString()}円（約 ${r.perSqm.toLocaleString()}円/㎡）${yoyText(r.yoyPct)}`}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{UNIT_NOTE}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {SOURCE_NOTE}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {ESTAT_API_CREDIT}
      </p>
    </div>
  );
}
