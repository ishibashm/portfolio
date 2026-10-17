import { emailLoginEnabled } from "@/lib/authMethods";

/** ログイン画面が使える方法。秘密は返さない（有無だけ）。 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { google: true, email: emailLoginEnabled() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
