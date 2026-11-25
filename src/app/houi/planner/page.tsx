import type { Metadata } from "next";
import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { AREAS, findArea } from "@/lib/areaContent";
import { HOUI_BREADCRUMB_LABEL, STAR_NAMES, STARS } from "@/lib/kigakuContent";
import {
  buildKichihouiPlan,
  googleCalendarUrl,
  parsePlannerQuery,
  plannerHref,
  PLANNER_PURPOSES,
  PLANNER_WEEKS,
  type PlannerDirection,
  type PlannerPurpose,
} from "@/lib/kichihouiPlanner";
import { buildBase } from "@/lib/mcpDirections";
import { loadPowerSpots } from "@/lib/powerSpots";
import { plainRokuyo } from "@/lib/rokuyoLabel";
import { pageOpenGraph, SITE_URL } from "@/lib/siteUrl";
import { CITY_ORIGINS, TOKYO_ORIGIN } from "@/lib/todayWeather/origin";
import { getRegisteredProfile } from "@/lib/todayWeather/registeredOrigin";
import type { StarFrequency } from "@/utils/ephemerisEngine";

const PATH = "/houi/planner";
const TITLE = "吉方位取りプランナー｜これから行ける吉方位の日と行き先";
const DESCRIPTION =
  "本命星と出発地をボタンで選ぶと、日帰り・1〜2泊それぞれで吉方位になる日と、その方位にある市区町村・一宮を一覧にします。方位の吉凶は占い上の目安です。";

const PURPOSE_BUTTON: Record<PlannerPurpose, string> = {
  daytrip: "日帰り（日盤）",
  short_stay: "1〜2泊（月盤＋日盤）",
};
const PURPOSE_SHORT: Record<PlannerPurpose, string> = {
  daytrip: "日帰り",
  short_stay: "1〜2泊",
};
const BOARD_LABELS: Record<string, string> = {
  year: "年盤",
  month: "月盤",
  day: "日盤",
};
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: Props = {}): Promise<Metadata> {
  const query = (await searchParams) ?? {};
  const plain = Object.keys(query).length === 0;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PATH },
    openGraph: pageOpenGraph(PATH, TITLE, DESCRIPTION),
    robots: { index: plain, follow: true },
  };
}

function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}（${WEEKDAYS[weekday]}）`;
}

function longDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日（${WEEKDAYS[weekday]}）`;
}

function choiceClass(selected: boolean): string {
  return selected
    ? "wg-btn-primary min-h-11 justify-center"
    : "wg-chip min-h-11 justify-center underline-offset-2 hover:underline";
}

type Origin = { lat: number; lon: number; name: string };

function resolvePlannerOrigin(
  from: string | undefined,
  registered: Origin | null,
): { origin: Origin; fromKey: string | undefined; registered: boolean } {
  const city = from
    ? CITY_ORIGINS.find((c) => c.slug === from || c.name === from)
    : undefined;
  if (city) return { origin: city, fromKey: city.slug, registered: false };
  const area = from && /^\d{5}$/.test(from) ? findArea(from) : undefined;
  if (area)
    return {
      origin: { lat: area.lat, lon: area.lon, name: area.full },
      fromKey: area.code,
      registered: false,
    };
  if (registered)
    return { origin: registered, fromKey: undefined, registered: true };
  return { origin: TOKYO_ORIGIN, fromKey: undefined, registered: false };
}

export default async function KichihouiPlannerPage({
  searchParams,
}: Props = {}) {
  const query = (await searchParams) ?? {};
  const parsed = parsePlannerQuery(query);
  // 登録プロフィールは personal_cloud_opt_in が true のときだけ返る。
  // 生年月日・座標は画面にもリンクにも出さず、計算にだけ使う。
  const profile = await getRegisteredProfile();
  const resolved = resolvePlannerOrigin(parsed.from, profile?.origin ?? null);

  let star: StarFrequency | null = parsed.star;
  let voidZodiacs: string[] | undefined;
  let starFromProfile = false;
  if (!star && profile?.birthDate) {
    const built = buildBase({
      birthDate: profile.birthDate,
      lon: resolved.origin.lon,
    });
    if (built.ok) {
      star = built.honmei.classical as StarFrequency;
      voidZodiacs = built.voidZodiacs;
      starFromProfile = true;
    }
  }

  const keep = {
    star: parsed.star,
    purpose: parsed.purpose,
    weeks: parsed.weeks,
    from: resolved.fromKey,
  };
  const plan = star
    ? buildKichihouiPlan({
        star,
        voidZodiacs,
        purpose: parsed.purpose,
        origin: resolved.origin,
        start: new Date(),
        weeks: parsed.weeks,
        areas: AREAS,
        spots: await loadPowerSpots(),
      })
    : null;
  const shareUrl = `${SITE_URL}${plannerHref(keep)}`;
  const originName = resolved.registered
    ? "登録した出発地"
    : resolved.origin.name;
  const soonestDir = plan?.soonest
    ? plan.directions.find((d) => d.direction === plan.soonest!.direction)
    : undefined;

  return (
    <main className="wg-page min-h-screen px-4 py-10 text-ink">
      <BreadcrumbJsonLd
        items={[
          { name: HOUI_BREADCRUMB_LABEL, path: "/houi" },
          { name: "吉方位取りプランナー", path: PATH },
        ]}
      />
      <article className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-3">
          <nav aria-label="パンくず" className="text-sm">
            <Link href="/">ホーム</Link> /{" "}
            <Link href="/houi">{HOUI_BREADCRUMB_LABEL}</Link> /
            吉方位取りプランナー
          </nav>
          <h1 className="font-serif text-3xl font-bold">
            吉方位取りプランナー
          </h1>
          <p className="text-sm leading-relaxed">
            本命星・用事・出発地をボタンで選ぶと、これからの期間で吉方位になる日を方位ごとに並べ、その方位にある市区町村と一宮・名勝を添えます。日付ごとにGoogleカレンダーへ追加できます。方位の吉凶は占い上の目安で、効果を保証するものではありません。
          </p>
        </header>

        <section
          aria-labelledby="planner-choices"
          className="wg-card space-y-4 p-4 sm:p-6"
        >
          <h2 id="planner-choices" className="sr-only">
            条件を選ぶ
          </h2>
          <div className="space-y-2">
            <p className="text-sm font-bold">1. 本命星</p>
            {starFromProfile && (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                登録プロフィールから自動で選びました（個人データの利用に同意している場合だけ）。ほかの星を押すと切り替わります。
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {STARS.map((s) => (
                <Link
                  key={s}
                  href={plannerHref({ ...keep, star: s })}
                  aria-current={star === s ? "true" : undefined}
                  className={choiceClass(star === s)}
                >
                  {STAR_NAMES[s]}
                </Link>
              ))}
            </div>
            <Link href="/houi" className="text-xs text-rose-600 underline">
              本命星が分からない方はこちら
            </Link>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold">2. 用事</p>
            <div className="flex flex-wrap gap-2">
              {PLANNER_PURPOSES.map((p) => (
                <Link
                  key={p}
                  href={plannerHref({ ...keep, purpose: p })}
                  aria-current={parsed.purpose === p ? "true" : undefined}
                  className={choiceClass(parsed.purpose === p)}
                >
                  {PURPOSE_BUTTON[p]}
                </Link>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold">3. 出発地</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              いまは「{originName}」から見ています。
            </p>
            <div className="flex flex-wrap gap-2">
              {CITY_ORIGINS.map((c) => (
                <Link
                  key={c.slug}
                  href={plannerHref({ ...keep, from: c.slug })}
                  aria-current={
                    resolved.fromKey === c.slug ? "true" : undefined
                  }
                  className={choiceClass(resolved.fromKey === c.slug)}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold">4. 期間</p>
            <div className="flex flex-wrap gap-2">
              {PLANNER_WEEKS.map((w) => (
                <Link
                  key={w}
                  href={plannerHref({ ...keep, weeks: w })}
                  aria-current={parsed.weeks === w ? "true" : undefined}
                  className={choiceClass(parsed.weeks === w)}
                >
                  これから{w}週
                </Link>
              ))}
            </div>
          </div>
        </section>

        {!plan && (
          <p className="wg-card p-4 text-sm">
            本命星を選ぶと、吉方位になる日と行き先の一覧が出ます。
          </p>
        )}

        {plan && (
          <>
            <section
              aria-labelledby="planner-summary"
              className="wg-card space-y-2 border-2 border-rose-300 p-4 sm:p-6"
            >
              <h2 id="planner-summary" className="text-lg font-bold">
                いちばん近い吉方位取り
              </h2>
              {plan.soonest && soonestDir ? (
                <>
                  <p className="text-xl font-bold text-rose-700 dark:text-rose-300">
                    {longDateLabel(plan.soonest.date)}・{plan.soonest.label}（
                    {PURPOSE_SHORT[plan.purpose]}）
                  </p>
                  {soonestDir.destinations.length > 0 && (
                    <p className="text-sm">
                      行き先の例：
                      {soonestDir.destinations
                        .slice(1, 3)
                        .map((d) => `${d.name}（約${d.distanceKm}km）`)
                        .join("・") ||
                        `${soonestDir.destinations[0].name}（約${soonestDir.destinations[0].distanceKm}km）`}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm">
                  この期間に吉になる日はありませんでした。期間を延ばすか、用事を切り替えてください。
                </p>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {STAR_NAMES[star!]}・{plan.purposeLabel}・{originName}から・
                <time dateTime={plan.from}>{plan.from}</time>〜
                <time dateTime={plan.to}>{plan.to}</time>（日本時間）
              </p>
            </section>

            <section aria-labelledby="planner-directions" className="space-y-3">
              <h2 id="planner-directions" className="text-xl font-bold">
                方位ごとの吉の日と行き先
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {plan.directions.map((d) => (
                  <DirectionCard
                    key={d.direction}
                    d={d}
                    purpose={plan.purpose}
                    shareUrl={shareUrl}
                  />
                ))}
              </div>
            </section>

            <section className="wg-card space-y-2 p-4 text-xs leading-relaxed sm:p-6">
              <h2 className="text-sm font-bold">見方と前提</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  使った盤：
                  {plan.boardsUsed.map((b) => BOARD_LABELS[b] ?? b).join("＋")}
                  。用事の盤がすべて吉の日だけを拾っています（五黄殺・暗剣殺・本命殺・的殺・破などが入る日は出ません）。
                </li>
                <li>
                  方位は真北基準・伝統区分（四正30度・四隅60度）です。出発地から5km未満の街は方位が定まらないので除き、市区町村は150km以内、一宮・名勝は300km以内から近い〜遠いがばらけるように選んでいます。距離で吉凶は変えていません。
                </li>
                <li>
                  {plan.usesTenchusatsu
                    ? "天中殺は登録プロフィールの生年月日から見ています。天中殺に当たる日は弱めとして扱い、禁止にはしていません。"
                    : "生年月日を使っていないので、個人の天中殺と月命星は見ていません。"}
                </li>
                <li>
                  一宮・名勝はWikidata（CC0）の指定をそのまま載せています。効果やご利益は書いていません。
                </li>
                <li>
                  方位の吉凶は占い上の目安で、効果を保証するものではありません。
                </li>
              </ul>
            </section>
          </>
        )}

        <nav aria-label="関連ページ" className="flex flex-wrap gap-3 text-sm">
          <Link href="/houi/today" className="text-rose-600 underline">
            今日の吉方位と時間
          </Link>
          <Link
            href="/houi/relocation-calendar"
            className="text-rose-600 underline"
          >
            引越しできる日の一覧
          </Link>
          <Link href="/calendar" className="text-rose-600 underline">
            日取りカレンダー
          </Link>
        </nav>
      </article>
    </main>
  );
}

function DirectionCard({
  d,
  purpose,
  shareUrl,
}: {
  d: PlannerDirection;
  purpose: PlannerPurpose;
  shareUrl: string;
}) {
  const examples = d.destinations
    .slice(0, 3)
    .map((x) => x.name)
    .join("・");
  return (
    <section
      aria-labelledby={`dir-${d.direction}`}
      className="wg-card min-w-0 space-y-3 p-4"
    >
      <h3
        id={`dir-${d.direction}`}
        className="flex flex-wrap items-baseline gap-2 text-lg font-bold"
      >
        {d.label}
        <span className="text-xs font-normal">吉の日 {d.totalAvailable}日</span>
      </h3>
      {d.days.length === 0 ? (
        <p className="text-sm">この期間に吉になる日はありません。</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {d.days.map((day) => (
            <li key={day.date} className="flex flex-wrap items-center gap-x-2">
              <time dateTime={day.date} className="font-bold">
                {dateLabel(day.date)}
              </time>
              <span className="text-xs">{plainRokuyo(day.rokuyo)}</span>
              {day.tags
                .filter((t) => t !== plainRokuyo(day.rokuyo))
                .slice(0, 2)
                .map((t) => (
                  <span
                    key={t}
                    className="text-xs text-rose-700 dark:text-rose-300"
                  >
                    {t}
                  </span>
                ))}
              {day.inTenchusatsu && (
                <span className="text-xs">天中殺（弱め）</span>
              )}
              <a
                href={googleCalendarUrl({
                  date: day.date,
                  title: `吉方位取り：${d.label}（${PURPOSE_SHORT[purpose]}）`,
                  details: `行き先の例：${examples || "—"}\n${shareUrl}`,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-rose-600 underline"
              >
                カレンダーに追加
              </a>
            </li>
          ))}
          {d.totalAvailable > d.days.length && (
            <li className="text-xs text-slate-600 dark:text-slate-300">
              ほか{d.totalAvailable - d.days.length}日
            </li>
          )}
        </ul>
      )}
      {d.destinations.length > 0 && (
        <div className="text-sm">
          <p className="font-bold">この方位の街</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {d.destinations.map((x) => (
              <li key={x.code}>
                <Link href={`/houi/area/${x.code}`} className="underline">
                  {x.name}
                </Link>
                <span className="text-xs">（約{x.distanceKm}km）</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.spots.length > 0 && (
        <div className="text-sm">
          <p className="font-bold">立ち寄り先（一宮・名勝）</p>
          <ul className="space-y-1">
            {d.spots.map((s) => (
              <li key={s.id}>
                {s.name}
                <span className="text-xs">
                  （{s.basis}・{s.place}・約{s.distanceKm}km）
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
