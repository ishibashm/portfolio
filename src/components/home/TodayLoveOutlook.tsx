import Link from "next/link";
import { TodayLoveOutlookPlate } from "@/components/home/TodayLoveOutlookPlate";
import { STAR_NAMES } from "@/lib/kigakuContent";
import type { LoveFortune, LoveFortuneItem } from "@/lib/loveFortune";
import { formatJapaneseDate } from "@/lib/reminderText";

import { DIRECTION_LABELS, type CompassDirection } from "@/utils/directionGeo";

const ELEMENT_PATHS = {
  water: [
    "M2 14c3-3 5-3 8 0s5 3 8 0",
    "M2 17c3-3 5-3 8 0s5 3 8 0",
    "M10 2C9 4 7.5 5.5 7.5 7a2.5 2.5 0 0 0 5 0C12.5 5.5 11 4 10 2Z",
  ],
  earth: ["M2 14l5-6 5 6", "m9 10 4-5 5 9", "M2 17h16"],
  wood: [
    "M10 18V9",
    "M10 13C5 13 3 10 3 6c4 0 7 2 7 7Z",
    "M10 10c0-5 3-7 7-8 0 4-2 8-7 8Z",
  ],
  metal: [
    "M10 2l2.5 5.5L18 10l-5.5 2.5L10 18l-2.5-5.5L2 10l5.5-2.5Z",
    "M8 10l2-2 2 2-2 2Z",
  ],
  fire: [
    "M10 2c1 4 5.5 6 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2 1-4 2.5-5.5 0 2 1 2.5 1 2.5C9.5 7.5 10 4.5 10 2Z",
    "M10 12c1 1.5 2 2.2 2 3.5a2 2 0 0 1-4 0c0-1.3 1-2 2-3.5Z",
  ],
};

const STAR_ELEMENTS: Record<number, keyof typeof ELEMENT_PATHS> = {
  1: "water",
  2: "earth",
  3: "wood",
  4: "wood",
  5: "earth",
  6: "metal",
  7: "metal",
  8: "earth",
  9: "fire",
};

const FRAME_CORNERS = [
  "top-1 left-1",
  "top-1 right-1 rotate-90",
  "right-1 bottom-1 rotate-180",
  "bottom-1 left-1 -rotate-90",
];

function ElementMedallion({ star }: { star: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full border border-theme-gold text-theme-gold"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ELEMENT_PATHS[STAR_ELEMENTS[star]]?.map((path) => (
          <path key={path} d={path} />
        ))}
      </svg>
    </span>
  );
}

const COMPASS_POINTS = {
  N: [0, -12],
  NE: [8.5, -8.5],
  E: [12, 0],
  SE: [8.5, 8.5],
  S: [0, 12],
  SW: [-8.5, 8.5],
  W: [-12, 0],
  NW: [-8.5, -8.5],
  CENTER: [0, 0],
} satisfies Record<CompassDirection | "CENTER", [number, number]>;

const SITTING_DIRECTIONS = new Map<string, CompassDirection | "CENTER">(
  Object.entries(DIRECTION_LABELS).map(([direction, label]) => [
    label,
    direction as CompassDirection,
  ]),
).set("中宮", "CENTER");

function MiniCompass({
  luckyHints,
  sitting,
  showCaution,
}: Pick<LoveFortuneItem, "luckyHints" | "sitting"> & { showCaution: boolean }) {
  const sittingDirection = SITTING_DIRECTIONS.get(sitting);
  const sittingPoint = sittingDirection && COMPASS_POINTS[sittingDirection];

  return (
    <svg
      aria-hidden="true"
      viewBox="-18 -18 36 36"
      className="size-8 shrink-0 motion-safe:transition-transform motion-safe:group-hover:scale-105 motion-safe:group-focus-within:scale-105 motion-reduce:transition-none"
      fill="none"
    >
      <g className="stroke-theme-border" strokeWidth="0.8">
        <circle r="12" className="stroke-theme-gold/40" />
        <path d="M-12 0h24M0 -12v24" />
      </g>
      <path d="M0 -18l2 3.5h-4Z" className="fill-current text-theme-gold" />
      <g className="fill-current text-theme-good">
        {luckyHints.map(({ direction }) => {
          const [x, y] = COMPASS_POINTS[direction];
          return <circle key={direction} cx={x} cy={y} r="1.8" />;
        })}
      </g>
      {sittingPoint && (
        <circle
          cx={sittingPoint[0] * 0.65}
          cy={sittingPoint[1] * 0.65}
          r="2"
          className={`fill-current ${showCaution ? "text-theme-bad" : "text-accent"}`}
        />
      )}
    </svg>
  );
}

export function TodayLoveOutlook({
  items,
  date,
  center,
}: Pick<LoveFortune, "items" | "date" | "center">) {
  const counts = items.map(({ luckyHints }) => luckyHints.length);
  const maxLuckyCount = Math.max(...counts);
  const hasDifferentCounts = counts.some((count) => count !== maxLuckyCount);
  const luckyItems = items.filter(({ luckyHints }) => luckyHints.length > 0);
  const firstAction = luckyItems[0]?.action;
  const sharedAction =
    firstAction && luckyItems.every(({ action }) => action === firstAction)
      ? firstAction
      : undefined;

  return (
    <section
      aria-labelledby="today-love-heading"
      className="@container relative overflow-hidden rounded-lg border border-theme-border border-t-2 border-t-theme-gold bg-background text-ink [--paper-grain:2%] [--paper-tint:4%] supports-[color:color-mix(in_oklab,black,transparent)]:[background-image:linear-gradient(to_bottom,color-mix(in_oklab,var(--wg-gold)_var(--paper-tint),transparent),transparent_16rem),repeating-linear-gradient(0deg,color-mix(in_oklab,var(--wg-gold)_var(--paper-grain),transparent)_0_1px,transparent_1px_4px)] dark:[--paper-grain:1%] dark:[--paper-tint:2%]"
    >
      {FRAME_CORNERS.map((position) => (
        <svg
          key={position}
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`pointer-events-none absolute size-3 text-theme-gold ${position}`}
          fill="none"
          stroke="currentColor"
        >
          <path d="M.5 12V.5H12" />
        </svg>
      ))}
      <header className="border-b border-theme-gold pb-[3px]">
        <div className="grid gap-1 border-b border-theme-gold/40 px-4 pt-4 pb-2 @min-[52rem]:grid-cols-2 @min-[52rem]:items-center">
          <p
            aria-hidden="true"
            className="font-sans text-[0.625rem] font-semibold tracking-[0.24em] text-theme-gold"
          >
            DAILY HOROSCOPE
          </p>
          <p className="flex flex-wrap gap-x-3 text-xs text-ink-muted @min-[52rem]:justify-between">
            <time dateTime={date}>{formatJapaneseDate(date)}</time>
            <span>中宮　{STAR_NAMES[center]}</span>
          </p>
        </div>
        <TodayLoveOutlookPlate />
        <div className="grid gap-2 border-b-2 border-accent px-4 pt-3 pb-3 @min-[52rem]:grid-cols-[1fr_auto] @min-[52rem]:items-end">
          <div className="space-y-2">
            <h3
              id="today-love-heading"
              className="font-shippori flex items-center gap-2 text-xl font-semibold tracking-wider text-accent @min-[52rem]:text-2xl"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="size-4 shrink-0 text-theme-gold"
                fill="none"
              >
                <circle
                  cx="10"
                  cy="10"
                  r="8.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M10 1.8v2.2M10 16v2.2M1.8 10H4M16 10h2.2"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <path
                  d="M10 13.8s-3.6-2.2-3.6-4.7a2.1 2.1 0 0 1 3.6-1.45A2.1 2.1 0 0 1 13.6 9.1c0 2.5-3.6 4.7-3.6 4.7Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
              今日の恋愛の目安
            </h3>
            <p className="text-xs leading-relaxed text-ink-muted">
              本命星別の、占い上の参考です。的中や成果を保証しません。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-accent">
            <a
              href="#today-hours-heading"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="10" cy="10" r="7.5" />
                <path d="M10 5.5V10l3 2" strokeLinecap="round" />
              </svg>
              時間帯は下の今の刻
            </a>
            <Link
              href="/houi#honmei-lookup"
              className="underline underline-offset-2"
            >
              本命星の早見
            </Link>
          </div>
        </div>
      </header>
      {sharedAction && (
        <p className="flex items-center gap-2 border-b border-theme-border bg-theme-gold-soft px-4 py-1.5 text-xs leading-relaxed">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rotate-45 bg-current text-theme-gold"
          />
          吉方位ありの目安：{sharedAction}
        </p>
      )}
      <ul className="grid grid-cols-1 @max-[52rem]:divide-y @max-[52rem]:divide-theme-border @min-[52rem]:grid-cols-3">
        {items.map(
          ({ star, name, href, sitting, sittingKind, luckyHints, action }) => {
            const hasLucky = luckyHints.length > 0;
            const showCaution = !hasLucky && sittingKind === "commonUnlucky";

            return (
              <li
                key={star}
                className="motion-reveal group space-y-2 px-4 py-3 @min-[52rem]:nth-[n+4]:border-t @min-[52rem]:not-nth-[3n+1]:border-l @min-[52rem]:border-theme-border"
                style={{ ["--i" as string]: star - 1 }}
              >
                <div className="flex items-center gap-2.5">
                  <ElementMedallion star={star} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={href}
                      className="font-shippori text-base font-semibold tracking-wide text-accent underline decoration-accent/45 decoration-1 underline-offset-4"
                    >
                      {name}
                    </Link>
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-muted">
                      <span>{sitting}に回座</span>
                      {hasDifferentCounts &&
                        luckyHints.length === maxLuckyCount && (
                          <span className="inline-flex items-center gap-1 rounded-sm border border-theme-gold bg-theme-gold-soft px-1 py-0.5 text-[0.625rem] leading-tight text-ink">
                            <span
                              aria-hidden="true"
                              className="size-1 shrink-0 rotate-45 bg-theme-gold"
                            />
                            今日吉方位が多い星
                          </span>
                        )}
                    </p>
                  </div>
                  <MiniCompass
                    luckyHints={luckyHints}
                    sitting={sitting}
                    showCaution={showCaution}
                  />
                </div>
                {hasLucky ? (
                  <ul
                    aria-label="吉方位"
                    className="grid grid-cols-2 gap-x-2 gap-y-1.5"
                  >
                    {luckyHints.map(({ direction, label, hint }) => (
                      <li key={direction} className="flex flex-col items-start">
                        <span className="rounded-sm bg-theme-good-soft px-2 py-0.5 text-base font-bold leading-tight text-theme-good">
                          {label}
                        </span>
                        <span className="text-xs text-ink-muted">{hint}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-base font-bold text-accent">近場が目安</p>
                )}
                {(!hasLucky || !sharedAction) && (
                  <p className="text-xs leading-relaxed text-ink-muted">
                    {showCaution ? (
                      <span className="rounded-full bg-theme-bad-soft px-2 py-0.5 text-theme-bad">
                        {action}
                      </span>
                    ) : (
                      action
                    )}
                  </p>
                )}
              </li>
            );
          },
        )}
      </ul>
      <div
        aria-hidden="true"
        className="flex h-5 items-center justify-center gap-2 px-8"
      >
        <span className="h-px max-w-24 flex-1 bg-linear-to-r from-transparent to-theme-gold/60" />
        <span className="size-1.5 rotate-45 bg-theme-gold" />
        <span className="h-px max-w-24 flex-1 bg-linear-to-l from-transparent to-theme-gold/60" />
      </div>
    </section>
  );
}
