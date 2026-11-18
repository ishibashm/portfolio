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
      <svg
        role="img"
        aria-labelledby="weather-map-title weather-map-desc"
        viewBox="0 0 640 620"
        className="block h-auto w-full max-w-[800px]"
      >
        <title id="weather-map-title">今日の全国の天気の地図</title>
        <desc id="weather-map-desc">
          全国の代表10都市の今日の天気、最高・最低気温と降水確率。詳しい内容は続く表に記載しています。
        </desc>
        <rect width="640" height="620" fill="#e0f2fe" />
        <path d={paths.main} fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" />
        <rect {...insetBox} fill="#e0f2fe" stroke="#94a3b8" strokeWidth="1" />
        <path d={paths.inset} fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" />
        <text x="12" y="26" fontSize="16" fill="#334155">
          南西諸島
        </text>
        {data.cities.map((city) => {
          const position = mapCities[city.prefectureCode];
          if (!position) return null;
          const point = project(position.lon, position.lat);
          return (
            <g key={city.prefectureCode}>
              <line
                x1={Math.round(point.x)}
                y1={Math.round(point.y)}
                x2={position.x + cardSize.width / 2}
                y2={position.y + cardSize.height / 2}
                stroke="#475569"
                strokeWidth="1"
              />
              <circle
                cx={Math.round(point.x)}
                cy={Math.round(point.y)}
                r="3"
                fill="#334155"
              />
            </g>
          );
        })}
        {data.cities.map((city) => {
          const position = mapCities[city.prefectureCode];
          if (!position) return null;
          return (
            <g key={city.prefectureCode}>
              <rect
                x={position.x}
                y={position.y}
                {...cardSize}
                rx="7"
                fill="white"
                stroke="#94a3b8"
              />
              <text
                x={position.x + 8}
                y={position.y + 25}
                fontSize="21"
                fontWeight="bold"
                fill="#0f172a"
              >
                {city.city} {weatherEmoji(city.today.weather)}
              </text>
              <text
                x={position.x + 8}
                y={position.y + 50}
                fontSize="18"
                fill="#334155"
              >
                {temp(city.today.max)} / {temp(city.today.min)}
                {city.pop !== undefined ? ` ☂${city.pop}%` : ""}
              </text>
            </g>
          );
        })}
      </svg>
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
