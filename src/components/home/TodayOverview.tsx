/**
 * ホーム上部の「今日の天気と方位」。全国の天気の地図に、東京基準の日盤と
 * 本命星別の今日の吉方位を重ねて 1 枚にする。
 *
 * サーバーで描くだけで、入力・位置情報・ブラウザの JavaScript を使わない。
 */
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
import { buildTodayBoard, type TodayBoard } from "@/lib/todayDirections";
import {
  directionFromTokyo,
  distanceFromTokyo,
} from "@/lib/todayWeather/cityDirections";
import {
  getNationalWeather,
  type NationalCityWeather,
  type NationalWeather,
} from "@/lib/todayWeather/national";
import { DIRECTION_LABELS, type CompassDirection } from "@/utils/directionGeo";

/** 都市ごとの東京から見た方位と、その方位が全員共通の凶かどうか。 */
export function cityDirectionsFor(
  data: NationalWeather | null,
  board: TodayBoard,
): CityDirections {
  const result: CityDirections = {};
  for (const city of data?.cities ?? []) {
    const direction = directionFromTokyo(city.prefectureCode);
    if (!direction) continue;
    const common = board.common.find((item) => item.direction === direction);
    result[city.prefectureCode] = {
      label: DIRECTION_LABELS[direction],
      ...(common ? { unlucky: common.reason } : {}),
    };
  }
  return result;
}

/** 方位ごとの代表都市（東京から近い順）。 */
export function citiesByDirection(data: NationalWeather | null) {
  const groups = new Map<CompassDirection, NationalCityWeather[]>();
  for (const city of data?.cities ?? []) {
    const direction = directionFromTokyo(city.prefectureCode);
    if (!direction) continue;
    groups.set(direction, [...(groups.get(direction) ?? []), city]);
  }
  for (const list of groups.values())
    list.sort(
      (a, b) =>
        distanceFromTokyo(a.prefectureCode) -
        distanceFromTokyo(b.prefectureCode),
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
      aria-label={`今日の日盤（東京基準、北が上）。中宮は${STAR_NAMES[board.center]}。${board.common.map((item) => `${item.label}は${item.reason}`).join("、")}。`}
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
                ? "border-rose-400 bg-rose-50 text-rose-900"
                : cell === "CENTER"
                  ? "border-amber-300 bg-amber-50 text-slate-900"
                  : "border-slate-200 bg-white text-slate-900"
            }`}
          >
            <span className="block text-[10px] text-slate-600">
              {cell === "CENTER" ? "中宮・東京" : DIRECTION_LABELS[cell]}
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
}: {
  data: NationalWeather | null;
  board: TodayBoard;
}) {
  const directions = cityDirectionsFor(data, board);
  const groups = citiesByDirection(data);
  const redCities = (data?.cities ?? []).filter(
    (city) => directions[city.prefectureCode]?.unlucky,
  );
  return (
    <section
      aria-labelledby="today-overview-heading"
      className="@container w-full max-w-[1700px] space-y-3 rounded-3xl border border-slate-300 bg-white/95 p-4 text-slate-900 shadow-lg shadow-slate-200/50 md:space-y-4 md:p-8"
    >
      <div>
        <h2 id="today-overview-heading" className="text-xl font-bold">
          今日の天気と方位
        </h2>
        <p className="text-xs text-slate-600">
          <time dateTime={board.date}>{board.date}</time>
          （日本時間）・方位は東京から見たもの
        </p>
      </div>
      {/* 日盤を地図の右に置くのは、セクション幅が十分あるときだけ。
          iPad mini 横（1133px）では左サイドバー（lg:w-64）で中身が約 813px
          しかなく、24rem の日盤を横に並べると地図が 350px 程度になる。 */}
      <div className="grid gap-4 @min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="space-y-2">
          {data ? (
            <NationalWeatherMap data={data} directions={directions} />
          ) : (
            <p className="text-sm text-slate-700">
              いま天気を取得できません。時間をおいて開き直してください。
            </p>
          )}
          <p className="text-xs text-slate-700">
            札の色は天気（薄黄は晴れ、薄青は雨、水色は雪、灰色はくもり）。赤い札は全員に共通の避けたい方位にある都市。太い青枠は残りの降水確率50%以上。
          </p>
        </div>
        <aside
          aria-labelledby="today-board-heading"
          className="space-y-3 sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4 sm:space-y-0 @min-[1100px]:block @min-[1100px]:space-y-3"
        >
          <div className="space-y-2">
            <h3 id="today-board-heading" className="text-base font-bold">
              今日の日盤（東京基準）
            </h3>
            <div className="flex items-start gap-3 sm:block sm:space-y-2">
              <DayBoard board={board} />
              <div className="space-y-1 text-xs">
                <p className="font-semibold">全員に共通の避けたい方位</p>
                <ul className="flex flex-wrap gap-1">
                  {board.common.map((item) => (
                    <li
                      key={item.direction}
                      className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-900"
                    >
                      {item.label}（{item.reason}）
                    </li>
                  ))}
                </ul>
                <p className="text-slate-700">
                  {redCities.length
                    ? `地図では${redCities.map((city) => city.city).join("・")}を赤くしています。`
                    : "今日は地図の代表都市に当たりません。"}
                </p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="text-left font-semibold">
                本命星別の今日の吉方位と、その先の天気
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
                  return (
                    <tr key={star.star} className="border-t border-slate-200">
                      <th scope="row" className="whitespace-nowrap px-1.5 py-1">
                        {star.name}
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
                          <span className="text-slate-500">地図の都市なし</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-xs">
              <Link href="/houi/today" className="text-rose-600 underline">
                時間帯ごとの吉方位を見る
              </Link>
              <span className="text-slate-600">・本命星は</span>
              <Link
                href="/houi#honmei-lookup"
                className="text-rose-600 underline"
              >
                早見
              </Link>
              <span className="text-slate-600">で分かります</span>
            </p>
          </div>
        </aside>
      </div>
      {data ? (
        <NationalWeatherTable data={data} directions={directions} />
      ) : null}
      <p className="text-xs text-slate-600">
        出典：
        <a
          className="underline"
          href="https://www.jma.go.jp/bosai/forecast/"
          target="_blank"
          rel="noopener noreferrer"
        >
          気象庁
        </a>
        （府県天気予報）・地図：
        <a
          className="underline"
          href="https://www.naturalearthdata.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Natural Earth（パブリックドメイン）
        </a>
        。方位の吉凶は伝統的な見方で、効果を保証しません。位置情報は使わず、入力も保存しません。
      </p>
    </section>
  );
}

export async function TodayOverview() {
  const data = await getNationalWeather();
  return <TodayOverviewCard data={data} board={buildTodayBoard()} />;
}
