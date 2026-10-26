import { NextResponse } from "next/server";
import {
  luckyAreasForCode,
  parseDirections,
} from "@/lib/relocationStepNavigator";

/**
 * 出発地から見て吉方位にある市区町村と家賃の写し（静的データのみ。DB は引かない）。
 * GET /api/houi/lucky-areas?origin=13104&dirs=N,SE
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin") ?? "";
  const dirs = parseDirections(searchParams.get("dirs"));
  if (!/^\d{5}$/.test(origin) || dirs.length === 0) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "origin と dirs が必要です。" },
      { status: 400 },
    );
  }
  const areas = luckyAreasForCode(origin, dirs);
  if (!areas) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "出発地が見つかりません。" },
      { status: 404 },
    );
  }
  return NextResponse.json(
    { areas },
    { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
}
