"use client";

import { usePathname } from "next/navigation";
import { AffiliatePageTop } from "@/components/ads/AffiliateLink";

/** 広告頁の上部。案件が空のときは layout 側で描かない。 */
export function AffiliatePageTopClient() {
  return <AffiliatePageTop pathname={usePathname() ?? "/"} />;
}
