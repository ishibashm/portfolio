/** ホームの静的生成に含める全国予報。位置情報や入力を使わない。 */
import paths from "@/data/japanMapPaths.json";
import type { NationalWeather } from "@/lib/todayWeather/national";
import {
  cardSize,
  insetBox,
  mapCities,
  mapViewBox,
  narrowCities,
  narrowCardSize,
  narrowFontSize,
  narrowViewBox,
  nearestOnCard,
  project,
} from "@/lib/todayWeather/mapProjection";

export function weatherEmoji(text: string): string {
  const first = text.trim();
  if (first.startsWith("晴")) return "☀️";
  if (first.startsWith("くもり") || first.startsWith("曇")) return "☁️";
  if (first.startsWith("雨")) return "🌧️";
  if (first.startsWith("雪")) return "❄️";
  return "";
}

const WORD = "(晴れ|晴|くもり|曇り|雨|雪)";
/**
 * 狭い画面の表で 1 行に収める短い天気。「くもり 時々 雪か雨」→「くもり時々雪」。
 * 主な天気と、時々・一時・のちの次の天気だけを残す。読めない文は先頭 4 字。
 */
export function shortWeather(text: string): string {
  const compact = text.replace(/\s+/g, "");
  const match = compact.match(
    new RegExp(`^${WORD}(?:(時々|一時|のち)${WORD})?`),
  );
  if (!match) return compact.slice(0, 4);
  return match[2] ? `${match[1]}${match[2]}${match[3]}` : match[1];
}

export const temp = (value: number | undefined) =>
  value === undefined ? "—" : `${value}℃`;

/** 札・表に添える、東京から見た方位。unlucky は全員共通の凶の名前。 */
export type CityDirection = { label: string; unlucky?: string };
export type CityDirections = Record<number, CityDirection>;

const UNLUCKY_FILL = "#ffe4e6";
const UNLUCKY_TEXT = "#9f1239";

function cardFill(weather: string, unlucky: boolean) {
  if (unlucky) return UNLUCKY_FILL;
  const text = weather.trim();
  if (text.startsWith("晴")) return "#fff3d6";
  if (text.startsWith("雨")) return "#e2efff";
  if (text.startsWith("雪")) return "#e8f4f7";
  return "#f0f1ed";
}

function directionText(direction: CityDirection | undefined, code: number) {
  if (code === 13) return "起点";
  if (!direction) return "";
  return direction.unlucky
    ? `${direction.label}・${direction.unlucky}`
    : direction.label;
}

export function NationalWeatherMap({
  data,
  directions = {},
}: {
  data: NationalWeather;
  directions?: CityDirections;
}) {
  return (
    <>
      {(["wide", "narrow"] as const).map((variant) => {
        const narrow = variant === "narrow";
        const size = narrow ? narrowCardSize : cardSize;
        const box = narrow ? narrowViewBox : mapViewBox;
        return (
          <svg
            key={variant}
            role="img"
            aria-labelledby={`weather-map-${variant}-title weather-map-${variant}-desc`}
            viewBox={`0 0 ${box.width} ${box.height}`}
            className={
              narrow
                ? "block h-auto w-full md:hidden"
                : "hidden h-auto w-full max-w-[720px] md:block"
            }
          >
            <title id={`weather-map-${variant}-title`}>
              今日の全国の天気の地図
            </title>
            <desc id={`weather-map-${variant}-desc`}>
              全国の代表10都市の今日の天気と最高気温、東京から見た方位。詳しい内容は続く表に記載しています。
            </desc>
            <rect width="100%" height="100%" rx="12" fill="#eaf4f5" />
            <g transform={narrow ? "translate(101 74) scale(0.31)" : undefined}>
              <defs>
                <filter
                  id={`land-shadow-${variant}`}
                  x="-10%"
                  y="-10%"
                  width="120%"
                  height="120%"
                >
                  <feDropShadow
                    dx="0"
                    dy="3"
                    stdDeviation="2"
                    floodColor="#8ca99d"
                    floodOpacity="0.35"
                  />
                </filter>
              </defs>
              <path
                d={paths.main}
                fill="#e3ede5"
                stroke="#8ca99d"
                strokeWidth="1"
                filter={`url(#land-shadow-${variant})`}
              />
              <rect
                {...insetBox}
                rx="8"
                fill="#eaf4f5"
                stroke="#8ca99d"
                strokeWidth="1"
              />
              <path
                d={paths.inset}
                fill="#e3ede5"
                stroke="#8ca99d"
                strokeWidth="1"
              />
            </g>
            <text
              x={narrow ? 101 : 12}
              y={narrow ? 68 : 26}
              fontSize={narrow ? 14 : 16}
              fill="#243f39"
            >
              南西諸島
            </text>
            {data.cities.map((city) => {
              const position = mapCities[city.prefectureCode];
              const card = narrow
                ? narrowCities[city.prefectureCode]
                : position;
              if (!position || !card) return null;
              const point = project(position.lon, position.lat);
              const x = narrow ? 101 + point.x * 0.31 : point.x;
              const y = narrow ? 74 + point.y * 0.31 : point.y;
              const end = nearestOnCard({ x, y }, card, size);
              return (
                <g key={city.prefectureCode}>
                  <line
                    x1={x}
                    y1={y}
                    x2={end.x}
                    y2={end.y}
                    stroke="#49635d"
                    strokeWidth="1"
                  />
                  <circle cx={x} cy={y} r={narrow ? 2.5 : 3} fill="#243f39" />
                </g>
              );
            })}
            {data.cities.map((city) => {
              const position = narrow
                ? narrowCities[city.prefectureCode]
                : mapCities[city.prefectureCode];
              if (!position) return null;
              const direction = directions[city.prefectureCode];
              const unlucky = Boolean(direction?.unlucky);
              const heavyRain = city.pop !== undefined && city.pop >= 50;
              const emoji = weatherEmoji(city.today.weather);
              return (
                <g key={city.prefectureCode}>
                  <rect
                    x={position.x}
                    y={position.y}
                    {...size}
                    rx="8"
                    fill={cardFill(city.today.weather, unlucky)}
                    stroke={
                      heavyRain ? "#245b94" : unlucky ? "#be123c" : "#a0b4aa"
                    }
                    strokeWidth={heavyRain ? 3 : unlucky ? 2 : 1}
                  />
                  <text
                    x={position.x + 8}
                    y={position.y + (narrow ? 20 : 22)}
                    fontSize={narrow ? narrowFontSize : 18}
                    fontWeight="bold"
                    fill="#172f2a"
                  >
                    {city.city} {narrow ? "" : emoji}
                  </text>
                  <text
                    x={position.x + 8}
                    y={position.y + (narrow ? 40 : 41)}
                    fontSize={narrow ? narrowFontSize : 15}
                    fill="#243f39"
                  >
                    {narrow
                      ? `${emoji} ${temp(city.today.max)}`
                      : `${temp(city.today.max)} / ${temp(city.today.min)}${city.pop !== undefined ? ` ☂${city.pop}%` : ""}`}
                  </text>
                  <text
                    x={position.x + 8}
                    y={position.y + (narrow ? 56 : 58)}
                    fontSize={narrow ? 13 : 14}
                    fontWeight={unlucky ? "bold" : undefined}
                    fill={unlucky ? UNLUCKY_TEXT : "#334155"}
                  >
                    {directionText(direction, city.prefectureCode)}
                  </text>
                </g>
              );
            })}
          </svg>
        );
      })}
    </>
  );
}

function WeatherRows({
  data,
  directions,
  compact,
}: {
  data: NationalWeather;
  directions: CityDirections;
  compact: boolean;
}) {
  const cell = compact ? "whitespace-nowrap px-1 py-1" : "p-2";
  return (
    <>
      <thead>
        <tr>
          {[
            "都市",
            compact ? "方位" : "東京から",
            "天気",
            compact ? "最高/低" : "最高/最低",
            "降水",
            "明日",
          ].map((label) => (
            <th key={label} scope="col" className={`${cell} whitespace-nowrap`}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.cities.map((city) => {
          const direction = directions[city.prefectureCode];
          const unlucky = Boolean(direction?.unlucky);
          return (
            <tr key={city.prefectureCode} className="border-t border-slate-200">
              <th scope="row" className={`${cell} whitespace-nowrap`}>
                {city.city}
              </th>
              <td
                className={`${cell} whitespace-nowrap ${unlucky ? "font-bold text-rose-800" : ""}`}
              >
                {compact
                  ? city.prefectureCode === 13
                    ? "起点"
                    : (direction?.label ?? "—")
                  : directionText(direction, city.prefectureCode) || "—"}
              </td>
              <td className={cell}>
                {compact
                  ? `${weatherEmoji(city.today.weather)}${shortWeather(city.today.weather)}`
                  : city.today.weather}
              </td>
              <td className={`${cell} whitespace-nowrap`}>
                {compact
                  ? `${city.today.max ?? "—"}/${city.today.min ?? "—"}℃`
                  : `${temp(city.today.max)}/${temp(city.today.min)}`}
              </td>
              <td className={`${cell} whitespace-nowrap`}>
                {city.pop !== undefined ? `${city.pop}%` : "—"}
              </td>
              <td className={cell}>
                {!city.tomorrow
                  ? "—"
                  : compact
                    ? `${weatherEmoji(city.tomorrow.weather) || shortWeather(city.tomorrow.weather)}${temp(city.tomorrow.max)}`
                    : `${city.tomorrow.weather}（${temp(city.tomorrow.max)} / ${temp(city.tomorrow.min)}）`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </>
  );
}

/**
 * 10 都市の表。狭い画面では地図の札に同じ都市・天気・気温・方位が出ているので、
 * 表は短い天気と記号の 1 行にして畳んでおき、縦に伸ばさない（HTML の details
 * なので JavaScript は使わない）。lg 以上では全文の表を開いて置く。
 */
export function NationalWeatherTable({
  data,
  directions = {},
}: {
  data: NationalWeather;
  directions?: CityDirections;
}) {
  return (
    <>
      <details className="text-xs lg:hidden">
        <summary className="cursor-pointer font-semibold text-slate-800 underline underline-offset-4">
          10都市の表を開く（最低気温・降水確率・明日）
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">10都市の今日の天気（表）</caption>
            <WeatherRows data={data} directions={directions} compact />
          </table>
        </div>
      </details>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-xs">
          <caption className="text-left font-semibold">
            10都市の今日の天気（表）
          </caption>
          <WeatherRows data={data} directions={directions} compact={false} />
        </table>
      </div>
    </>
  );
}

export function NationalWeatherCards({
  data,
  directions,
}: {
  data: NationalWeather | null;
  directions?: CityDirections;
}) {
  if (!data)
    return (
      <p className="text-sm text-slate-700">
        いま天気を取得できません。時間をおいて開き直してください。
      </p>
    );
  return (
    <div className="space-y-3">
      <NationalWeatherMap data={data} directions={directions} />
      <NationalWeatherTable data={data} directions={directions} />
    </div>
  );
}
