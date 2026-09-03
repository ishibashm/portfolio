import { inflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/zoning/raster/[z]/[x]/[y]/route";
import { lonLatOfTileUnits } from "@/lib/tileCoords";
import { ZONING_FILL } from "@/utils/zoning";

/**
 * 俯瞰の塗り絵タイル（`/api/zoning/raster/{z}/{x}/{y}`）を、上流を
 * 模擬して通す。
 *
 * 開発環境からは mlit.go.jp に出られない（egress で 403）ので、上流の
 * 形（`probe_zoning.ts` で確かめた GeoJSON）を fetch の差し替えで返す。
 * 見るのは**経路の約束**——PNG が返る・失敗を覚えない・絞り込みの
 * 名前を検証する・同じタイルは 1 度しか取りに行かない。
 */

const Z = 12;
const X = 3637;
const Y = 1612;

/** タイル (x, y) の左上を 0,0 とする矩形 → GeoJSON の輪 */
function rect(
  tx: number,
  ty: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ].map(([x, y]) => {
    const { lat, lon } = lonLatOfTileUnits(tx + x, ty + y, Z);
    return [lon, lat];
  });
}

/**
 * 上流の応答を、**頼まれたタイルに合わせて**作る（西半分が商業地域、
 * 東半分が第１種住居地域）。検査ごとに別のタイルを頼んで、経路の
 * キャッシュが検査どうしで混ざらないようにする。
 */
function upstreamFor(url: string) {
  const m = /z=(\d+)&x=(\d+)&y=(\d+)/.exec(url);
  if (!m) throw new Error(`上流の URL が読めない: ${url}`);
  const tx = Number(m[2]);
  const ty = Number(m[3]);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [rect(tx, ty, 0, 0, 0.5, 1)],
        },
        properties: { use_area_ja: "商業地域", youto_id: 10 },
      },
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [rect(tx, ty, 0.5, 0, 1, 1)],
        },
        properties: { use_area_ja: "第１種住居地域", youto_id: 5 },
      },
    ],
  };
}

const okUpstream = (url: string) =>
  Promise.resolve(
    new Response(JSON.stringify(upstreamFor(url)), { status: 200 }),
  );

function request(z: number, x: number, y: number, query = "") {
  return [
    new Request(`http://localhost/api/zoning/raster/${z}/${x}/${y}${query}`),
    { params: Promise.resolve({ z: String(z), x: String(x), y: String(y) }) },
  ] as const;
}

/** PNG を戻して、(x, y) の画素を読む関数を返す（IDAT はフィルタ 0 の行） */
async function decode(res: Response) {
  const png = Buffer.from(await res.arrayBuffer());
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  let at = 8;
  let idat: Buffer | null = null;
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") idat = png.subarray(at + 8, at + 8 + length);
    at += 12 + length;
  }
  if (!idat) throw new Error("IDAT が無い");
  const raw = inflateSync(idat);
  const stride = 256 * 4 + 1;
  return (x: number, y: number) => {
    const o = y * stride + 1 + x * 4;
    return [raw[o], raw[o + 1], raw[o + 2], raw[o + 3]];
  };
}

const hex = (h: string) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

describe("/api/zoning/raster", () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("LIBRARY_API_KEY", "test-key");
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("上流の区画を塗った PNG を返し、ブラウザにも持たせる", async () => {
    fetchMock.mockImplementation(okUpstream);
    const res = await GET(...request(Z, X, Y));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("max-age=86400");

    /* 鍵は上流にだけ渡す */
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("XKT002");
    expect(url).toContain(`z=${Z}&x=${X}&y=${Y}`);
    expect(
      (init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"],
    ).toBe("test-key");

    const px = await decode(res);
    expect(px(64, 128)).toEqual([...hex(ZONING_FILL["商業地域"]), 255]);
    expect(px(192, 128)).toEqual([...hex(ZONING_FILL["第１種住居地域"]), 255]);
  });

  it("同じタイルは 2 度目から覚えたものを返す（上流を叩かない）", async () => {
    fetchMock.mockImplementation(okUpstream);
    await GET(...request(Z, X + 1, Y));
    await GET(...request(Z, X + 1, Y));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("同時に頼まれても上流は 1 回", async () => {
    let resolve: ((r: Response) => void) | null = null;
    let requested = "";
    fetchMock.mockImplementation(
      (url: string) =>
        new Promise<Response>((r) => {
          requested = url;
          resolve = r;
        }),
    );
    const a = GET(...request(Z, X + 2, Y));
    const b = GET(...request(Z, X + 2, Y));
    /* GET は params → キャッシュ → 上流と await を挟むので、マイクロタスクを流し切る */
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve!(
      new Response(JSON.stringify(upstreamFor(requested)), { status: 200 }),
    );
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
  });

  it("絞り込みは選んだ区分だけ元の色、他は灰色", async () => {
    fetchMock.mockImplementation(okUpstream);
    const res = await GET(
      ...request(Z, X + 3, Y, `?pick=${encodeURIComponent("商業地域")}`),
    );
    expect(res.status).toBe(200);
    const px = await decode(res);
    expect(px(64, 128)).toEqual([...hex(ZONING_FILL["商業地域"]), 255]);
    expect(px(192, 128)).toEqual([...hex("#E0E0E0"), 255]);
  });

  it("知らない区分名の絞り込みは 400（黙って全部の色で返さない）", async () => {
    const res = await GET(...request(Z, X + 4, Y, "?pick=%E8%AC%8E"));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("上流が 404（都市計画区域の外）なら透明なタイルを 200 で返す", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const res = await GET(...request(Z, X + 5, Y));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect((await decode(res))(128, 128)).toEqual([0, 0, 0, 0]);
  });

  it("上流の失敗は 502 で、覚えない（次は取り直す）", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const first = await GET(...request(Z, X + 6, Y));
    expect(first.status).toBe(502);
    expect(first.headers.get("Cache-Control")).toBe("no-store");

    fetchMock.mockImplementationOnce(okUpstream);
    const second = await GET(...request(Z, X + 6, Y));
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("塗り絵の範囲外のズームと、壊れたタイル座標は 400", async () => {
    expect((await GET(...request(13, 0, 0))).status).toBe(400);
    expect((await GET(...request(10, 0, 0))).status).toBe(400);
    expect((await GET(...request(12, 99999, 0))).status).toBe(400);
    const bad = new Request("http://localhost/api/zoning/raster/12/a/b");
    expect(
      (await GET(bad, { params: Promise.resolve({ z: "12", x: "a", y: "b" }) }))
        .status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("鍵が無ければ 503", async () => {
    vi.stubEnv("LIBRARY_API_KEY", "");
    const res = await GET(...request(Z, X + 7, Y));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
