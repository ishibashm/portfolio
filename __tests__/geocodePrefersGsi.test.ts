import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/*
  「この地点を調べる」が住所を点に落とす口（`/api/geocode`）。

  ## 見つかった不具合 — 正確な住所を入れても市の中心が返りうる

  `@geolonia/normalize-japanese-addresses` の `normalize()` が返す `point` は
  **町丁目ごとの座標とは限らない。**岡崎市では 706 種類の町名がすべて
  `level=3` と判定されながら同一の点（市の代表点）を返しており、巡回の実測で
  157,116 件中 72,527 件が「50 件以上が完全に同一座標」の塊に入っていた。

  巡回はこれを理由に**国土地理院**へ切り替えたが、**この口は取り残されて
  いた。**物件ページから住所を正確に写して入れても、市の中心が返りうる。

  画面に国土地理院の口が無かったわけではない（`/api/geocode/suggest` は
  元から国土地理院）。**点に落とす側だけ**が geolonia のままだった。

  ## 見張ること

  1. **国土地理院を先に引く。**当たったらそれを返す
  2. **番地を落とさない。**巡回は町丁目単位のキャッシュを作るために番地を
     捨てるが、それは公共 API への負荷の都合。ここで捨てると精度をただ失う
  3. **どこから来た点かを名乗る。**geolonia に落ちたときに、番地の点と
     区別が付かないまま返さない（CLAUDE.md 3 節「黙って別のものに落ちる」）
  4. 「落ちた（error）」ときに次の綴りへ回さない。通信が落ちただけの回で
     「無い」と答えないため
*/

const ROUTE = "src/app/api/geocode/route.ts";

const ADDRESS = "愛知県岡崎市明大寺町字耳取20";
/** 国土地理院が返す体裁（GeoJSON。[経度, 緯度] の順） */
const GSI_HIT = [
  {
    geometry: { coordinates: [137.17361, 34.9235] },
    properties: { title: ADDRESS },
  },
];

function req(q: string): Request {
  return new Request(
    `https://cloud-palette.com/api/geocode?q=${encodeURIComponent(q)}`,
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("住所は国土地理院で引く", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@geolonia/normalize-japanese-addresses");
  });

  async function load() {
    /* normalize は外へ通信するので差し替える。**返す point は
       「市の中心に潰れた」値**にして、そちらを使っていたら分かるようにする */
    vi.doMock("@geolonia/normalize-japanese-addresses", () => ({
      normalize: async () => ({
        pref: "愛知県",
        city: "岡崎市",
        town: "明大寺町字耳取",
        addr: "20",
        level: 3,
        point: { lat: 34.95, lng: 137.17 }, // 岡崎市の代表点
      }),
    }));
    return await import("@/app/api/geocode/route");
  }

  it("国土地理院が当たったら、その点を source: gsi で返す", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(GSI_HIT));
    const { GET } = await load();
    const body = await (await GET(req(ADDRESS))).json();

    expect(body.source).toBe("gsi");
    expect(body.lat).toBeCloseTo(34.9235, 4);
    expect(body.lon).toBeCloseTo(137.17361, 4);
    /* 市の代表点（34.95）に落ちていないこと。**ここが本題** */
    expect(body.lat).not.toBeCloseTo(34.95, 3);
    expect(spy).toHaveBeenCalled();
  });

  it("番地を落とさずに引いている", async () => {
    let asked = "";
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      asked = String(input);
      return Promise.resolve(jsonResponse(GSI_HIT));
    });
    const { GET } = await load();
    await GET(req(ADDRESS));

    const q = decodeURIComponent(new URL(asked).searchParams.get("q") ?? "");
    expect(q).toContain("明大寺町字耳取");
    /* 巡回は町丁目単位のキャッシュのために番地を捨てる。ここで捨てない */
    expect(q, `引いた綴り: ${q}`).toContain("20");
  });

  it("国土地理院で見つからなければ geolonia に落ちるが、そう名乗る", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));
    const { GET } = await load();
    const body = await (await GET(req(ADDRESS))).json();

    expect(body.source).toBe("normalize");
    expect(body.lat).toBeCloseTo(34.95, 4);
  });

  it("国土地理院が落ちたときは、綴りを変えて連打しない", async () => {
    /* 見つからない（not_found）と落ちた（error）を混ぜると、通信が
       落ちただけの回で「無い」と答え、しかも 2 回叩くことになる */
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 500 }));
    const { GET } = await load();
    const body = await (await GET(req(ADDRESS))).json();

    /* 国土地理院への要求は 1 回だけ（このあと nominatim へ回る） */
    const gsiCalls = spy.mock.calls.filter((c) =>
      String(c[0]).includes("msearch.gsi.go.jp"),
    );
    expect(gsiCalls).toHaveLength(1);
    expect(body.source).toBe("normalize");
  });
});

describe("実装の形", () => {
  const SRC = readFileSync(join(process.cwd(), ROUTE), "utf8");

  it("引き口は lib から読む（写しを持たない）", () => {
    expect(SRC).toContain('from "@/lib/gsiGeocode"');
    expect(SRC).not.toContain("msearch.gsi.go.jp");
  });

  it("geolonia の point を無条件に先に返していない", () => {
    /* 旧実装は normalize の直後に point を返していた。国土地理院を
       試す前にそこへ戻ったら落とす */
    const gsiAt = SRC.indexOf("lookupGsi(");
    const pointAt = SRC.indexOf("normalized.point");
    expect(gsiAt).toBeGreaterThan(-1);
    expect(pointAt).toBeGreaterThan(gsiAt);
  });

  it("どこから来た点かを必ず名乗る", () => {
    for (const s of ["gsi", "normalize", "nominatim", "municipality"]) {
      expect(SRC, s).toContain(`source: "${s}"`);
    }
  });
});
