/**
 * **本番の中継**（`/api/zoning`）が実際に応えるかを確かめる。
 *
 * `probe_zoning.ts` は上流（不動産情報ライブラリ）を直接叩くが、こちらは
 * **自分のサイトを外から叩く。**中継の経路・鍵の受け渡し・キャッシュまで
 * 通して初めて「動いた」と言える。
 *
 * 開発環境からは cloud-palette.com にも mlit.go.jp にも出られない
 * （egress で 403）。だからここで回す。
 *
 * **「通るはず」で済ませないための道具。**dry-run や型検査は、鍵が本番に
 * 渡っているかも、上流が本番の IP を通すかも教えてくれない。
 *
 *   ZONING_RELAY_BASE=https://cloud-palette.com npx tsx scripts/probe_zoning_relay.ts
 */

const BASE = process.env.ZONING_RELAY_BASE || "https://cloud-palette.com";

interface Spot {
  name: string;
  lat: number;
  lon: number;
  z: number;
  /** 期待する結果。ここを書いておかないと、何が正しいのか後から分からない。 */
  expect: string;
}

const SPOTS: Spot[] = [
  {
    name: "東京都千代田区",
    lat: 35.6938,
    lon: 139.7532,
    z: 14,
    expect: "商業地域などが返る",
  },
  {
    name: "京都府京都市下京区",
    lat: 34.9859,
    lon: 135.7585,
    z: 14,
    expect: "返る",
  },
  {
    name: "北海道の山中（都市計画区域外）",
    lat: 43.4,
    lon: 142.8,
    z: 14,
    expect: "空で返る（404 を空に畳んでいる）",
  },
];

function latLonToTile(lat: number, lon: number, zoom: number) {
  const x = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
  return { z: zoom, x, y };
}

async function hit(path: string) {
  const url = `${BASE}${path}`;
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    return { url, status: 0, ms: Date.now() - started, text: String(err) };
  }
  const text = await res.text();
  return { url, status: res.status, ms: Date.now() - started, text };
}

async function main() {
  console.log(`## 中継先: ${BASE}\n`);

  console.log("### 1. 実際のタイル\n");
  console.log("| 場所 | z/x/y | HTTP | 件数 | バイト | ms | 期待 |");
  console.log("|---|---|---|---|---|---|---|");
  let ok = 0;

  for (const spot of SPOTS) {
    const t = latLonToTile(spot.lat, spot.lon, spot.z);
    const r = await hit(`/api/zoning?z=${t.z}&x=${t.x}&y=${t.y}`);
    let count = "-";
    if (r.status === 200) {
      try {
        const body = JSON.parse(r.text) as { features?: unknown[] };
        count = String(body.features?.length ?? 0);
        ok++;
      } catch {
        count = "**JSON で読めない**";
      }
    }
    console.log(
      `| ${spot.name} | ${t.z}/${t.x}/${t.y} | ${r.status} | ${count} | ${r.text.length.toLocaleString()} | ${r.ms} | ${spot.expect} |`,
    );
  }

  console.log("\n### 2. 最初の 1 区画の中身（東京）\n");
  const t = latLonToTile(SPOTS[0].lat, SPOTS[0].lon, SPOTS[0].z);
  const r = await hit(`/api/zoning?z=${t.z}&x=${t.x}&y=${t.y}`);
  if (r.status === 200) {
    try {
      const body = JSON.parse(r.text) as {
        features?: { properties?: unknown; geometry?: { type?: string } }[];
      };
      const first = body.features?.[0];
      console.log("```json");
      console.log(JSON.stringify(first?.properties ?? null, null, 2));
      console.log("```");
      console.log(`geometry の型: ${first?.geometry?.type ?? "（無い）"}`);
    } catch {
      console.log("JSON として読めない:", r.text.slice(0, 300));
    }
  } else {
    console.log(`HTTP ${r.status}: ${r.text.slice(0, 300)}`);
  }

  console.log("\n### 3. 弾くべきものを弾いているか\n");
  console.log("| 何を試したか | HTTP | 応答 |");
  console.log("|---|---|---|");
  const bad: [string, string][] = [
    ["広すぎる縮尺（z=12）", `/api/zoning?z=12&x=3638&y=1612`],
    ["範囲外のタイル", `/api/zoning?z=14&x=99999999&y=0`],
    ["数でない値", `/api/zoning?z=abc&x=1&y=1`],
    ["指定なし", `/api/zoning`],
  ];
  for (const [label, path] of bad) {
    const rr = await hit(path);
    console.log(
      `| ${label} | ${rr.status} | ${rr.text.slice(0, 120).replace(/\s+/g, " ")} |`,
    );
  }

  console.log(
    `\n実タイル ${ok}/${SPOTS.length} 件が 200。0 なら中継は動いていない。`,
  );
}

main().catch((e) => {
  console.error("落ちた:", e);
  process.exit(1);
});
