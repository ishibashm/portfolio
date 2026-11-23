import Link from "next/link";
import type { LoveFortuneItem } from "@/lib/loveFortune";

export function TodayLoveOutlook({ items }: { items: LoveFortuneItem[] }) {
  return (
    <section
      aria-labelledby="today-love-heading"
      className="overflow-hidden rounded-xl border border-theme-border bg-background text-ink"
    >
      <header className="space-y-2 border-b border-theme-border bg-theme-accent-soft px-3 py-3">
        <h3
          id="today-love-heading"
          className="flex items-center gap-2 text-base font-bold text-accent"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="size-6 shrink-0 rounded-full bg-theme-gold-soft p-1 text-theme-gold"
            fill="none"
          >
            <circle
              cx="10"
              cy="10"
              r="8.5"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="M10 1.8v2.2M10 16v2.2M1.8 10H4M16 10h2.2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M10 13.8s-3.6-2.2-3.6-4.7a2.1 2.1 0 0 1 3.6-1.45A2.1 2.1 0 0 1 13.6 9.1c0 2.5-3.6 4.7-3.6 4.7Z"
              fill="currentColor"
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
      </header>
      <ul className="divide-y divide-theme-border">
        {items.map(
          ({ star, name, href, sitting, sittingKind, luckyHints, action }) => (
            <li
              key={star}
              className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-2 px-3 py-2"
            >
              <div>
                <Link
                  href={href}
                  className="text-sm font-semibold text-accent underline underline-offset-2"
                >
                  {name}
                </Link>
                <p className="text-xs text-ink-muted">{sitting}に回座</p>
              </div>
              <div className="space-y-1">
                {luckyHints.length ? (
                  <ul
                    aria-label="吉方位"
                    className="flex flex-wrap gap-x-2 gap-y-1"
                  >
                    {luckyHints.map(({ direction, label, hint }) => (
                      <li key={direction} className="flex flex-col items-start">
                        <span className="rounded-md bg-theme-good-soft px-2 py-0.5 text-base font-bold leading-tight text-theme-good">
                          {label}
                        </span>
                        <span className="text-xs text-ink-muted">{hint}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-base font-bold text-accent">近場が目安</p>
                )}
                <p className="text-xs leading-relaxed text-ink-muted">
                  {!luckyHints.length && sittingKind === "commonUnlucky" ? (
                    <span className="rounded bg-theme-bad-soft px-1 text-theme-bad">
                      {action}
                    </span>
                  ) : (
                    action
                  )}
                </p>
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
