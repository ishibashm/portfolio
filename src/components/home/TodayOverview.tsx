import { OriginLinks } from "./OriginLinks";
import { TOKYO_ORIGIN, type Origin } from "@/lib/todayWeather/origin";
/**
 * ホーム上部の「今日の天気と方位」。全国の天気の地図に、全国共通の日盤と
 * 本命星別の今日の吉方位を重ねて 1 枚にする。
 *
 * サーバーで描くだけで、入力・位置情報・ブラウザの JavaScript を使わない。
 */
import { Fragment } from "react";
import Link from "next/link";
import {
  NationalWeatherMap,
  NationalWeatherTable,
  formatTemps,
  shortWeather,
  weatherEmoji,
  type CityDirections,
} from "@/components/home/NationalWeather";
import { STAR_NAMES } from "@/lib/kigakuContent";
import { buildLoveFortuneFromBoard } from "@/lib/loveFortune";
import { buildTodayBoard, type TodayBoard } from "@/lib/todayDirections";
import {
  directionFromOrigin,
  distanceFromOrigin,
} from "@/lib/todayWeather/cityDirections";
import {
  getNationalWeather,
  type NationalCityWeather,
  type NationalWeather,
} from "@/lib/todayWeather/national";
import { DIRECTION_LABELS, type CompassDirection } from "@/utils/directionGeo";

/** 都市ごとの起点から見た方位と、その方位が全員共通の凶かどうか。 */
export function cityDirectionsFor(
  data: NationalWeather | null,
  board: TodayBoard,
  origin: Origin = TOKYO_ORIGIN,
): CityDirections {
  const result: CityDirections = {};
  for (const city of data?.cities ?? []) {
    const direction = directionFromOrigin(city.prefectureCode, origin);
    if (!direction) {
      result[city.prefectureCode] = {
        label: city.prefectureCode === origin.code ? "起点" : "起点付近",
      };
      continue;
    }
    const common = board.common.find((item) => item.direction === direction);
    result[city.prefectureCode] = {
      label: DIRECTION_LABELS[direction],
      ...(common ? { unlucky: common.reason } : {}),
    };
  }
  return result;
}

/** 方位ごとの代表都市（起点から近い順）。 */
export function citiesByDirection(
  data: NationalWeather | null,
  origin: Origin = TOKYO_ORIGIN,
) {
  const groups = new Map<CompassDirection, NationalCityWeather[]>();
  for (const city of data?.cities ?? []) {
    const direction = directionFromOrigin(city.prefectureCode, origin);
    if (!direction) continue;
    groups.set(direction, [...(groups.get(direction) ?? []), city]);
  }
  for (const list of groups.values())
    list.sort(
      (a, b) =>
        distanceFromOrigin(a.prefectureCode, origin) -
        distanceFromOrigin(b.prefectureCode, origin),
    );
  return groups;
}

// 北を上にした 3×3。地図と同じ向きにそろえる。
const GRID: (CompassDirection | "CENTER")[] = [
  "NW",
  "N",
  "NE",
  "W",
  "CENTER",
  "E",
  "SW",
  "S",
  "SE",
];

function DayBoard({ board }: { board: TodayBoard }) {
  return (
    <div
      role="img"
      aria-label={`今日の日盤（全国共通、北が上）。中宮は${STAR_NAMES[board.center]}。${board.common.map((item) => `${item.label}は${item.reason}`).join("、")}。`}
      className="grid w-full max-w-[13rem] shrink-0 grid-cols-3 gap-1 text-center"
    >
      {GRID.map((cell) => {
        const star = board.board[cell];
        const common =
          cell === "CENTER"
            ? undefined
            : board.common.find((item) => item.direction === cell);
        return (
          <div
            key={cell}
            aria-hidden="true"
            className={`rounded-md border px-0.5 py-1 leading-tight ${
              common
                ? "border-accent bg-theme-accent-soft text-accent"
                : cell === "CENTER"
                  ? "border-amber-300 dark:border-theme-border bg-amber-50 dark:bg-theme-gold-soft text-slate-900 dark:text-ink"
                  : "border-slate-200 dark:border-theme-border bg-white dark:bg-theme-surface text-slate-900 dark:text-ink"
            }`}
          >
            <span className="block text-[10px] text-slate-600 dark:text-ink-muted">
              {cell === "CENTER" ? "中宮" : DIRECTION_LABELS[cell]}
            </span>
            <span className="block text-sm font-bold">
              {STAR_NAMES[star].slice(0, 2)}
            </span>
            <span className="block min-h-[1em] text-[10px] font-semibold">
              {common?.reason ?? ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function luckyWeather(
  lucky: CompassDirection[],
  groups: ReturnType<typeof citiesByDirection>,
) {
  const parts = lucky.flatMap((direction) => {
    const cities = groups.get(direction);
    if (!cities?.length) return [];
    const [city] = cities;
    return [
      `${DIRECTION_LABELS[direction]} ${city.city}${weatherEmoji(city.today.weather) || shortWeather(city.today.weather)}${formatTemps(city.today, city.tomorrow, "compact")}${cities.length > 1 ? ` ほか${cities.length - 1}` : ""}`,
    ];
  });
  return parts;
}

export function TodayOverviewCard({
  data,
  board,
  origin = TOKYO_ORIGIN,
  registered,
}: {
  data: NationalWeather | null;
  board: TodayBoard;
  origin?: Origin;
  registered?: Origin | null;
}) {
  const directions = cityDirectionsFor(data, board, origin);
  const groups = citiesByDirection(data, origin);
  const loveFortune = buildLoveFortuneFromBoard(board);
  const loveByStar = new Map(
    loveFortune.items.map((item) => [item.star, item]),
  );
  const redCities = (data?.cities ?? []).filter(
    (city) => directions[city.prefectureCode]?.unlucky,
  );
  return (
    <section
      aria-labelledby="today-overview-heading"
      className="@container w-full max-w-[1700px] space-y-3 rounded-3xl border border-slate-300 dark:border-theme-border bg-white/95 dark:bg-theme-surface p-4 text-slate-900 dark:text-ink shadow-lg shadow-slate-200/50 dark:shadow-black/20 md:space-y-4 md:p-8"
    >
      <div>
        <h2 id="today-overview-heading" className="text-xl font-bold">
          今日の天気と方位
        </h2>
        <p className="text-xs text-slate-600 dark:text-ink-muted">
          <time dateTime={board.date}>{board.date}</time>
          （日本時間）・方位は{origin.name}から見たもの
        </p>
      </div>
      <OriginLinks origin={origin} registered={registered} />
      {/* 日盤を地図の右に置くのは、セクション幅が十分あるときだけ。
          iPad mini 横（1133px）では左サイドバー（lg:w-64）で中身が約 813px
          しかなく、24rem の日盤を横に並べると地図が 350px 程度になる。 */}
      <div className="grid gap-4 @min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="space-y-2">
          {data ? (
            <>
              <NationalWeatherMap data={data} directions={directions} />
              <p className="text-xs text-slate-700 dark:text-ink">
                避けたい方位は全員に共通。太い青枠は残りの降水確率50%以上。
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-700 dark:text-ink">
              いま天気を取得できません。時間をおいて開き直してください。
            </p>
          )}
        </div>
        <aside
          aria-labelledby="today-board-heading"
          className="space-y-3 sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4 sm:space-y-0 @min-[1100px]:block @min-[1100px]:space-y-3"
        >
          <div className="space-y-2">
            <h3 id="today-board-heading" className="text-base font-bold">
              今日の日盤（全国共通）
            </h3>
            <div className="flex items-start gap-3 sm:block sm:space-y-2">
              <DayBoard board={board} />
              <div className="space-y-1 text-xs">
                <p className="font-semibold">全員に共通の避けたい方位</p>
                <ul className="flex flex-wrap gap-1">
                  {board.common.map((item) => (
                    <li
                      key={item.direction}
                      className="rounded-full bg-theme-accent-soft px-2 py-0.5 font-semibold text-accent"
                    >
                      {item.label}（{item.reason}）
                    </li>
                  ))}
                </ul>
                <p className="text-slate-700 dark:text-ink">
                  {redCities.length
                    ? `地図では${redCities.map((city) => city.city).join("・")}を赤くしています。`
                    : "今日は地図の代表都市に当たりません。"}
                </p>
              </div>
            </div>
          </div>
          <div>
            <table className="w-full text-left text-xs">
              <caption className="pb-1 text-left font-semibold">
                <span className="block">
                  本命星別の今日の吉方位と、その先の天気
                </span>
                <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-ink">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="h-4 w-4 shrink-0 text-slate-800 dark:text-ink"
                    fill="none"
                  >
                    <circle
                      cx="10"
                      cy="10"
                      r="8.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M10 1.8v2.2M10 16v2.2M1.8 10H4M16 10h2.2"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M10 13.8s-3.6-2.2-3.6-4.7a2.1 2.1 0 0 1 3.6-1.45A2.1 2.1 0 0 1 13.6 9.1c0 2.5-3.6 4.7-3.6 4.7Z"
                      fill="var(--wg-gold)"
                    />
                  </svg>
                  今日の恋愛の目安（各行の下段）
                </span>
              </caption>
              <thead>
                <tr>
                  {["本命星", "今日の吉", "吉方位の天気"].map((label) => (
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
                {board.stars.map((star) => {
                  const weather = luckyWeather(star.lucky, groups);
                  const love = loveByStar.get(star.star);
                  return (
                    <Fragment key={star.star}>
                      <tr className="border-t border-slate-200 dark:border-theme-border">
                        <th
                          scope="row"
                          className="whitespace-nowrap px-1.5 py-1"
                        >
                          {love ? (
                            <Link
                              href={love.href}
                              className="underline decoration-slate-300 dark:decoration-theme-border hover:text-accent"
                            >
                              {star.name}
                            </Link>
                          ) : (
                            star.name
                          )}
                        </th>
                        <td className="whitespace-nowrap px-1.5 py-1">
                          {star.lucky.length
                            ? star.lucky
                                .map((direction) => DIRECTION_LABELS[direction])
                                .join("・")
                            : "なし"}
                        </td>
                        <td className="px-1.5 py-1">
                          {weather.length ? (
                            weather.map((part) => (
                              <span
                                key={part}
                                className="block whitespace-nowrap"
                              >
                                {part}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 dark:text-ink-muted">
                              地図の都市なし
                            </span>
                          )}
                        </td>
                      </tr>
                      {love ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-1.5 pb-2 pt-0.5 text-[11px] leading-relaxed text-slate-700 dark:text-ink"
                          >
                            {love.text}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-xs">
              <Link
                href="#today-hours-heading"
                className="text-accent underline"
              >
                下の今の刻と時間帯を見る
              </Link>
              <span className="text-slate-600 dark:text-ink-muted">
                ・本命星は
              </span>
              <Link
                href="/houi#honmei-lookup"
                className="text-accent underline"
              >
                早見
              </Link>
              <span className="text-slate-600 dark:text-ink-muted">
                で分かります（本命星は立春が年の境目で、1月1日から立春前の生まれは前年の星です）。
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-ink-muted">
              これは占い上の目安で、伝統的な見方です。的中や成果を保証しません。
            </p>
          </div>
        </aside>
      </div>
      {data ? (
        <NationalWeatherTable data={data} directions={directions} />
      ) : null}
      <p className="text-xs text-slate-600 dark:text-ink-muted">
        今日の最低は5時・11時発表で予報に出ないため、当日0時以降の観測値（アメダス）を表示します。観測の取得時点までの最低で、欠測時は表示しません。
      </p>
      <p className="text-xs text-slate-600 dark:text-ink-muted">
        出典：
        <a
          className="underline"
          href="https://www.jma.go.jp/bosai/forecast/"
          target="_blank"
          rel="noopener noreferrer"
        >
          気象庁
        </a>
        （府県天気予報）・
        <a className="underline" href="https://www.jma.go.jp/bosai/amedas/">
          アメダス（実況）
        </a>
        を加工して作成。
        <a
          className="underline"
          href="https://www.jma.go.jp/jma/kishou/info/coment.html"
        >
          気象庁データの利用規約（政府標準利用規約を継承する公共データ利用規約）
        </a>
        。地図：
        <a
          className="underline"
          href="https://www.naturalearthdata.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Natural Earth（パブリックドメイン）
        </a>
        。衛星画像は
        <a
          className="underline"
          href="https://maps.gsi.go.jp/development/ichiran.html#modis"
        >
          地理院タイル（世界衛星モザイク画像）
        </a>
        を加工して作成。
        <a
          className="underline"
          href="https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html"
        >
          国土地理院コンテンツ利用規約
        </a>
        。方位の吉凶は伝統的な見方で、効果を保証しません。位置情報は使わず、入力も保存しません。
      </p>
      <p className="text-xs text-slate-600 dark:text-ink-muted" lang="en">
        Images on 世界衛星モザイク画像 obtained from site{" "}
        <a className="underline" href="https://lpdaac.usgs.gov/data_access">
          https://lpdaac.usgs.gov/data_access
        </a>{" "}
        maintained by the NASA Land Processes Distributed Active Archive Center
        (LP DAAC), USGS/Earth Resources Observation and Science (EROS) Center,
        Sioux Falls, South Dakota, (2015). Source of image data product: MODIS
        (NASA).
      </p>
    </section>
  );
}

export async function TodayOverview({
  origin = TOKYO_ORIGIN,
  registered,
}: { origin?: Origin; registered?: Origin | null } = {}) {
  const data = await getNationalWeather();
  return (
    <TodayOverviewCard
      data={data}
      board={buildTodayBoard()}
      origin={origin}
      registered={registered}
    />
  );
}
