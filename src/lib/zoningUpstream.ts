import { toLogMessage } from "@/lib/errorMessage";

/**
 * 用途地域の上流（不動産情報ライブラリ `XKT002`）から 1 タイル取る。
 *
 * `/api/zoning`（GeoJSON をそのまま中継）と `/api/zoning/raster`
 * （PNG に焼いて配る）の両方がここを通る。上流の URL・鍵の付け方・
 * 404 の読み方を 2 か所に書かないため。
 *
 * ## 404 は「無い」であって失敗ではない
 *
 * そのタイルに都市計画の決定が無い（都市計画区域の外など）。
 * エラーにすると海や山を見るたびに赤い帯が出るので、空として返す。
 *
 * ## 上流に投げるのは z12 以上だけ
 *
 * 実測で確かめてあるのは z12〜（`utils/zoning` の表）。それより
 * 広い縮尺を上流が返すかは確かめていない。返さないときの応答が
 * 404 だと「無い」と見分けが付かず、**海でもないのに空のタイルを
 * 描いてしまう**ので、広い縮尺は呼ぶ側が z12 の子タイルから組む。
 */

export const ZONING_UPSTREAM_ENDPOINT =
  "https://www.reinfolib.mlit.go.jp/ex-api/external/XKT002";

/**
 * 30 日。用途地域の変更は年に数回で、決定から施行まで数か月かかる。
 * 1 日で捨てると、変わらないものを毎日取りに行くことになる。
 */
export const ZONING_REVALIDATE_SECONDS = 2592000;

export interface RawZoningFeature {
  type?: string;
  /* 上流は Polygon / MultiPolygon しか返さない（probe_zoning.ts の実測）。 */
  geometry?: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
}

export type ZoningUpstreamResult =
  | { ok: true; features: RawZoningFeature[] }
  | { ok: false; reason: "no_key" | "upstream" };

export async function fetchZoningUpstream(
  z: number,
  x: number,
  y: number,
): Promise<ZoningUpstreamResult> {
  const apiKey = process.env.LIBRARY_API_KEY;
  if (!apiKey) {
    console.error("用途地域: LIBRARY_API_KEY が未設定");
    return { ok: false, reason: "no_key" };
  }

  const url = `${ZONING_UPSTREAM_ENDPOINT}?response_format=geojson&z=${z}&x=${x}&y=${y}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey, Accept: "*/*" },
      next: { revalidate: ZONING_REVALIDATE_SECONDS },
    });
  } catch (e) {
    console.error("用途地域の取得に失敗:", toLogMessage(e));
    return { ok: false, reason: "upstream" };
  }

  if (res.status === 404) return { ok: true, features: [] };
  if (!res.ok) {
    console.error(`用途地域: 上流が ${res.status} ${res.statusText}`);
    return { ok: false, reason: "upstream" };
  }

  try {
    const body = (await res.json()) as { features?: RawZoningFeature[] };
    return { ok: true, features: body.features ?? [] };
  } catch (e) {
    console.error("用途地域: JSON として読めない:", toLogMessage(e));
    return { ok: false, reason: "upstream" };
  }
}
