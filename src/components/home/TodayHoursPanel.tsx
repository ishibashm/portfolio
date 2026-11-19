/**
 * ホームの「今日の天気と方位」の下に置く今の刻と折りたたみ表。
 * 選択中の起点の経度を使い、位置情報・
 * ブラウザの JavaScript は使わない。詳しい表は /houi/today へ。
 */
import Link from "next/link";
import { TOKYO_ORIGIN, type Origin } from "@/lib/todayWeather/origin";
import {
  buildCurrentDirections,
  buildTodayDirections,
} from "@/lib/todayDirections";

const list = (items: string[]) => items.join("・") || "なし";

const timeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type Directions = ReturnType<typeof buildTodayDirections>;
type Current = ReturnType<typeof buildCurrentDirections>;
type Hours = Directions["stars"][number]["hours"];

function HourTable({
  hours,
  currentBranch,
  caption,
}: {
  hours: Hours;
  currentBranch: string;
  caption: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {["刻・日本時間", "吉", "避けたい"].map((label) => (
              <th key={label} scope="col" className="px-1.5 py-1">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => {
            const current = hour.branch === currentBranch;
            return (
              <tr
                key={hour.branch}
                className={`border-t border-slate-200 align-top ${
                  current ? "bg-amber-50" : ""
                }`}
              >
                <th scope="row" className="whitespace-nowrap px-1.5 py-1">
                  {hour.branch} {hour.time}
                  {current ? (
                    <span className="mt-0.5 block text-[10px] font-semibold text-amber-800">
                      今の刻
                    </span>
                  ) : null}
                </th>
                <td className="px-1.5 py-1">{list(hour.lucky)}</td>
                <td className="px-1.5 py-1">{list(hour.unlucky)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TodayHoursCard({
  data,
  current,
  origin = TOKYO_ORIGIN,
}: {
  data: Directions;
  current: Current;
  origin?: Origin;
}) {
  const currentTime = `${timeFmt.format(new Date(current.start))}〜${timeFmt.format(new Date(current.end))}`;
  return (
    <section
      aria-labelledby="today-hours-heading"
      className="w-full max-w-[1700px] space-y-3 rounded-3xl border border-slate-300 bg-white/95 p-4 text-slate-900 shadow-lg shadow-slate-200/50 md:space-y-4 md:p-8"
    >
      <div>
        <h2 id="today-hours-heading" className="text-xl font-bold">
          今日の吉方位と時間
        </h2>
        <p className="text-xs text-slate-600">
          <time dateTime={data.date}>{data.date}</time>
          （日本時間）・{origin.name}基準の真太陽時
        </p>
      </div>
      <div className="space-y-2">
        <h3 className="text-base font-bold">
          今の刻：{current.branch}の刻 {currentTime}
        </h3>
        <p className="text-xs font-semibold">全員に共通の避けたい方位</p>
        <ul className="flex flex-wrap gap-1 text-xs">
          {current.unlucky.length ? (
            current.unlucky.map((item) => (
              <li
                key={item}
                className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-900"
              >
                {item}
              </li>
            ))
          ) : (
            <li className="text-slate-700">なし</li>
          )}
        </ul>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer font-semibold text-slate-800 underline underline-offset-4">
          本命星別の今の刻と、十二支の時間帯を見る
        </summary>
        <div className="mt-3 space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="text-left font-semibold">
                本命星別の今の刻の吉方位
              </caption>
              <thead>
                <tr>
                  {["本命星", "今の吉", "今の避けたい"].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="whitespace-nowrap px-1.5 py-1"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.stars.map((star) => {
                  const hour = star.hours.find(
                    (item) => item.branch === current.branch,
                  );
                  return (
                    <tr key={star.star} className="border-t border-slate-200">
                      <th scope="row" className="whitespace-nowrap px-1.5 py-1">
                        {star.name}
                      </th>
                      <td className="px-1.5 py-1">
                        {hour ? list(hour.lucky) : "—"}
                      </td>
                      <td className="px-1.5 py-1">
                        {hour ? list(hour.unlucky) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.stars.map((star) => (
            <details
              key={star.star}
              name="home-honmei-hours"
              className="rounded-md border border-slate-200 p-2"
            >
              <summary className="cursor-pointer font-bold text-rose-700">
                {star.name}
              </summary>
              <div className="mt-2">
                <HourTable
                  hours={star.hours}
                  currentBranch={current.branch}
                  caption={`${star.name}の時間帯別方位（${origin.name}基準）`}
                />
              </div>
            </details>
          ))}
        </div>
      </details>
      <p className="text-xs">
        <Link href="/houi/today" className="text-rose-600 underline">
          詳しい日盤と、現在地での今の刻を見る
        </Link>
        <span className="text-slate-600">・本命星は</span>
        <Link href="/houi#honmei-lookup" className="text-rose-600 underline">
          早見
        </Link>
        <span className="text-slate-600">で分かります</span>
      </p>
      <p className="text-xs text-slate-600">
        時盤の吉でも、今日の日盤が凶なら凶を優先します。時刻は{origin.name}
        （東経{origin.lon}
        度）の真太陽時で区切り、日本時間で表示しています。方位の吉凶は伝統的な見方で、効果を保証しません。
      </p>
    </section>
  );
}

export async function TodayHoursPanel({
  origin = TOKYO_ORIGIN,
}: { origin?: Origin } = {}) {
  const now = new Date();
  return (
    <TodayHoursCard
      origin={origin}
      data={buildTodayDirections(now, origin.lon)}
      current={buildCurrentDirections(now, undefined, origin.lon)}
    />
  );
}
