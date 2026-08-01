import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalize } from "@geolonia/normalize-japanese-addresses";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Please ensure your .env file exists and contains DATABASE_URL.",
  );
}

// スクレイパーと同様、CI のジョブ上限に収めるための自発停止。
// 未処理分は次回の実行で拾われる（lat/lon が NULL の行を毎回探すため）。
const TIME_BUDGET_MS =
  (parseInt(process.env.GEOCODE_TIME_BUDGET_MIN || "0", 10) || 0) * 60_000;
const STARTED_AT = Date.now();

// level を検証していなかった時期に市の代表点を割り当てられた行をやり直すモード。
const REFRESH_CLUSTERED = process.env.GEOCODE_REFRESH_CLUSTERED === "true";
// 同一座標を何件が共有していたら「粗すぎる」とみなすか。
// 丁目単位なら同じ点に十数件並ぶのは自然なので、明らかに市単位の塊だけを狙う。
const CLUSTER_MIN = parseInt(process.env.GEOCODE_CLUSTER_MIN || "50", 10);

function timeBudgetReached(): boolean {
  return TIME_BUDGET_MS > 0 && Date.now() - STARTED_AT >= TIME_BUDGET_MS;
}

/**
 * Geolonia の normalize() は町名までは正しく分解するが、返す point が
 * 町丁目ごとの座標とは限らない。岡崎市では 706 種類の町名がすべて level=3 と
 * 判定されながら同一の点（＝市の代表点）を返していた。level を見ても防げない。
 * 実際に 157,116 件中 72,527 件が「50件以上が完全に同一座標」の塊に入っていた。
 *
 * 方位は基準点からこの座標への方角で決まるため、市の中心に固まると
 * 同じ市の物件がすべて同じ方位・同じ距離になり、吉凶判定が意味を成さない。
 *
 * そこで座標は国土地理院の住所検索を正とする。上の岡崎市の例でも
 * 字レベルまでばらけた座標が返ることを確認済み。
 * normalize() は住所の表記ゆれを整えるためだけに使う。
 */
const GSI_ENDPOINT = "https://msearch.gsi.go.jp/address-search/AddressSearch";

type GeoPoint = { lat: number; lon: number };
type GeoResult =
  | { kind: "ok"; point: GeoPoint }
  | { kind: "not_found" }
  | { kind: "error" };

// 同じ町丁目の物件が大量にあるため、町単位で引いて使い回す。
// これが無いと 1 物件 1 リクエストになり、公共APIに対して過剰な負荷になる。
const townCache = new Map<string, GeoResult>();
let gsiCalls = 0;

async function lookupGsi(query: string): Promise<GeoResult> {
  try {
    const res = await fetch(
      `${GSI_ENDPOINT}?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return { kind: "error" };
    const json = (await res.json()) as Array<{
      geometry?: { coordinates?: [number, number] };
    }>;
    const top = json?.[0];
    const coords = top?.geometry?.coordinates;
    if (!coords || coords.length < 2) return { kind: "not_found" };
    const [lon, lat] = coords;
    if (typeof lat !== "number" || typeof lon !== "number") {
      return { kind: "not_found" };
    }
    return { kind: "ok", point: { lat, lon } };
  } catch {
    return { kind: "error" };
  }
}

async function geocodeAddress(address: string): Promise<GeoResult> {
  let query = address;
  try {
    // 表記ゆれの吸収（"稲熊町字６丁目" -> "稲熊町字六丁目" など）と、
    // 番地・建物名を落として町丁目単位のキーにする。
    const n = await normalize(address);
    if (n.pref && n.city) {
      query = `${n.pref}${n.city}${n.town ?? ""}`;
    }
  } catch {
    // 正規化に失敗しても生の住所で引けることがあるのでそのまま進む
  }

  const cached = townCache.get(query);
  if (cached) return cached;

  const result = await lookupGsi(query);
  gsiCalls++;
  // エラーは一時的なものなのでキャッシュしない（次回また試す）
  if (result.kind !== "error") townCache.set(query, result);
  // 公共APIなので間隔を空ける。キャッシュヒット時は待たない。
  await new Promise((r) => setTimeout(r, 200));
  return result;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  try {
    let totalSuccess = 0;
    let totalFail = 0;
    let batchNumber = 1;
    let cursor = "00000000-0000-0000-0000-000000000000";

    while (true) {
      if (timeBudgetReached()) {
        console.log(
          "\n⏱️ Time budget reached. Remaining addresses will be geocoded on the next run.",
        );
        break;
      }

      // 通常は「まだ座標が無い物件」を処理する。
      // REFRESH_CLUSTERED のときは、level を見ていなかった頃に市の代表点を
      // 割り当てられてしまった物件（同一座標を大量に共有している行）をやり直す。
      // 精度が出れば別の座標に散り、出なければ NULL に落ちるので、
      // どちらにせよクラスタから抜けて必ず前進する。
      const unmappedProperties: { id: string; address: string | null }[] =
        REFRESH_CLUSTERED
          ? // id カーソルで前進させる。密集した丁目のように、引き直しても
            // 同じ座標に戻る行が残るため、これが無いと同じ行を延々と処理し続ける。
            await prisma.$queryRaw`
              WITH clustered AS (
                SELECT lat, lon
                  FROM rental_properties
                 WHERE lat IS NOT NULL
                 GROUP BY lat, lon
                HAVING count(*) >= ${CLUSTER_MIN}
              )
              SELECT p.id, p.address
                FROM rental_properties p
                JOIN clustered c ON p.lat = c.lat AND p.lon = c.lon
               WHERE p.address IS NOT NULL AND p.address <> ''
                 AND p.id > ${cursor}::uuid
               ORDER BY p.id
               LIMIT 1000`
          : await prisma.rental_properties.findMany({
              where: {
                lat: null,
                lon: null,
                address: { not: null, not: "" },
              },
              orderBy: { created_at: "desc" },
              take: 1000, // 一度に処理する件数
            });

      if (unmappedProperties.length === 0) {
        console.log(`\n🎉 No more properties left to geocode. All done!`);
        break;
      }

      console.log(`\n======================================================`);
      console.log(
        `🚀 Batch #${batchNumber}: Found ${unmappedProperties.length} properties to geocode.`,
      );
      console.log(`======================================================\n`);

      let batchSuccessCount = 0;
      let batchFailCount = 0;

      for (const prop of unmappedProperties) {
        if (timeBudgetReached()) break;
        if (!prop.address) continue;

        const result = await geocodeAddress(prop.address);

        if (result.kind === "ok") {
          await prisma.rental_properties.update({
            where: { id: prop.id },
            data: { lat: result.point.lat, lon: result.point.lon },
          });
          batchSuccessCount++;
          totalSuccess++;
        } else if (result.kind === "not_found") {
          // やり直しモードでは、粗すぎる座標を残してはいけない。
          // 市の代表点のままだと方位も距離も誤ったまま画面に出てしまうので、
          // 「座標なし（＝スキャナーに出さない）」に落とすほうが正しい。
          // ネットワークエラー(kind === "error")では消さない。
          // 一時的な障害で全件の座標を消してしまうのを避けるため。
          if (REFRESH_CLUSTERED) {
            await prisma.rental_properties.update({
              where: { id: prop.id },
              data: { lat: null, lon: null },
            });
          }
          console.log(`❌ [Not found] ${prop.address}`);
          batchFailCount++;
          totalFail++;
        } else {
          console.log(`⚠️ [Lookup error, left as-is] ${prop.address}`);
          batchFailCount++;
          totalFail++;
        }

        // 待機は geocodeAddress 側（実際に国土地理院を叩いたときだけ）で行う。
        cursor = prop.id;
      }

      console.log(`\n📊 Batch #${batchNumber} Results:`);
      console.log(`   - Successfully updated: ${batchSuccessCount}`);
      console.log(`   - Failed to locate: ${batchFailCount}`);
      console.log(
        `   - Town cache: ${townCache.size} entries / ${gsiCalls} lookups`,
      );

      batchNumber++;
    }

    console.log(`\n======================================================`);
    console.log(`🏆 Final Geocoding Results (GSI address search):`);
    console.log(`   - Total successfully updated: ${totalSuccess}`);
    console.log(`   - Total failed to locate: ${totalFail}`);
    console.log(
      `   - Distinct towns looked up: ${townCache.size} (${gsiCalls} requests)`,
    );
    console.log(`======================================================\n`);
  } catch (e) {
    console.error("Fatal error during geocoding:", e);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
