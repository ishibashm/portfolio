import type { ReactNode } from "react";
import {
  AFFILIATE_AREA_LABEL,
  disclosureText,
  hasAffiliateOffer,
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
 * 頁への自動掲載には使わない（AffiliatePageTop と AffiliatePlacement を使う）。
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
 * 対象頁の先頭（ファーストビュー）に出す開示文。広告リンク自体は置かない。
 * 広告枠は本文中または県ページの独立枠（AffiliatePlacement）に出す。
 */
export function AffiliatePageTop({ pathname }: { pathname: string }) {
  if (!hasAffiliateOffer(pathname)) return null;
  return (
    <aside
      aria-label="広告の表示"
      className="mx-auto max-w-[1700px] px-5 pt-4 text-sm leading-7 text-slate-700"
    >
      <p>{disclosureText(pathname)}</p>
    </aside>
  );
}

/**
 * 広告枠。直前に「PR（広告）」と対象地域を出し、素材のリンクを置く。
 * 料金や順位の断定は書かない。
 */
export function AffiliatePlacement({
  offer,
  intro,
  showBanner = false,
}: {
  offer: AffiliateOffer;
  intro?: string;
  showBanner?: boolean;
}) {
  if (!offer.html && !offer.href) return null;
  return (
    <aside
      aria-label="広告"
      className="my-8 rounded-2xl border border-stone-300 bg-stone-50 px-5 py-4 text-sm leading-7 text-slate-700"
    >
      <p className="text-xs font-bold tracking-wide text-stone-700">
        PR（広告）
      </p>
      <p className="mt-1 text-xs font-medium text-stone-600">
        {AFFILIATE_AREA_LABEL}
      </p>
      {intro ? <p className="mt-3 text-[15px] leading-7">{intro}</p> : null}
      {offer.html ? (
        <div className="mt-3">
          <AffiliateHtml html={offer.html} showLabel={false} />
        </div>
      ) : (
        <p className="mt-3">
          <a
            href={offer.href}
            target="_blank"
            rel="sponsored nofollow noopener"
          >
            {offer.label ?? offer.href}
          </a>
        </p>
      )}
      {showBanner && offer.bannerHtml ? (
        <div className="mt-3">
          <AffiliateHtml html={offer.bannerHtml} showLabel={false} />
        </div>
      ) : null}
    </aside>
  );
}
