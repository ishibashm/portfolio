/** ホームの静的生成に含める全国予報。位置情報や入力を使わない。 */
import paths from "@/data/japanMapPaths.json";
import {
  getNationalWeather,
  type NationalWeather,
} from "@/lib/todayWeather/national";
import {
  cardSize,
  insetBox,
  mapCities,
  narrowCities,
  narrowCardSize,
  narrowFontSize,
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
const temp = (value: number | undefined) =>
  value === undefined ? "—" : `${value}℃`;

export function NationalWeatherCards({
  data,
}: {
  data: NationalWeather | null;
}) {
  if (!data)
    return (
      <p className="text-sm text-slate-700">
        いま取得できません。時間をおいて開き直してください。
      </p>
    );
  return (
    <div className="space-y-3">
      {(["wide", "narrow"] as const).map((variant) => {
        const narrow = variant === "narrow";
        const size = narrow ? narrowCardSize : cardSize;
        return (
          <svg
            key={variant}
            role="img"
            aria-labelledby={`weather-map-${variant}-title weather-map-${variant}-desc`}
            viewBox={narrow ? "0 0 400 360" : "0 0 640 620"}
            className={
              narrow
                ? "block h-auto w-full md:hidden"
                : "hidden h-auto w-full max-w-[800px] md:block"
            }
          >
            <title id={`weather-map-${variant}-title`}>
              今日の全国の天気の地図
            </title>
            <desc id={`weather-map-${variant}-desc`}>
              全国の代表10都市の今日の天気と最高気温。詳しい内容は続く表に記載しています。
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
              const label = narrow
                ? narrowCities[city.prefectureCode]
                : position;
              if (!position || !label) return null;
              const point = project(position.lon, position.lat);
              const x = narrow ? 101 + point.x * 0.31 : point.x;
              const y = narrow ? 74 + point.y * 0.31 : point.y;
              return (
                <g key={city.prefectureCode}>
                  <line
                    x1={x}
                    y1={y}
                    x2={label.x + size.width / 2}
                    y2={label.y + size.height / 2}
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
              const weather = city.today.weather.trim();
              const fill = weather.startsWith("晴")
                ? "#fff3d6"
                : weather.startsWith("雨")
                  ? "#e2efff"
                  : weather.startsWith("雪")
                    ? "#e8f4f7"
                    : "#f0f1ed";
              const heavyRain = city.pop !== undefined && city.pop >= 50;
              return (
                <g key={city.prefectureCode}>
                  <rect
                    x={position.x}
                    y={position.y}
                    {...size}
                    rx="8"
                    fill={fill}
                    stroke={heavyRain ? "#245b94" : "#a0b4aa"}
                    strokeWidth={heavyRain ? 3 : 1}
                  />
                  <text
                    x={position.x + 8}
                    y={position.y + (narrow ? 21 : 25)}
                    fontSize={narrow ? narrowFontSize : 21}
                    fontWeight="bold"
                    fill="#172f2a"
                  >
                    {city.city} {narrow ? "" : weatherEmoji(city.today.weather)}
                  </text>
                  <text
                    x={position.x + 8}
                    y={position.y + (narrow ? 44 : 50)}
                    fontSize={narrow ? narrowFontSize : 18}
                    fill="#243f39"
                  >
                    {narrow
                      ? `${weatherEmoji(city.today.weather)} ${temp(city.today.max)}`
                      : `${temp(city.today.max)} / ${temp(city.today.min)}${city.pop !== undefined ? ` ☂${city.pop}%` : ""}`}
                  </text>
                </g>
              );
            })}
          </svg>
        );
      })}
      <p className="text-xs text-slate-700">
        札の色：薄黄は晴れ、薄青は雨、水色は雪、灰色はくもり・その他。太い青枠は残りの降水確率50%以上
      </p>
      <div className="overflow-x-auto">
        <table className="text-left text-xs">
          <caption>10都市の今日の天気（表）</caption>
          <thead>
            <tr>
              {["都市", "天気", "最高", "最低", "降水確率", "明日"].map(
                (label) => (
                  <th key={label} scope="col" className="p-2 whitespace-nowrap">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {data.cities.map((city) => (
              <tr
                key={city.prefectureCode}
                className="border-t border-slate-200"
              >
                <th scope="row" className="p-2 whitespace-nowrap">
                  {city.city}
                </th>
                <td className="p-2">{city.today.weather}</td>
                <td className="p-2 whitespace-nowrap">
                  {temp(city.today.max)}
                </td>
                <td className="p-2 whitespace-nowrap">
                  {temp(city.today.min)}
                </td>
                <td className="p-2">
                  {city.pop !== undefined ? `${city.pop}%` : "—"}
                </td>
                <td className="p-2">
                  {city.tomorrow
                    ? `${city.tomorrow.weather}（${temp(city.tomorrow.max)} / ${temp(city.tomorrow.min)}）`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export async function NationalWeatherOverview() {
  return <NationalWeatherCards data={await getNationalWeather()} />;
}
export async function NationalWeatherSection() {
  const data = await getNationalWeather();
  return (
    <section
      aria-labelledby="national-weather-heading"
      className="w-full max-w-[1700px] space-y-4 rounded-3xl border border-slate-300 bg-white/95 p-6 text-slate-900 shadow-lg shadow-slate-200/50 md:p-8"
    >
      <h2 id="national-weather-heading" className="text-xl font-bold">
        今日の全国の天気
      </h2>
      <NationalWeatherCards data={data} />
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
        （全国の府県天気予報をもとに作成）
      </p>
      <p className="text-xs text-slate-600">
        地図：
        <a
          className="underline"
          href="https://www.naturalearthdata.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Natural Earth（パブリックドメイン）
        </a>
      </p>
      <p className="text-xs text-slate-600">
        位置情報は使わず、入力も保存しません。
      </p>
    </section>
  );
}
