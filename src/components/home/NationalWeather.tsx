/**
 * ホームの「今日の全国の天気」。気象庁の全国ファイル（010000.json）を 1 回だけ読み、
 * 10 都市の今日・明日を並べる。ホームは静的生成（ISR）のままにするため、
 * ここでは searchParams を読まない。都道府県の詳しい天気は GET フォームで
 * /houi/today?pref= へ送る（JavaScript なし。位置情報は使わず、何も保存しない）。
 * 色で天気の良し悪しを付けない（緑と赤は方位の判定にだけ使う）。
 */
import { Suspense } from "react";
import Link from "next/link";
import {
  getNationalWeather,
  type NationalWeather,
} from "@/lib/todayWeather/national";
import type { JmaDay } from "@/lib/todayWeather/jma";
import { PREFECTURES } from "@/lib/todayWeather/prefectures";

function Temperatures({ day }: { day: JmaDay }) {
  return (
    <>
      {day.max !== undefined ? ` 最高${day.max}℃` : ""}
      {day.min !== undefined ? ` 最低${day.min}℃` : ""}
    </>
  );
}

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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {data.cities.map((city) => (
        <article
          key={city.prefectureCode}
          className="rounded-2xl border border-slate-300 bg-white/95 p-4 text-slate-700"
        >
          <h3 className="font-bold text-slate-900">
            <Link
              className="underline"
              href={`/houi/today?pref=${city.prefectureCode}`}
            >
              {city.city}
            </Link>
          </h3>
          <p className="mt-2 text-sm">今日：{city.today.weather}</p>
          <p className="text-sm">
            <Temperatures day={city.today} />
          </p>
          {city.pop !== undefined ? (
            <p className="text-sm">降水確率 {city.pop}%</p>
          ) : null}
          {city.tomorrow ? (
            <p className="mt-2 text-xs">
              明日：{city.tomorrow.weather}
              <Temperatures day={city.tomorrow} />
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export async function NationalWeatherOverview() {
  return <NationalWeatherCards data={await getNationalWeather()} />;
}

export function NationalWeatherSection() {
  return (
    <section
      aria-labelledby="national-weather-heading"
      className="w-full max-w-[1700px] space-y-4 rounded-3xl border border-slate-300 bg-white/95 p-6 text-slate-900 shadow-lg shadow-slate-200/50 md:p-8"
    >
      <h2 id="national-weather-heading" className="text-xl font-bold">
        今日の全国の天気
      </h2>
      <Suspense
        fallback={<p className="text-sm text-slate-600">天気を読み込み中…</p>}
      >
        <NationalWeatherOverview />
      </Suspense>
      <form
        method="get"
        action="/houi/today"
        className="flex flex-wrap items-end gap-3 text-sm"
      >
        <label>
          都道府県ごとの天気と降水確率は
          <select
            name="pref"
            defaultValue=""
            className="ml-2 rounded border border-slate-300 bg-white p-2"
          >
            <option value="">都道府県を選ぶ</option>
            {PREFECTURES.map((pref) => (
              <option key={pref.code} value={pref.code}>
                {pref.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded border border-slate-300 px-4 py-2 font-bold"
        >
          詳しく見る
        </button>
      </form>
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
        位置情報は使わず、入力も保存しません。
      </p>
    </section>
  );
}
