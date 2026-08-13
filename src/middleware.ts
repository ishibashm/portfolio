import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Sub-app subdomains are served by rewriting onto an internal path.
 *
 * The auth check MUST run against the rewritten path, not the raw one. Checking
 * the raw pathname meant `tech.cloud-palette.com/` arrived as "/", which is not
 * in PROTECTED_ROUTE_PREFIXES, so updateSession let it through and the rewrite
 * then served the sub-app to anonymous visitors. Equally, a rewrite must never
 * be applied on top of a redirect updateSession issued, or the login redirect is
 * silently discarded.
 */
// 振り先だった /metaphysical と /trends を削除したため、割り当ては空。
// fortune. / tech. のホストで来ても、書き換えずに通常のサイトを出す。
const SUBDOMAIN_APPS: {
  prefix: string;
  base: string;
  passthrough: readonly string[];
}[] = [];

// Auth surfaces are shared by every host, so they must never be rewritten into a
// sub-app namespace — otherwise the redirect to /login lands on /trends/login.
// The usage guide is the same document on every host for the same reason: under
// `fortune.` it would otherwise resolve to /metaphysical/guide and 404.
const HOST_NEUTRAL_PREFIXES = ["/login", "/auth", "/guide", "/blog"];

function resolveSubdomainPath(host: string, pathname: string): string | null {
  const app = SUBDOMAIN_APPS.find(
    (a) => host.startsWith(a.prefix) || host.includes(`${a.prefix}cloud-palette.com`),
  );
  if (!app) return null;

  const alreadyScoped = app.passthrough.some((p) => pathname.startsWith(p));
  if (alreadyScoped) return null;
  if (HOST_NEUTRAL_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return `${app.base}${pathname === "/" ? "" : pathname}`;
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  const forwardedHost = request.headers.get("x-forwarded-host") || "";
  const directHost = request.headers.get("host") || "";
  const host = (forwardedHost || directHost).toLowerCase();

  // Static assets and API routes are neither rewritten nor gated here.
  const isInternal =
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/favicon") ||
    url.pathname === "/manifest.json";

  if (isInternal) {
    return updateSession(request, url.pathname);
  }

  const rewritePath = resolveSubdomainPath(host, url.pathname);

  // Gate on the path that will actually be rendered.
  const res = await updateSession(request, rewritePath ?? url.pathname);

  // A 3xx here is the login / unauthorized redirect. Return it untouched.
  if (res.status >= 300 && res.status < 400) {
    return res;
  }

  if (rewritePath) {
    url.pathname = rewritePath;
    return NextResponse.rewrite(url, { headers: res.headers });
  }

  return res;
}

export const config = {
  /**
   * 検索エンジンが読む静的ファイルを middleware から外す。
   *
   * 外していないと、`/sitemap.xml` を取りに来ただけで updateSession が
   * 走り、**1 回ごとに Supabase の getUser() へネットワーク往復**が入る。
   * 認証が要らない公開ファイルなのに、Supabase が遅い・落ちているときは
   * そのまま取得の失敗になる。Search Console は sitemap.xml と
   * sitemap.rss を「取得できませんでした」として記録していた。
   *
   * ここに並べるのは「誰が来ても同じ内容を返す公開ファイル」だけ。
   * ページはこれまでどおり通す（ログインの判定が要るため）。
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap|robots\\.txt|ads\\.txt|llms|blog/feed\\.xml|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
