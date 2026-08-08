/**
 * 同じ部屋が複数の仲介会社経由で別々の行として入っているぶんを 1 行にまとめる。
 *
 * Nifty は複数の仲介会社の掲載をまとめて出すため、同じ部屋が会社の数だけ
 * 別 URL で並ぶ。url に一意制約があるので upsert では潰れず、行だけが増える。
 * 実測で 107 万行に対して実在する部屋は 39 万件しかない。
 *
 * これは容量の問題であると同時に表示の問題でもある。検索結果に同じ部屋が
 * 4 つ並び、エリアの中央値も多重掲載された部屋に引っ張られる。
 *
 * purge（期限切れの削除）は 1 日ぶんの入れ替わりを消すだけで、行数は
 * 減らず 500MB を割れない。行数そのものを減らせるのはこの重複排除だけ。
 *
 * 既定はドライラン。まとめ方の候補を複数出して、どれで何行減るかを示す。
 * 実際に削除するには DEDUPE_APPLY=true が必要。
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL / DIRECT_URL is not set.");
}

const APPLY = process.env.DEDUPE_APPLY === "true";
// 1 文で 60 万行消すと WAL が膨らむ。刻んで消して、最後にまとめて VACUUM する。
const BATCH = parseInt(process.env.DEDUPE_BATCH || "20000", 10);

/**
 * まとめ方の候補。
 *
 * 建物名だけを頼りにすると「メゾン〇〇」のような、市が違えば別物の建物まで
 * 同一視してしまう。所在地をどこまで鍵に含めるかで安全側と効果側が振れるので、
 * ドライランで並べて比べる。
 *
 * 家賃が入っていない行は除く。NULL は GROUP BY では等しく扱われるため、
 * 家賃も間取りも欠けた行同士が無関係なまま 1 件に潰れてしまう。
 */
const KEYS: Record<string, { label: string; cols: string }> = {
  a: {
    label: "建物名 + 階 + 間取り + 面積 + 家賃",
    cols: "property_name, coalesce(floor,''), coalesce(layout,''), size_sqm, rent",
  },
  b: {
    label: "a + エリア（既定。市区町村まで一致を要求する）",
    cols: "property_name, coalesce(area,''), coalesce(floor,''), coalesce(layout,''), size_sqm, rent",
  },
  c: {
    label: "a + 住所（もっとも安全。表記ゆれには弱い）",
    cols: "property_name, coalesce(address,''), coalesce(floor,''), coalesce(layout,''), size_sqm, rent",
  },
};

const KEY_NAME = (process.env.DEDUPE_KEY || "b").toLowerCase();

/**
 * 各グループで残す 1 行の選び方。
 *
 *   1. 座標がある行を優先する。消してしまうとジオコーディングをやり直すことになる
 *   2. 掲載期限を過ぎていない行を優先する。リンクが 404 にならない
 *   3. 最後に見かけた時刻が新しい行を優先する
 *   4. 同点なら id で決める（実行するたびに結果が変わらないようにする）
 */
const KEEP_ORDER = `
  (lat IS NULL),
  (expire_date IS NOT NULL AND expire_date < now()),
  last_seen_at DESC NULLS LAST,
  id
`;

async function main() {
  const pool = new Pool({ connectionString, max: 1 });
  const q = async (sql: string, params: unknown[] = []) =>
    (await pool.query(sql, params)).rows;

  try {
    // Supabase の既定は 120 秒。県ごとに分けても VACUUM FULL は 1 文で
    // テーブル全体を書き直すので、既定のままだと打ち切られうる。
    // 権限が無くて弾かれても処理は続けられるので、失敗は握りつぶす。
    try {
      await pool.query("SET statement_timeout = 0");
      console.log("statement_timeout を解除した。");
    } catch {
      console.log("statement_timeout は変更できなかった（既定のまま続行）。");
    }

    const sizeBefore = (
      await q(
        `SELECT pg_size_pretty(pg_database_size(current_database())) AS s`,
      )
    )[0].s;
    const totalBefore = Number(
      (await q(`SELECT count(*) AS n FROM rental_properties`))[0].n,
    );
    console.log(`Database size before: ${sizeBefore}`);
    console.log(`Total rows: ${totalBefore}`);
    console.log(`Mode: ${APPLY ? "APPLY (rows will be deleted)" : "DRY RUN"}`);

    // 家賃が無い行はまとめる対象から外すので、どの候補でもそのまま残る。
    // 候補ごとに数え直すと 100 万行を無駄に舐めるため、先に 1 回だけ取る。
    const noRent = Number(
      (
        await q(
          `SELECT count(*) AS n FROM rental_properties WHERE rent IS NULL`,
        )
      )[0].n,
    );

    console.log("\n[まとめ方の候補]");
    const measured: {
      name: string;
      label: string;
      keep: number;
      drop: number;
    }[] = [];
    for (const [name, def] of Object.entries(KEYS)) {
      const keep = Number(
        (
          await q(
            `SELECT count(*) AS n FROM (
               SELECT 1 FROM rental_properties
                WHERE rent IS NOT NULL
                GROUP BY ${def.cols}
             ) AS d`,
          )
        )[0].n,
      );
      const drop = totalBefore - keep - noRent;
      measured.push({ name, label: def.label, keep: keep + noRent, drop });
      const pct = ((drop / totalBefore) * 100).toFixed(0);
      console.log(
        `  ${name}: ${def.label}\n` +
          `     残る ${keep + noRent} 行 / 消える ${drop} 行 (${pct}%)`,
      );
    }

    const chosen = KEYS[KEY_NAME];
    if (!chosen) {
      throw new Error(
        `DEDUPE_KEY=${KEY_NAME} は未定義。${Object.keys(KEYS).join(" / ")} のいずれか。`,
      );
    }
    console.log(`\n採用する鍵: ${KEY_NAME} (${chosen.label})`);

    // 消える側にどれだけ座標が付いているか。ここが大きいと、消したぶんだけ
    // ジオコーディングをやり直すことになるので、残す順序を疑う材料になる。
    const droppedWithCoords = Number(
      (
        await q(
          `SELECT count(*) AS n FROM (
             SELECT row_number() OVER (
                      PARTITION BY ${chosen.cols} ORDER BY ${KEEP_ORDER}
                    ) AS rn, lat
               FROM rental_properties
              WHERE rent IS NOT NULL
           ) AS r
           WHERE rn > 1 AND lat IS NOT NULL`,
        )
      )[0].n,
    );
    console.log(`消える行のうち座標付き: ${droppedWithCoords}`);

    if (!APPLY) {
      console.log("\nDry run. Set DEDUPE_APPLY=true to delete.");
      if (process.env.GITHUB_STEP_SUMMARY) {
        const rows = measured
          .map(
            (m) =>
              `| ${m.name} | ${m.label} | ${m.keep} | ${m.drop} | ${((m.drop / totalBefore) * 100).toFixed(0)}% |`,
          )
          .join("\n");
        fs.appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `### 重複排除（ドライラン）\n\n` +
            `現在 ${totalBefore} 行 / ${sizeBefore}\n\n` +
            `| 鍵 | まとめ方 | 残る | 消える | 削減 |\n| --- | --- | ---: | ---: | ---: |\n${rows}\n`,
        );
      }
      return;
    }

    // 鍵に住所かエリアが入っていれば、同じ部屋が都道府県をまたぐことはない。
    // その場合は県ごとに処理する。1 回のウィンドウ関数が 1/12 の行数で済み、
    // Supabase の statement_timeout（実測 120 秒）に収まる。
    //
    // 全件を対象にしたまま刻むと、バッチごとに 110 万行を並べ替え直すことに
    // なり、削除が進んでも軽くならない。実際にそれで打ち切られた。
    const canPartition = /address|area/.test(chosen.cols);
    const scopes: (string | null)[] = canPartition
      ? (
          await q(
            `SELECT DISTINCT substring(address from 1 for 3) AS p
               FROM rental_properties
              WHERE address IS NOT NULL
              ORDER BY 1`,
          )
        ).map((r) => r.p as string)
      : [null];

    if (!canPartition) {
      console.log(
        "\n鍵に住所もエリアも含まれないため、全件を一度に処理する。" +
          "行数が多いと statement_timeout で打ち切られることがある。",
      );
    }

    // 刻んで消す。ctid ではなく id を使うのは VACUUM で ctid が動くため。
    //
    // 途中で落ちても VACUUM FULL まで到達させる。DELETE しただけでは
    // 領域が OS に返らず pg_database_size も縮まないため、ここで投げ返すと
    // 「行は消えたのに容量は減らない」状態で終わってしまう。上限を超えている
    // ときにそれをやると、次の実行の余地まで失う。
    let deleted = 0;
    let failure: unknown = null;
    try {
      for (const scope of scopes) {
        const where = scope
          ? `WHERE rent IS NOT NULL AND substring(address from 1 for 3) = $1`
          : `WHERE rent IS NOT NULL`;
        const params = scope ? [scope] : [];
        let inScope = 0;

        for (;;) {
          const del = await pool.query(
            `WITH ranked AS (
             SELECT id, row_number() OVER (
                      PARTITION BY ${chosen.cols} ORDER BY ${KEEP_ORDER}
                    ) AS rn
               FROM rental_properties
              ${where}
           ),
           victims AS (
             SELECT id FROM ranked WHERE rn > 1 LIMIT ${BATCH}
           )
           DELETE FROM rental_properties p
            USING victims v
            WHERE p.id = v.id`,
            params,
          );
          const n = del.rowCount ?? 0;
          if (n === 0) break;
          inScope += n;
          deleted += n;
          console.log(`  ${scope ?? "all"}: ${inScope} (合計 ${deleted})`);
        }
      }
    } catch (e) {
      failure = e;
      console.error("\n削除の途中で失敗した。ここまでのぶんで領域を返す。");
      console.error(e);
    }
    console.log(`\nDeleted ${deleted} rows.`);

    // DELETE だけでは領域が OS に返らず pg_database_size も縮まない。
    // Supabase の 500MB クォータはこのサイズで判定されるため VACUUM FULL が要る。
    console.log("Running VACUUM FULL to reclaim the space...");
    await pool.query("VACUUM (FULL, ANALYZE) rental_properties");

    const sizeAfter = (
      await q(
        `SELECT pg_size_pretty(pg_database_size(current_database())) AS s`,
      )
    )[0].s;
    const remaining = Number(
      (await q(`SELECT count(*) AS n FROM rental_properties`))[0].n,
    );
    console.log(`Database size after: ${sizeAfter} (${remaining} rows remain)`);

    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### 重複排除\n\n` +
          `- 採用した鍵: ${KEY_NAME} (${chosen.label})\n` +
          `- 削除: ${deleted} 行\n` +
          `- サイズ: ${sizeBefore} → ${sizeAfter}\n` +
          `- 残り: ${remaining} 行\n` +
          (failure ? `- **削除は完走していない。再実行が要る。**\n` : ""),
      );
    }

    // 領域を返し終えてから改めて失敗を伝える。赤くならないと、削除が
    // 途中で終わったことに気付けない。
    if (failure) throw failure;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
