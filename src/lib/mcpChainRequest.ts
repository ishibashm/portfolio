import { SITE_URL } from "./siteUrl";
/** Originを必須にする。Refererがあればそれも照合し、欠落を埋め合わせない。 */
export function chainRequestError(request: Request): number | undefined {
  try {
    if (request.method !== "POST") return 405;
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== SITE_URL || origin !== SITE_URL)
      return 403;
    const referer = request.headers.get("referer");
    if (referer && new URL(referer).origin !== SITE_URL) return 403;
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
