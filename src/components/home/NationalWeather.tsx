/** ホームの静的生成に含める全国予報。位置情報や入力を使わない。 */
import paths from "@/data/japanMapPaths.json";
import type { NationalWeather } from "@/lib/todayWeather/national";
import type { JmaDay } from "@/lib/todayWeather/jma";
import {
  applyTransform,
  insetBox,
  mapCities,
  narrowCities,
  narrowCardSize,
  narrowFontSize,
  narrowMap,
  narrowViewBox,
  nearestOnCard,
  project,
  wideCardSize,
  wideCities,
  wideFontSize,
  wideMap,
  wideTempFontSize,
  wideViewBox,
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

const hasTemps = (day?: Pick<JmaDay, "max" | "min">) =>
  day != null && (day.max !== undefined || day.min !== undefined);

/**
 * 夕方の発表では今日の気温が予報から落ち、札が「—」だけになる。
 * 明日の値があるときは「明日」と付けて出す。
 */
export function formatTemps(
  today: Pick<JmaDay, "max" | "min">,
  tomorrow?: Pick<JmaDay, "max" | "min">,
  kind: "compact" | "range" = "compact",
  pop?: number,
) {
  const usesTomorrow = !hasTemps(today) && hasTemps(tomorrow);
  const day = usesTomorrow ? tomorrow : hasTemps(today) ? today : undefined;
  if (!day) return kind === "compact" ? "—" : "— / —";
  const prefix = usesTomorrow ? "明日" : "";
  if (kind === "compact") return `${prefix}${temp(day.max)}`;
  const rain = pop !== undefined ? ` ☂${pop}%` : "";
  // 「明日」付きは札の幅に収めるため、度数記号は末尾だけにする。
  const range = prefix
    ? `${prefix}${day.max ?? "—"}/${day.min ?? "—"}℃`
    : `${temp(day.max)}/${temp(day.min)}`;
  return `${range}${rain}`;
}

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

const LAYOUTS = {
  wide: {
    size: wideCardSize,
    box: wideViewBox,
    cities: wideCities,
    fontSize: wideFontSize,
    tempFontSize: wideTempFontSize,
    dirFontSize: 14,
    className: "hidden h-auto w-full sm:block",
    map: wideMap,
    nameY: 22,
    tempY: 41,
    dirY: 58,
    compactTemp: false,
    circle: 3,
  },
  narrow: {
    size: narrowCardSize,
    box: narrowViewBox,
    cities: narrowCities,
    fontSize: narrowFontSize,
    tempFontSize: narrowFontSize,
    dirFontSize: 13,
    className: "block h-auto w-full sm:hidden",
    map: narrowMap,
    nameY: 20,
    tempY: 40,
    dirY: 56,
    compactTemp: true,
    circle: 2.5,
  },
} as const;

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
        const layout = LAYOUTS[variant];
        const { size, box, map } = layout;
        return (
          <svg
            key={variant}
            role="img"
            aria-labelledby={`weather-map-${variant}-title weather-map-${variant}-desc`}
            viewBox={`0 0 ${box.width} ${box.height}`}
            className={layout.className}
          >
            <title id={`weather-map-${variant}-title`}>
              今日の全国の天気の地図
            </title>
            <desc id={`weather-map-${variant}-desc`}>
              全国の代表10都市の今日の天気と気温、東京から見た方位。夕方の発表で今日の気温が無いときは明日の気温を記載します。詳しい内容は続く表に記載しています。
            </desc>
            <rect width="100%" height="100%" rx="12" fill="#eaf4f5" />
            <g transform={`translate(${map.x} ${map.y}) scale(${map.scale})`}>
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
              x={map.x + insetBox.x * map.scale}
              y={map.y + insetBox.y * map.scale - 4}
              fontSize={variant === "narrow" ? 14 : 16}
              fill="#243f39"
            >
              南西諸島
            </text>
            {data.cities.map((city) => {
              const geo = mapCities[city.prefectureCode];
              const card = layout.cities[city.prefectureCode];
              if (!geo || !card) return null;
              const point = applyTransform(project(geo.lon, geo.lat), map);
              const end = nearestOnCard(point, card, size);
              return (
                <g key={city.prefectureCode}>
                  <line
                    x1={point.x}
                    y1={point.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="#49635d"
                    strokeWidth="1"
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={layout.circle}
                    fill="#243f39"
                  />
                </g>
              );
            })}
            {data.cities.map((city) => {
              const position = layout.cities[city.prefectureCode];
              if (!position) return null;
              const direction = directions[city.prefectureCode];
              const unlucky = Boolean(direction?.unlucky);
              const heavyRain = city.pop !== undefined && city.pop >= 50;
              const emoji = weatherEmoji(city.today.weather);
              const usesTomorrow =
                !hasTemps(city.today) && hasTemps(city.tomorrow);
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
                    y={position.y + layout.nameY}
                    fontSize={layout.fontSize}
                    fontWeight="bold"
                    fill="#172f2a"
                  >
                    {city.city} {layout.compactTemp ? "" : emoji}
                  </text>
                  <text
                    x={position.x + 8}
                    y={position.y + layout.tempY}
                    fontSize={layout.tempFontSize}
                    fill="#243f39"
                  >
                    {layout.compactTemp
                      ? `${emoji} ${temp((usesTomorrow ? city.tomorrow : city.today)?.max)}`
                      : formatTemps(
                          city.today,
                          city.tomorrow,
                          "range",
                          city.pop,
                        )}
                  </text>
                  <text
                    x={position.x + 8}
                    y={position.y + layout.dirY}
                    fontSize={layout.dirFontSize}
                    fontWeight={unlucky ? "bold" : undefined}
                    fill={unlucky ? UNLUCKY_TEXT : "#334155"}
                  >
                    {usesTomorrow && layout.compactTemp
                      ? `明日 ${directionText(direction, city.prefectureCode)}`.trim()
                      : directionText(direction, city.prefectureCode)}
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
