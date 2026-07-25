import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  // First, update Supabase auth session
  const res = await updateSession(request);

  const forwardedHost = request.headers.get("x-forwarded-host") || "";
  const directHost = request.headers.get("host") || "";
  const host = (forwardedHost || directHost).toLowerCase();

  const url = request.nextUrl.clone();

  // Exclude static assets and API routes from subdomain rewriting
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/favicon") ||
    url.pathname === "/manifest.json"
  ) {
    return res;
  }

  // 1. Fortune & Healing Sub-App (fortune.cloud-palette.com -> Metaphysical / Fortune Engine)
  if (host.includes("fortune.cloud-palette.com") || host.startsWith("fortune.")) {
    if (!url.pathname.startsWith("/metaphysical") && !url.pathname.startsWith("/fortune")) {
      url.pathname = `/metaphysical${url.pathname === "/" ? "" : url.pathname}`;
      return NextResponse.rewrite(url, { headers: res.headers });
    }
  }

  // 2. Tech & AI Trends Sub-App (tech.cloud-palette.com -> Quant Finance & Trends)
  if (host.includes("tech.cloud-palette.com") || host.startsWith("tech.")) {
    if (!url.pathname.startsWith("/trends") && !url.pathname.startsWith("/research") && !url.pathname.startsWith("/tech")) {
      url.pathname = `/trends${url.pathname === "/" ? "" : url.pathname}`;
      return NextResponse.rewrite(url, { headers: res.headers });
    }
  }

  // 3. Katmer Knowledge Base & Brain Sub-App (brain.cloud-palette.com -> Knowledge & Spatial Intelligence)
  if (host.includes("brain.cloud-palette.com") || host.startsWith("brain.")) {
    if (!url.pathname.startsWith("/knowledge") && !url.pathname.startsWith("/brain")) {
      url.pathname = `/knowledge${url.pathname === "/" ? "" : url.pathname}`;
      return NextResponse.rewrite(url, { headers: res.headers });
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
