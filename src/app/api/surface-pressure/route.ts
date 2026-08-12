import { NextResponse } from "next/server";
import { fetchSurfacePressure } from "@/utils/surfacePressure";

/**
 * 地上気圧と、過去 3 時間の変化量を返す。
 *
 * /api/space-weather と同じ理由でサーバを挟む。`utils/surfacePressure` の
 * fetch に付けた `{ next: { revalidate: 900 } }` はサーバの fetch でしか
 * 効かないため、ブラウザから Open-Meteo を直接叩くと利用者ごとに毎回
 * 外へ出ていく。ホームは公開ページなので、そこは共有したい。
 *
 * 座標は 0.05 度（およそ 5km）に丸めてから渡す。気圧の水平勾配は
 * その程度の距離ではほぼ変わらないうえ、丸めないと利用者ごとに違う URL に
 * なってキャッシュが 1 件も当たらない。
 */
export const revalidate = 900;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lon = parseFloat(searchParams.get("lon") || "");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "lat と lon が要ります" },
      { status: 400 },
    );
  }

  const round = (v: number) => Math.round(v / 0.05) * 0.05;
  const data = await fetchSurfacePressure(round(lat), round(lon));
  return NextResponse.json(data);
}
