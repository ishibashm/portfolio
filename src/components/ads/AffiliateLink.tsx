import type { ReactNode } from "react";
import {
  AFFILIATE_OFFERS,
  isAffiliatePage,
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
export function AffiliateHtml({ html }: { html: string }) {
  return (
    <div>
      {prLabel}
      <div dangerouslySetInnerHTML={{ __html: sponsorizeAnchors(html) }} />
    </div>
  );
}

function visibleOffers(offers: readonly AffiliateOffer[]): AffiliateOffer[] {
  return offers.filter((offer) => offer.html || offer.href);
}

/**
 * 案件が 1 件も無ければ何も描かない。
 * あるときだけ、頁の上部に開示文と PR 付きのリンクを出す。
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
 * 広告を置く頁の上部。案件設定が空なら何も出さない。
 * パスはサーバでは分からないので、呼ぶ側が渡す。
 */
export function AffiliatePageTop({ pathname }: { pathname: string }) {
  if (!isAffiliatePage(pathname)) return null;
  return <AffiliateOffers offers={AFFILIATE_OFFERS} />;
}
