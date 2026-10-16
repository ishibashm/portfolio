import { SITE_URL } from "./siteUrl";

/** 開発時だけ、自分の localhost も同じサイトとして扱う。本番は公開URLだけ。 */
function allowedOrigin(request: Request): string {
  if (process.env.NODE_ENV !== "development") return SITE_URL;
  const url = new URL(request.url);
  return ["localhost", "127.0.0.1"].includes(url.hostname)
    ? url.origin
    : SITE_URL;
}
/** Originを必須にする。Refererがあればそれも照合し、欠落を埋め合わせない。 */
export function chainRequestError(request: Request): number | undefined {
  try {
    if (request.method !== "POST") return 405;
    const allowed = allowedOrigin(request);
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== allowed || origin !== allowed)
      return 403;
    const referer = request.headers.get("referer");
    if (referer && new URL(referer).origin !== allowed) return 403;
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin") return 403;
  } catch {
    return 403;
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return 415;
}
