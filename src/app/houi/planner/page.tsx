import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { DayTierChip } from "@/components/houi/DayTierChip";
import { DirectionCountCompass } from "@/components/houi/DirectionCountCompass";
import { AREAS, findArea } from "@/lib/areaContent";
import { HOUI_BREADCRUMB_LABEL, STAR_NAMES, STARS } from "@/lib/kigakuContent";
import {
  cachedBuildKichihouiPlan,
  googleCalendarUrl,
  parsePlannerQuery,
  plannerHref,
  plannerPeriodInput,
  plannerTierLabel,
  LONG_STAY_TIER_LABELS,
  PLANNER_MONTHS,
  PLANNER_PURPOSES,
  PLANNER_WEEKS,
  layerStatusLabel,
  type PlannerDirection,
  type PlannerMonths,
  type PlannerNoBadDay,
  type PlannerPurpose,
  type PlannerWeeks,
} from "@/lib/kichihouiPlanner";
import { buildBase } from "@/lib/mcpDirections";
import { loadPowerSpots } from "@/lib/powerSpots";
import { plainRokuyo } from "@/lib/rokuyoLabel";
import { pageOpenGraph, SITE_URL } from "@/lib/siteUrl";
import { CITY_ORIGINS, TOKYO_ORIGIN } from "@/lib/todayWeather/origin";
import { getRegisteredProfile } from "@/lib/todayWeather/registeredOrigin";
import { TIER_LABELS, type DayTier } from "@/utils/dayTier";
import type { StarFrequency } from "@/utils/ephemerisEngine";

const PATH = "/houi/planner";
const TITLE = "吉方位取りプランナー｜これから行ける吉方位の日と行き先";
const DESCRIPTION =
  "本命星と出発地をボタンで選ぶと、日帰り・1〜2泊・長期（3泊以上・移転）それぞれで吉方位になる日と、その方位にある市区町村・一宮を一覧にします。方位の吉凶は占い上の目安です。";

const PURPOSE_BUTTON: Record<PlannerPurpose, string> = {
  daytrip: "日帰り（日盤）",
  short_stay: "1〜2泊（月盤＋日盤）",
  long_stay: "長期（3泊以上・移転／年盤＋月盤）",
};
const PURPOSE_SHORT: Record<PlannerPurpose, string> = {
  daytrip: "日帰り",
  short_stay: "1〜2泊",
  long_stay: "長期",
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
    months: parsed.months,
    from: resolved.fromKey,
  };
  const shareUrl = `${SITE_URL}${plannerHref(keep)}`;
  const originName = resolved.registered
    ? "登録した出発地"
    : resolved.origin.name;

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
            本命星・用事・出発地をボタンで選ぶと、これからの期間で吉方位になる日を方位ごとに並べ、その方位にある市区町村と一宮・名勝を添えます。長期は節入り月ごとのまとめと、三盤がそろって吉の出発日を出します。日付ごとにGoogleカレンダーへ追加できます。方位の吉凶は占い上の目安で、効果を保証するものではありません。
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
              {parsed.purpose === "long_stay"
                ? PLANNER_MONTHS.map((m) => (
                    <Link
                      key={m}
                      href={plannerHref({ ...keep, months: m })}
                      aria-current={parsed.months === m ? "true" : undefined}
                      className={choiceClass(parsed.months === m)}
                    >
                      これから{m}か月
                    </Link>
                  ))
                : PLANNER_WEEKS.map((w) => (
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

        {!star && (
          <p className="wg-card p-4 text-sm">
            本命星を選ぶと、吉方位になる日と行き先の一覧が出ます。
          </p>
        )}

        {star && (
          <Suspense fallback={<PlanPending />}>
            <PlanResults
              star={star}
              voidZodiacs={voidZodiacs}
              purpose={parsed.purpose}
              origin={resolved.origin}
              originName={originName}
              weeks={parsed.weeks}
              months={parsed.months}
              shareUrl={shareUrl}
            />
          </Suspense>
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

function PlanPending() {
  return (
    <p role="status" aria-live="polite" className="wg-card p-4 text-sm">
      吉方位の日を計算しています…（長期・12か月は数秒かかることがあります）
    </p>
  );
}

async function PlanResults({
  star,
  voidZodiacs,
  purpose,
  origin,
  originName,
  weeks,
  months,
  shareUrl,
}: {
  star: StarFrequency;
  voidZodiacs: string[] | undefined;
  purpose: PlannerPurpose;
  origin: Origin;
  originName: string;
  weeks: PlannerWeeks;
  months: PlannerMonths;
  shareUrl: string;
}) {
  const plan = cachedBuildKichihouiPlan({
    star,
    voidZodiacs,
    purpose,
    origin,
    start: new Date(),
    ...plannerPeriodInput({ weeks, months }),
    areas: AREAS,
    spots: await loadPowerSpots(),
  });
  const soonestDir = plan.soonest
    ? plan.directions.find((d) => d.direction === plan.soonest!.direction)
    : undefined;

  return (
    <>
      <section
        aria-labelledby="planner-summary"
        className="wg-card space-y-2.5 border border-accent/40 p-5 sm:p-6"
      >
        <p className="text-xs font-semibold tracking-wide text-ink-muted">
          結論
        </p>
        <h2 id="planner-summary" className="text-lg font-bold">
          いちばん近い吉方位取り
        </h2>
        {plan.soonest && soonestDir ? (
          <>
            <p className="text-xl font-bold text-accent sm:text-2xl">
              {longDateLabel(plan.soonest.date)}・{plan.soonest.label}（
              {PURPOSE_SHORT[plan.purpose]}
              {plan.purpose === "long_stay"
                ? plan.soonest.triple
                  ? "・三盤吉の出発日"
                  : "・年盤・月盤が吉の日"
                : ""}
              ）
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
        ) : plan.soonestNoBad ? (
          <>
            <p className="text-xs text-ink-muted">
              すべて吉の日はありませんが、凶の入らない日があります。
            </p>
            <p className="text-xl font-bold text-accent sm:text-2xl">
              {longDateLabel(plan.soonestNoBad.date)}・{plan.soonestNoBad.label}
              （{PURPOSE_SHORT[plan.purpose]}・
              {plannerTierLabel(plan.purpose, plan.soonestNoBad.tier)}）
            </p>
          </>
        ) : plan.purpose === "long_stay" ? (
          <p className="text-sm">
            この期間に、年盤と月盤がともに吉の日はありませんでした。下の方位カードで、節入り月ごとの段階を確認できます。期間を延ばすか、本命星を変えると候補が出ることがあります。
          </p>
        ) : (
          <p className="text-sm">
            この期間に吉になる日はありませんでした。期間を延ばすか、用事を切り替えてください。
          </p>
        )}
        <p className="text-xs text-ink-muted">
          {STAR_NAMES[star]}・{plan.purposeLabel}・{originName}から・
          <time dateTime={plan.from}>{plan.from}</time>〜
          <time dateTime={plan.to}>{plan.to}</time>（日本時間）
        </p>
      </section>

      <section className="wg-card p-4 sm:p-5">
        <DirectionCountCompass
          items={plan.directions.map((d) => ({
            direction: d.direction,
            label: d.label,
            primary: d.totalAvailable,
            secondary: d.noBadAvailable,
          }))}
          primaryName="吉の日"
          secondaryName="凶なし"
          caption="方位ごとの吉の日（件数）"
        />
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
            。用事の盤がすべて吉の日を先に、凶の入らない日（吉が一部の日・平の日）も段階つきで出しています（五黄殺・暗剣殺・本命殺・的殺・破などが入る日は出ません）。
            {plan.purpose === "long_stay" &&
              " 長期の「おすすめの出発日」は、それに加えて日盤も吉の日（三盤吉）です。月ごとの区切りは節入り（既存の月盤の期間）です。"}
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
  const firstTermWithDaysIdx = d.terms.findIndex(
    (t) => t.departureDays.length > 0 || t.noBadDays.length > 0,
  );
  return (
    <section
      aria-labelledby={`dir-${d.direction}`}
      className="wg-card min-w-0 space-y-3.5 p-4 sm:p-5"
    >
      <h3
        id={`dir-${d.direction}`}
        className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg font-bold"
      >
        <span>{d.label}</span>
        <span className="text-xs font-normal text-ink-muted">
          <span className="font-semibold text-theme-good">
            吉の日 {d.totalAvailable}日
          </span>
          {d.noBadAvailable > d.totalAvailable
            ? `／凶なし（一部吉・平を含む） ${d.noBadAvailable}日`
            : ""}
        </span>
      </h3>
      {d.terms.length > 0 ? (
        <ol className="space-y-2.5 text-sm">
          {d.terms.map((term, idx) => (
            <li
              key={`${term.year}-${term.month}`}
              className="space-y-1.5 rounded-xl border border-theme-border bg-theme-subtle/50 p-3"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="font-bold">{term.label}</p>
                <DayTierChip
                  tier={term.tier}
                  label={LONG_STAY_TIER_LABELS[term.tier]}
                />
                <span className="text-xs text-ink-muted">
                  {dateLabel(term.start)}〜{dateLabel(term.end)}
                  {term.available > 0 ? `・とも吉の日 ${term.available}日` : ""}
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                年盤：{layerStatusLabel(term.yearStatus, "year")}／月盤：
                {layerStatusLabel(term.monthStatus, "month")}
              </p>
              {term.departureDays.length > 0 ? (
                <details open={idx === firstTermWithDaysIdx} className="pt-1">
                  <summary className="cursor-pointer text-xs font-bold text-ink">
                    おすすめの出発日（三盤吉）{term.departureDays.length}日
                  </summary>
                  <div className="mt-2">
                    <DayList
                      days={term.departureDays}
                      directionLabel={d.label}
                      purpose={purpose}
                      shareUrl={shareUrl}
                      examples={examples}
                      remaining={0}
                      tierLabel={(tier) => TIER_LABELS[tier]}
                    />
                  </div>
                </details>
              ) : term.noBadDays.length > 0 ? (
                <details open={idx === firstTermWithDaysIdx} className="pt-1">
                  <summary className="cursor-pointer text-xs font-bold text-ink">
                    凶の入らない出発日（三盤で凶なし）{term.noBadAvailable}日
                  </summary>
                  <div className="mt-2">
                    <DayList
                      days={term.noBadDays}
                      directionLabel={d.label}
                      purpose={purpose}
                      shareUrl={shareUrl}
                      examples={examples}
                      remaining={term.noBadAvailable - term.noBadDays.length}
                      tierLabel={(tier) => TIER_LABELS[tier]}
                    />
                  </div>
                </details>
              ) : term.tier === "S" ? (
                <p className="pt-0.5 text-xs text-ink-muted">
                  この節に、三盤がそろって吉の出発日はありません。
                </p>
              ) : null}
            </li>
          ))}
          {d.yearBoardValidUntil && (
            <li className="text-xs text-ink-muted">
              年盤の期限：
              <time dateTime={d.yearBoardValidUntil}>
                {dateLabel(d.yearBoardValidUntil)}
              </time>
              まで（立春で年盤が変わります）
            </li>
          )}
        </ol>
      ) : d.noBadAvailable === 0 ? (
        <p className="text-sm text-ink-muted">
          この期間に、凶の入らない日はありません。
        </p>
      ) : (
        <DayList
          days={d.noBadDays}
          directionLabel={d.label}
          purpose={purpose}
          shareUrl={shareUrl}
          examples={examples}
          remaining={d.noBadAvailable - d.noBadDays.length}
          tierLabel={(tier) => plannerTierLabel(purpose, tier)}
        />
      )}
      {d.destinations.length > 0 && (
        <div className="space-y-1 border-t border-theme-border pt-2.5 text-sm">
          <p className="text-xs font-bold text-ink-muted">この方位の街</p>
          <ul className="flex flex-wrap gap-x-2.5 gap-y-1">
            {d.destinations.map((x) => (
              <li key={x.code}>
                <Link
                  href={`/houi/area/${x.code}`}
                  className="underline hover:text-accent"
                >
                  {x.name}
                </Link>
                <span className="text-xs text-ink-muted">
                  （約{x.distanceKm}km）
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.spots.length > 0 && (
        <div className="space-y-1 border-t border-theme-border pt-2.5 text-sm">
          <p className="text-xs font-bold text-ink-muted">
            立ち寄り先（一宮・名勝）
          </p>
          <ul className="space-y-0.5">
            {d.spots.map((s) => (
              <li key={s.id}>
                {s.name}
                <span className="text-xs text-ink-muted">
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

function DayListItem({
  day,
  directionLabel,
  purpose,
  shareUrl,
  examples,
  tierLabel,
}: {
  day: Pick<
    PlannerNoBadDay,
    "date" | "tier" | "rokuyo" | "tags" | "inTenchusatsu"
  >;
  directionLabel: string;
  purpose: PlannerPurpose;
  shareUrl: string;
  examples: string;
  tierLabel?: (tier: DayTier) => string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <time dateTime={day.date} className="font-bold">
        {dateLabel(day.date)}
      </time>
      {tierLabel && <DayTierChip tier={day.tier} label={tierLabel(day.tier)} />}
      <span className="text-xs text-ink-muted">{plainRokuyo(day.rokuyo)}</span>
      {day.tags
        .filter((t) => t !== plainRokuyo(day.rokuyo))
        .slice(0, 2)
        .map((t) => (
          <span key={t} className="text-xs font-medium text-accent">
            {t}
          </span>
        ))}
      {day.inTenchusatsu && (
        <span className="text-xs text-theme-gold">天中殺（弱め）</span>
      )}
      <a
        href={googleCalendarUrl({
          date: day.date,
          title: `吉方位取り：${directionLabel}（${PURPOSE_SHORT[purpose]}）`,
          details: `行き先の例：${examples || "—"}\n${shareUrl}`,
        })}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto text-xs text-ink-muted underline hover:text-accent"
      >
        カレンダーに追加
      </a>
    </li>
  );
}

function DayList({
  days,
  directionLabel,
  purpose,
  shareUrl,
  examples,
  remaining,
  tierLabel,
}: {
  days: readonly Pick<
    PlannerNoBadDay,
    "date" | "tier" | "rokuyo" | "tags" | "inTenchusatsu"
  >[];
  directionLabel: string;
  purpose: PlannerPurpose;
  shareUrl: string;
  examples: string;
  remaining: number;
  tierLabel?: (tier: DayTier) => string;
}) {
  const head = days.slice(0, 4);
  const rest = days.slice(4);
  return (
    <div className="space-y-1.5 text-sm">
      <ul className="space-y-1.5">
        {head.map((day) => (
          <DayListItem
            key={day.date}
            day={day}
            directionLabel={directionLabel}
            purpose={purpose}
            shareUrl={shareUrl}
            examples={examples}
            tierLabel={tierLabel}
          />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="pt-0.5">
          <summary className="cursor-pointer text-xs font-semibold text-ink-muted hover:text-ink">
            ほか{rest.length}日を表示
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {rest.map((day) => (
              <DayListItem
                key={day.date}
                day={day}
                directionLabel={directionLabel}
                purpose={purpose}
                shareUrl={shareUrl}
                examples={examples}
                tierLabel={tierLabel}
              />
            ))}
          </ul>
        </details>
      )}
      {remaining > 0 && (
        <p className="text-xs text-ink-muted">
          このほか{remaining}日は
          <Link href="/calendar" className="underline hover:text-accent">
            日取りカレンダー
          </Link>
          で
        </p>
      )}
    </div>
  );
}
