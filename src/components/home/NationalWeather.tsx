/** ホームのサーバー描画に含める全国予報。位置情報や入力を使わない。 */
import paths from "@/data/japanMapPaths.json";
import type { NationalWeather } from "@/lib/todayWeather/national";
import type { JmaDay } from "@/lib/todayWeather/jma";
import {
  applyTransform,
  insetBox,
  mainSatelliteBox,
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
  if (kind === "compact")
    return `${prefix}${day.max === undefined ? "最低" : ""}${temp(day.max ?? day.min)}`;
  const rain = pop !== undefined ? ` ☂${pop}%` : "";
  if (day.min === undefined) return `${prefix}最高${temp(day.max)}${rain}`;
  if (day.max === undefined) return `${prefix}最低${temp(day.min)}${rain}`;
  // 「明日」付きは札の幅に収めるため、度数記号は末尾だけにする。
  const range = prefix
    ? `${prefix}${day.max ?? "—"}/${day.min ?? "—"}℃`
    : `${temp(day.max)}/${temp(day.min)}`;
  return `${range}${rain}`;
}

/** 札・表に添える、起点から見た方位。unlucky は全員共通の凶の名前。 */
export type CityDirection = { label: string; unlucky?: string };
export type CityDirections = Record<number, CityDirection>;

const UNLUCKY_TEXT = "#9f1239";

const MAP_CARD_STYLES = {
  sunny: { label: "晴", fill: "#fff3d6" },
  cloudy: { label: "くもり", fill: "#f0f1ed" },
  rainy: { label: "雨", fill: "#e2efff" },
  snowy: { label: "雪", fill: "#e8f4f7" },
  unlucky: { label: "避けたい方位", fill: "#ffe4e6" },
} as const;

function mapCardKind(weather: string, unlucky: boolean) {
  if (unlucky) return "unlucky";
  const text = weather.trim();
  if (text.startsWith("晴")) return "sunny";
  if (text.startsWith("雨")) return "rainy";
  if (text.startsWith("雪")) return "snowy";
  return "cloudy";
}

function directionText(direction: CityDirection | undefined, code: number) {
  if (!direction && code === 13) return "起点";
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
            fontSize={layout.fontSize}
            className={layout.className}
          >
            <title id={`weather-map-${variant}-title`}>
              今日の全国の天気の地図
            </title>
            <desc id={`weather-map-${variant}-desc`}>
              全国の代表10都市の今日の天気と気温、起点から見た方位。夕方の発表で今日の気温が無いときは明日の気温を記載します。詳しい内容は続く表に記載しています。
            </desc>
            <rect
              width="100%"
              height="100%"
              rx="12"
              className="weather-map-sea"
            />
            <g transform={`translate(${map.x} ${map.y}) scale(${map.scale})`}>
              <image
                {...mainSatelliteBox}
                href="/weather/japan-satellite-main.webp"
                preserveAspectRatio="none"
                className="weather-map-satellite"
              />
              <path d={paths.main} className="weather-map-outline" />
              <image
                {...insetBox}
                href="/weather/japan-satellite-inset.webp"
                preserveAspectRatio="none"
                className="weather-map-satellite"
              />
              <rect {...insetBox} className="weather-map-outline" />
              <path d={paths.inset} className="weather-map-outline" />
            </g>
            <text
              x={map.x + insetBox.x * map.scale}
              y={map.y + insetBox.y * map.scale - 4}
              fontSize={variant === "narrow" ? 14 : 16}
              fill="#fff3d6"
            >
              南西諸島
            </text>
            <g className="weather-map-markers">
              {data.cities.map((city) => {
                const geo = mapCities[city.prefectureCode];
                const card = layout.cities[city.prefectureCode];
                if (!geo || !card) return null;
                const point = applyTransform(project(geo.lon, geo.lat), map);
                const end = nearestOnCard(point, card, size);
                return (
                  <g key={city.prefectureCode}>
                    <line x1={point.x} y1={point.y} x2={end.x} y2={end.y} />
                    <circle cx={point.x} cy={point.y} r={layout.circle} />
                  </g>
                );
              })}
            </g>
            {data.cities.map((city) => {
              const position = layout.cities[city.prefectureCode];
              if (!position) return null;
              const direction = directions[city.prefectureCode];
              const unlucky = Boolean(direction?.unlucky);
              const cardKind = mapCardKind(city.today.weather, unlucky);
              const heavyRain = city.pop !== undefined && city.pop >= 50;
              const emoji = weatherEmoji(city.today.weather);
              const usesTomorrow =
                !hasTemps(city.today) && hasTemps(city.tomorrow);
              return (
                <g
                  key={city.prefectureCode}
                  className={`weather-map-card weather-map-${cardKind}${heavyRain ? " weather-map-heavy-rain" : ""}`}
                >
                  <rect
                    x={position.x}
                    y={position.y}
                    {...size}
                    rx="8"
                    fill={MAP_CARD_STYLES[cardKind].fill}
                  />
                  <text
                    x={position.x + 8}
                    y={position.y + layout.nameY}
                    fontWeight="bold"
                    fill="#172f2a"
                  >
                    {city.city} {layout.compactTemp ? "" : emoji}
                  </text>
                  <text
                    x={position.x + 8}
                    y={position.y + layout.tempY}
                    fontSize={
                      layout.tempFontSize === layout.fontSize
                        ? undefined
                        : layout.tempFontSize
                    }
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
      <ul
        aria-label="天気地図の凡例"
        className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700 dark:text-ink"
      >
        {Object.entries(MAP_CARD_STYLES).map(([kind, { label, fill }]) => (
          <li
            key={kind}
            className={`flex items-center gap-1 weather-map-${kind}`}
          >
            <span
              aria-hidden="true"
              className="size-3 rounded-sm border border-current"
              style={{
                backgroundColor: `var(--weather-map-card-fill, ${fill})`,
              }}
            />
            {label}
          </li>
        ))}
      </ul>
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
            compact ? "方位" : "起点から",
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
            <tr
              key={city.prefectureCode}
              className="border-t border-slate-200 dark:border-theme-border"
            >
              <th scope="row" className={`${cell} whitespace-nowrap`}>
                {city.city}
              </th>
              <td
                className={`${cell} whitespace-nowrap ${unlucky ? "font-bold text-rose-800 dark:text-theme-bad" : ""}`}
              >
                {compact
                  ? (direction?.label ??
                    (city.prefectureCode === 13 ? "起点" : "—"))
                  : directionText(direction, city.prefectureCode) || "—"}
              </td>
              <td className={cell}>
                {compact
                  ? `${weatherEmoji(city.today.weather)}${shortWeather(city.today.weather)}`
                  : city.today.weather}
              </td>
              <td className={`${cell} whitespace-nowrap`}>
                {formatTemps(city.today, city.tomorrow, "range")}
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
        <summary className="cursor-pointer font-semibold text-slate-800 dark:text-ink underline underline-offset-4">
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
      <p className="text-sm text-slate-700 dark:text-ink">
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
