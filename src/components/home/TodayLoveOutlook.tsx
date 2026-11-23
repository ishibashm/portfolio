import Link from "next/link";
import type { LoveFortuneItem } from "@/lib/loveFortune";

import { DIRECTION_LABELS, type CompassDirection } from "@/utils/directionGeo";

const STAR_MONOGRAMS = "一二三四五六七八九";

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
        <circle r="12" />
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

export function TodayLoveOutlook({ items }: { items: LoveFortuneItem[] }) {
  const luckyItems = items.filter(({ luckyHints }) => luckyHints.length > 0);
  const firstAction = luckyItems[0]?.action;
  const sharedAction =
    firstAction && luckyItems.every(({ action }) => action === firstAction)
      ? firstAction
      : undefined;

  return (
    <section
      aria-labelledby="today-love-heading"
      className="@container overflow-hidden rounded-lg border border-theme-border border-t-2 border-t-theme-gold bg-background text-ink"
    >
      <header className="border-b border-theme-gold px-4 pt-4 pb-[3px]">
        <div className="space-y-2 border-b-2 border-accent pb-3">
          <p
            aria-hidden="true"
            className="font-sans text-[0.625rem] font-semibold tracking-[0.24em] text-theme-gold"
          >
            DAILY HOROSCOPE
          </p>
          <h3
            id="today-love-heading"
            className="font-shippori flex items-center gap-2 text-xl font-semibold tracking-wider text-accent"
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
        <p className="mt-2 flex items-center gap-2 border-y border-theme-border bg-theme-gold-soft px-4 py-1.5 text-xs leading-relaxed">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rotate-45 bg-current text-theme-gold"
          />
          吉方位ありの目安：{sharedAction}
        </p>
      )}
      <ul className="grid grid-cols-1 @max-[52rem]:divide-y @max-[52rem]:divide-theme-border @min-[52rem]:grid-cols-3 @min-[52rem]:gap-px @min-[52rem]:bg-theme-border">
        {items.map(
          ({ star, name, href, sitting, sittingKind, luckyHints, action }) => {
            const hasLucky = luckyHints.length > 0;
            const showCaution = !hasLucky && sittingKind === "commonUnlucky";

            return (
              <li
                key={star}
                className="group space-y-2 bg-background px-4 py-3"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="font-shippori grid size-8 shrink-0 place-items-center rounded-full border border-theme-gold text-base leading-none text-theme-gold"
                  >
                    {STAR_MONOGRAMS[star - 1]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={href}
                      className="font-shippori text-base font-semibold tracking-wide text-accent underline underline-offset-2"
                    >
                      {name}
                    </Link>
                    <p className="text-xs text-ink-muted">{sitting}に回座</p>
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
                    className="grid grid-cols-2 gap-x-2 gap-y-1"
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
    </section>
  );
}
