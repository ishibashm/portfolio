/**
 * /houi/today の先頭に置く「今日の天気」。
 * 都道府県と生まれ年は GET のフォームで受け取るので、JavaScript なしでも動く。
 * 都道府県を選ぶまでは外部へ取りに行かない（初期値は prefectures.ts の
 * DEFAULT_PREFECTURE_CODE）。取得に失敗しても、この枠だけ「いま取得できません」にする。
 * 色で天気の良し悪しを付けない（緑と赤は方位の判定にだけ使う）。
 */
import Link from "next/link";
import { STAR_NAMES } from "@/lib/kigakuContent";
import { honmeiForBirthYear } from "@/lib/todayWeather/birthYear";
import {
  getJmaForecast,
  jmaForecastPageUrl,
  type JmaForecast,
} from "@/lib/todayWeather/jma";
import { PREFECTURES, type Prefecture } from "@/lib/todayWeather/prefectures";

type StarToday = {
  star: number;
  today: { lucky: string[]; unlucky: string[] };
};

/** 見出しの横の小さな絵（48px 表示。avif → webp の順に選ばせる）。 */
function SectionIcon({
  name,
  alt,
}: {
  name: "weather" | "fortune";
  alt: string;
}) {
  const set = (ext: string) =>
    `/today/icon-${name}-96.${ext} 1x, /today/icon-${name}-192.${ext} 2x`;
  return (
    <picture>
      <source type="image/avif" srcSet={set("avif")} />
      <img
        src={`/today/icon-${name}-96.webp`}
        srcSet={set("webp")}
        alt={alt}
        width={48}
        height={48}
        loading="lazy"
        decoding="async"
        className="h-12 w-12 shrink-0"
      />
    </picture>
  );
}

/** 枠の先頭の絵。しるべが手を振る朝の空。1280×580 を 960 幅・480 幅に縮めたもの。 */
function PanelBanner() {
  const sizes = "(min-width: 1024px) 984px, calc(100vw - 4.5rem)";
  return (
    <picture>
      <source
        type="image/avif"
        srcSet="/today/banner-480.avif 480w, /today/banner-960.avif 960w"
        sizes={sizes}
      />
      <img
        src="/today/banner-960.webp"
        srcSet="/today/banner-480.webp 480w, /today/banner-960.webp 960w"
        sizes={sizes}
        alt="朝焼けの空の下で手を振るしるべと、天気・方位の絵"
        width={960}
        height={435}
        fetchPriority="high"
        decoding="async"
        className="h-auto w-full rounded-lg"
      />
    </picture>
  );
}

const list = (items: string[]) => items.join("・") || "なし";
const dayLabel = (date: string, today: string) => {
  const [, m, d] = date.split("-").map(Number);
  const prefix = date === today ? "今日" : date > today ? "明日" : "前日";
  return `${prefix}（${m}月${d}日）`;
};
const jstTime = (iso: string) => {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  return m ? `${Number(m[1])}時${m[2] === "00" ? "" : `${m[2]}分`}` : "";
};

function WeatherBlock({
  pref,
  forecast,
  today,
}: {
  pref: Prefecture;
  forecast: JmaForecast | null;
  today: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 font-bold">
        <SectionIcon name="weather" alt="晴れと傘の絵" />
        天気（{pref.name}・{forecast?.areaName || pref.city}）
      </h3>
      {forecast ? (
        <>
          <ul className="space-y-1 text-sm">
            {forecast.days.map((day) => (
              <li key={day.date}>
                <b>{dayLabel(day.date, today)}：</b>
                {day.weather}
                {day.max !== undefined || day.min !== undefined ? (
                  <span className="text-slate-700">
                    {" "}
                    （{pref.city}
                    {day.max !== undefined ? ` 最高${day.max}℃` : ""}
                    {day.min !== undefined ? ` 最低${day.min}℃` : ""}）
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {forecast.pops.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="text-left text-xs">
                <caption className="sr-only">降水確率（6時間ごと）</caption>
                <thead>
                  <tr className="border-b">
                    <th scope="row" className="p-1 pr-2">
                      降水確率
                    </th>
                    {forecast.pops.map((p) => (
                      <th
                        key={`${p.date}-${p.startHour}`}
                        scope="col"
                        className="p-1 font-normal whitespace-nowrap"
                      >
                        {p.date === today ? "" : "明日 "}
                        {p.startHour}–{p.endHour}時
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-1 pr-2" />
                    {forecast.pops.map((p) => (
                      <td key={`${p.date}-${p.startHour}`} className="p-1">
                        {p.pop}%
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="text-xs text-slate-600">
            {forecast.reportDatetime
              ? `${forecast.publishingOffice} ${jstTime(forecast.reportDatetime)}発表。`
              : ""}
            出典：
            <a
              href={jmaForecastPageUrl(pref.area)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              気象庁
            </a>
            （府県天気予報をもとに作成）
          </p>
        </>
      ) : (
        <p className="text-sm">
          いま取得できません。時間をおいて開き直してください。
        </p>
      )}
    </div>
  );
}

function FortuneBlock({
  birthYear,
  invalidBirthYear,
  stars,
}: {
  birthYear: number | null;
  invalidBirthYear: boolean;
  stars: StarToday[];
}) {
  const icon = <SectionIcon name="fortune" alt="方位磁石の絵" />;
  if (birthYear === null)
    return (
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 font-bold">
          {icon}
          今日の方位
        </h3>
        <p className="text-sm">
          {invalidBirthYear
            ? "生まれ年は、西暦4桁（例：1985）で入れてください。"
            : "生まれ年を入れると、あなたの本命星の今日の吉方位も出ます。"}
        </p>
      </div>
    );
  const { main, beforeRisshun } = honmeiForBirthYear(birthYear);
  const today = (star: number) => stars.find((s) => s.star === star)?.today;
  const mainToday = today(main);
  const beforeToday = today(beforeRisshun);
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 font-bold">
        {icon}
        今日の方位（{birthYear}年生まれ・{STAR_NAMES[main]}）
      </h3>
      {mainToday ? (
        <p className="text-sm">
          <b>吉：</b>
          {list(mainToday.lucky)}　<b>凶：</b>
          {list(mainToday.unlucky)}
        </p>
      ) : null}
      <p className="text-xs text-slate-600">
        1月1日〜節分（2月3日ごろ）生まれの方は前年の{STAR_NAMES[beforeRisshun]}
        {beforeToday
          ? `（吉：${list(beforeToday.lucky)}／凶：${list(beforeToday.unlucky)}）`
          : ""}
        です。生年月日で確かめるときは
        <Link href="/houi" className="text-rose-600 underline">
          本命星の早見
        </Link>
        へ。時間帯は下の本命星別の表で見られます。
      </p>
    </div>
  );
}

/** 都道府県を選ぶまでは外部に取りに行かない。失敗しても null で返る。 */
export async function loadTodayWeather(pref: Prefecture | null): Promise<{
  forecast: JmaForecast | null;
}> {
  if (!pref) return { forecast: null };
  return { forecast: await getJmaForecast(pref) };
}

export function TodayWeatherPanel({
  pref,
  forecast,
  birthYear,
  invalidBirthYear,
  today,
  stars,
}: {
  pref: Prefecture | null;
  forecast: JmaForecast | null;
  birthYear: number | null;
  invalidBirthYear: boolean;
  /** 表示対象日（YYYY-MM-DD、日本時間） */
  today: string;
  stars: StarToday[];
}) {
  return (
    <section
      aria-labelledby="today-weather-heading"
      className="wg-card space-y-4 p-5"
    >
      <PanelBanner />
      <h2 id="today-weather-heading" className="text-xl font-bold">
        今日の天気
      </h2>
      <form
        method="get"
        action="/houi/today"
        className="flex flex-wrap items-end gap-3 text-sm"
      >
        <label>
          都道府県
          <select
            name="pref"
            defaultValue={pref ? String(pref.code) : ""}
            className="block border p-2"
          >
            <option value="">選んでください</option>
            {PREFECTURES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          生まれ年（任意）
          <input
            name="birthYear"
            type="text"
            inputMode="numeric"
            pattern="[0-9０-９]{4}"
            maxLength={4}
            placeholder="例：1985"
            defaultValue={birthYear ?? ""}
            autoComplete="off"
            className="block w-28 border p-2"
          />
        </label>
        <button className="wg-btn-primary" type="submit">
          表示する
        </button>
      </form>
      {pref ? (
        <WeatherBlock pref={pref} forecast={forecast} today={today} />
      ) : (
        <p className="text-sm">都道府県を選ぶと、今日の天気が出ます。</p>
      )}
      <FortuneBlock
        birthYear={birthYear}
        invalidBirthYear={invalidBirthYear}
        stars={stars}
      />
      <p className="text-xs text-slate-600">
        生まれ年はこの表示にだけ使い、保存しません。天気は県庁所在地のある地域の予報です。
      </p>
    </section>
  );
}
