import Link from "next/link";
import { STAR_NAMES } from "@/lib/kigakuContent";
import { honmeiForBirthYear } from "@/lib/todayWeather/birthYear";
type StarToday = {
  star: number;
  today: { lucky: string[]; unlucky: string[] };
};

/** 見出しの横の小さな絵（48px 表示。avif → webp の順に選ばせる）。 */
function SectionIcon({ name, alt }: { name: "fortune"; alt: string }) {
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

const list = (items: string[]) => items.join("・") || "なし";
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

export function TodayFortunePanel({
  birthYear,
  invalidBirthYear,
  stars,
}: {
  birthYear: number | null;
  invalidBirthYear: boolean;
  stars: StarToday[];
}) {
  return (
    <section
      aria-labelledby="today-fortune-heading"
      className="wg-card space-y-4 p-5"
    >
      <h2 id="today-fortune-heading" className="text-xl font-bold">
        生まれ年で見る今日の方位
      </h2>
      <form
        method="get"
        action="/houi/today"
        className="flex flex-wrap items-end gap-3 text-sm"
      >
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
      <FortuneBlock
        birthYear={birthYear}
        invalidBirthYear={invalidBirthYear}
        stars={stars}
      />
      <p className="text-xs text-slate-600">
        生まれ年はこの表示にだけ使い、保存しません。
      </p>
    </section>
  );
}
