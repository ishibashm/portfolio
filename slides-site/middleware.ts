import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const password = process.env.SLIDES_PASSWORD;

  if (!password) {
    return new NextResponse("SLIDES_PASSWORD not configured", {
      status: 500,
    });
  }

  const authCookie = request.cookies.get("slides-auth");

  if (authCookie?.value === password) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader) {
    const base64Credentials = authHeader.split(" ")[1];
    const credentials = Buffer.from(base64Credentials, "base64").toString(
      "utf-8"
    );
    const [, submittedPassword] = credentials.split(":");

    if (submittedPassword === password) {
      const response = NextResponse.next();
      response.cookies.set("slides-auth", password, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24,
      });
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      return response;
    }
  }

  return new NextResponse("認証が必要です", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Slides Viewer"',
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const config = {
  matcher: "/:path*",
};
