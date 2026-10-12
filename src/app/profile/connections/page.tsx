import { notFound } from "next/navigation";

// There is no personal response to cache: this is a static, unconditional 404.
// Next's notFound boundary supplies noindex; next-sitemap omits notFoundRoutes.
export const dynamic = "force-static";

/** Release gate: do not import the panel, cookies, services, or database here.
 * A configuration flag alone must never expose personal data before PR 20.
 * See docs/mcp-connections-release.md for the pending composition and checks. */
export default function Page() {
  notFound();
}
