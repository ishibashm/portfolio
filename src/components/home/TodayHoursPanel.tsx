/**
 * ホームの「今日の天気と方位」の下に置く今の刻と折りたたみ表。
 * 選択中の起点の経度を使い、位置情報・
 * ブラウザの JavaScript は使わない。詳しい表は /houi/today へ。
 */
import Link from "next/link";
import { TOKYO_ORIGIN, type Origin } from "@/lib/todayWeather/origin";
import {
  additionalUnlucky,
  nextLuckyHour,
  buildCurrentDirections,
  buildTodayDirections,
} from "@/lib/todayDirections";

import { DIRECTION_LABELS } from "@/utils/directionGeo";

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
            {["刻・日本時間", "吉", "追加で避けたい"].map((label) => (
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
                className={`border-t border-slate-200 dark:border-theme-border align-top ${
                  current ? "bg-amber-50 dark:bg-theme-gold-soft" : ""
                }`}
              >
                <th scope="row" className="whitespace-nowrap px-1.5 py-1">
                  {hour.branch} {hour.time}
                  {current ? (
                    <span className="mt-0.5 block text-[10px] font-semibold text-amber-800 dark:text-theme-gold">
                      今の刻
                    </span>
                  ) : null}
                </th>
                <td className="px-1.5 py-1">{list(hour.lucky)}</td>
                <td className="px-1.5 py-1">
                  {list(additionalUnlucky(hour.keyed, hour.common.keyed))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LuckyChips({
  items,
  inline = false,
}: {
  items: string[];
  inline?: boolean;
}) {
  return (
    <span
      className={
        inline ? "inline-flex flex-wrap gap-1" : "flex flex-wrap gap-1 text-xs"
      }
    >
      {items.length ? (
        items.map((item) => (
          <span
            key={item}
            className="rounded-full bg-emerald-100 dark:bg-theme-good-soft px-2 py-0.5 font-semibold text-emerald-900 dark:text-theme-good"
          >
            {item}
          </span>
        ))
      ) : (
        <span>なし</span>
      )}
    </span>
  );
}

export function TodayHoursCard({
  data,
  current,
  origin = TOKYO_ORIGIN,
  personal,
}: {
  personal?: Current;
  data: Directions;
  current: Current;
  origin?: Origin;
}) {
  const currentTime = `${timeFmt.format(new Date(current.start))}〜${timeFmt.format(new Date(current.end))}`;
  const selected = personal?.star ? personal : undefined;
  const stars = [...current.stars].sort(
    (a, b) =>
      Number(b.star === selected?.star) - Number(a.star === selected?.star),
  );
  const next =
    selected?.star && !selected.lucky.length
      ? nextLuckyHour(data, selected.star, new Date(current.asOf))
      : null;
  const board = selected ?? current;
  const grid = ["NW", "N", "NE", "W", "CENTER", "E", "SW", "S", "SE"] as const;
  return (
    <section
      aria-labelledby="today-hours-heading"
      className="w-full max-w-[1700px] space-y-3 rounded-3xl border border-slate-300 dark:border-theme-border bg-white/95 dark:bg-theme-surface p-4 text-slate-900 dark:text-ink shadow-lg shadow-slate-200/50 dark:shadow-black/20 md:space-y-4 md:p-8"
    >
      <div>
        <h2 id="today-hours-heading" className="text-xl font-bold">
          今日の吉方位と時間
        </h2>
        <p className="text-xs text-slate-600 dark:text-ink-muted">
          <time dateTime={data.date}>{data.date}</time>
          （日本時間）・{origin.name}基準の真太陽時
          <Link href="#today-overview-heading" className="ml-2 underline">
            起点を切り替える
          </Link>
        </p>
      </div>
      <div className="grid gap-4 min-[744px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-3">
          <h3 className="text-base font-bold">
            今の刻：{current.branch}の刻 {currentTime}
          </h3>
          <p className="text-xs font-semibold">全員に共通の避けたい方位</p>
          <ul className="flex flex-wrap gap-1 text-xs">
            {current.unlucky.length ? (
              current.unlucky.map((item) => (
                <li
                  key={item}
                  className="rounded-full bg-rose-100 dark:bg-theme-bad-soft px-2 py-0.5 font-semibold text-rose-900 dark:text-theme-bad"
                >
                  {item}
                </li>
              ))
            ) : (
              <li className="text-slate-700 dark:text-ink">なし</li>
            )}
          </ul>

          {selected ? (
            <div className="space-y-2">
              <h3 className="font-bold">
                あなたの今の刻（{selected.starName}）
              </h3>
              <LuckyChips items={selected.lucky} />
              {!selected.lucky.length ? (
                <p className="text-xs">
                  {next
                    ? `次の吉：${next.branch}の刻 ${timeFmt.format(new Date(next.start))}〜（${list(next.lucky)}）`
                    : "今日の次の吉はありません"}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold">今の刻に吉がある星</h3>
              <LuckyChips
                items={current.stars
                  .filter((star) => star.lucky.length)
                  .map(
                    (star) => `${star.name.slice(0, 2)}：${list(star.lucky)}`,
                  )}
              />
            </div>
          )}
          <div
            role="img"
            aria-label={`今の刻の方位盤（北が上）。${current.branch}の刻。吉：${list(board.lucky)}。避けたい：${list(board.unlucky)}。残りは平。`}
            className="grid w-full max-w-[13rem] grid-cols-3 gap-1 text-center"
          >
            {grid.map((direction) => {
              const label =
                direction === "CENTER" ? "" : DIRECTION_LABELS[direction];
              const bad =
                direction === "CENTER"
                  ? undefined
                  : board.unlucky.find((item) => item.startsWith(`${label}（`));
              const lucky = board.lucky.includes(label);
              return (
                <div
                  key={direction}
                  aria-hidden="true"
                  className={`rounded-md border px-0.5 py-2 text-xs ${bad ? "border-rose-400 dark:border-theme-border bg-rose-50 dark:bg-theme-bad-soft text-rose-900 dark:text-theme-bad" : lucky ? "border-emerald-400 dark:border-theme-border bg-emerald-50 dark:bg-theme-good-soft text-emerald-900 dark:text-theme-good" : direction === "CENTER" ? "border-amber-300 dark:border-theme-border bg-amber-50 dark:bg-theme-gold-soft" : "border-slate-200 dark:border-theme-border bg-white dark:bg-theme-surface"}`}
                >
                  <span className="block font-bold">
                    {direction === "CENTER" ? `${current.branch}の刻` : label}
                  </span>
                  <span className="block text-[10px]">
                    {direction === "CENTER"
                      ? current.center
                      : bad
                        ? bad.split("（")[1].replace("）", "")
                        : lucky
                          ? "吉"
                          : "平"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <details className="min-w-0 text-xs">
          <summary className="min-h-11 cursor-pointer rounded-lg bg-slate-100 dark:bg-theme-subtle p-3 font-semibold text-slate-800 dark:text-ink">
            本命星別の今の刻と、十二支の時間帯を見る
          </summary>
          <div className="mt-3 space-y-2">
            {stars.map((star) => (
              <details
                key={star.star}
                name="home-honmei-hours"
                className={`rounded-lg border p-2 ${star.star === selected?.star ? "border-accent bg-theme-accent-soft" : "border-theme-border"}`}
              >
                <summary className="min-h-11 cursor-pointer">
                  <span className="inline-grid w-[calc(100%-1.5rem)] gap-1.5 align-middle min-[1100px]:grid-cols-[6rem_minmax(0,1fr)_minmax(0,2fr)_auto]">
                    <span className="font-bold">
                      {star.name}
                      {star.star === selected?.star ? "（あなた）" : ""}
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      今の吉 <LuckyChips items={star.lucky} inline />
                    </span>
                    <span className="text-slate-700 dark:text-ink">
                      追加で避けたい：
                      {list(additionalUnlucky(star.keyed, current.keyed))}
                    </span>
                    <span className="text-slate-600 dark:text-ink-muted underline underline-offset-2">
                      時間帯を開く
                    </span>
                  </span>
                </summary>
                <div className="mt-2">
                  <HourTable
                    hours={
                      data.stars.find((item) => item.star === star.star)!.hours
                    }
                    currentBranch={current.branch}
                    caption={`${star.name}の時間帯別方位（${origin.name}基準）`}
                  />
                </div>
              </details>
            ))}
          </div>
        </details>
      </div>
      <p className="text-xs">
        <Link href="/houi/today" className="text-accent underline">
          詳しい日盤と、現在地での今の刻を見る
        </Link>
        <span className="text-slate-600 dark:text-ink-muted">・本命星は</span>
        <Link href="/houi#honmei-lookup" className="text-accent underline">
          早見
        </Link>
        <span className="text-slate-600 dark:text-ink-muted">で分かります</span>
      </p>
      <p className="text-xs text-slate-600 dark:text-ink-muted">
        時盤の吉でも、今日の日盤が凶なら凶を優先します。時刻は{origin.name}
        （東経{origin.lon}
        度）の真太陽時で区切り、日本時間で表示しています。方位の吉凶は伝統的な見方で、効果を保証しません。
      </p>
    </section>
  );
}

export async function TodayHoursPanel({
  origin = TOKYO_ORIGIN,
  birthDate,
}: { origin?: Origin; birthDate?: string } = {}) {
  const now = new Date();
  return (
    <TodayHoursCard
      origin={origin}
      personal={
        birthDate
          ? buildCurrentDirections(now, birthDate, origin.lon)
          : undefined
      }
      data={buildTodayDirections(now, origin.lon)}
      current={buildCurrentDirections(now, undefined, origin.lon)}
    />
  );
}
