import type { ReactNode } from "react";
import {
  AFFILIATE_AREA_LABEL,
  type AffiliateOffer,
} from "@/lib/affiliateOffers";
import { sponsorizeAnchors } from "@/lib/affiliateHtml";

const prLabel = (
  <span className="mr-1 inline-block rounded bg-stone-200 px-1.5 py-0.5 align-middle text-[10px] font-bold tracking-wide text-stone-700">
    PR
  </span>
);

/** 広告リンク。案件の href から描く。 */
export function AffiliateLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="sponsored nofollow noopener">
      {prLabel}
      {children}
    </a>
  );
}

/** ASP の HTML を差し込む。アンカーには広告用の rel と target を付ける。 */
export function AffiliateHtml({
  html,
  showLabel = true,
}: {
  html: string;
  showLabel?: boolean;
}) {
  return (
    <div>
      {showLabel ? prLabel : null}
      <div dangerouslySetInnerHTML={{ __html: sponsorizeAnchors(html) }} />
    </div>
  );
}

function visibleOffers(offers: readonly AffiliateOffer[]): AffiliateOffer[] {
  return offers.filter((offer) => offer.html || offer.href);
}

/**
 * 渡された案件を開示文と一緒に描く。呼び出し側が出し先を決める。
 * 頁への自動掲載には使わない（AffiliatePlacement を使う）。
 */
export function AffiliateOffers({
  offers,
}: {
  offers: readonly AffiliateOffer[];
}) {
  const visible = visibleOffers(offers);
  if (visible.length === 0) return null;
  return (
    <aside
      aria-label="プロモーション"
      className="mx-auto max-w-[1700px] px-5 pt-4 text-sm leading-7 text-slate-700"
    >
      <p>本ページはプロモーションを含みます</p>
      <ul className="mt-2 space-y-2">
        {visible.map((offer) => (
          <li key={offer.id}>
            {offer.html ? (
              <AffiliateHtml html={offer.html} />
            ) : (
              <AffiliateLink href={offer.href ?? ""}>
                {offer.label ?? offer.href}
              </AffiliateLink>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * 頁先頭の開示文は出さない。広告であることは枠上の「広告」ラベルで示す。
 */
export function AffiliatePageTop({ pathname }: { pathname: string }) {
  void pathname;
  return null;
}

/**
 * サイトの AdBanner と同じ器（幅いっぱい・上下の余白だけ）。
 * 専用の見出しや囲みは付けず、小さな「広告」ラベルと対象地域の注記だけを置く。
 */
export function AffiliatePlacement({
  offer,
  className = "",
}: {
  offer: AffiliateOffer;
  className?: string;
}) {
  if (!offer.html && !offer.href) return null;
  return (
    <div
      aria-label="スポンサー広告"
      className={`my-4 w-full overflow-hidden ${className}`}
    >
      <p className="mb-1 text-xs leading-4 text-slate-500">広告</p>
      {offer.html ? (
        <div
          className="text-[13px] leading-6 text-slate-700 [&_a]:text-slate-700 [&_a]:underline [&_a]:decoration-slate-300 [&_a]:underline-offset-2 hover:[&_a]:text-slate-900 [&_img]:align-top"
          dangerouslySetInnerHTML={{ __html: sponsorizeAnchors(offer.html) }}
        />
      ) : (
        <a
          href={offer.href}
          target="_blank"
          rel="sponsored nofollow noopener"
          className="text-[13px] leading-6 text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
        >
          {offer.label ?? offer.href}
        </a>
      )}
      <p className="mt-1 text-xs leading-4 text-slate-500">
        {AFFILIATE_AREA_LABEL}
      </p>
    </div>
  );
}
