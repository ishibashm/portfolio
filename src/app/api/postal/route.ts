import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";

/**
 * 郵便番号 7 桁から住所と座標を引く。
 *
 * 入力を楽にするための口（利用者の要望）。番号さえ覚えていれば、
 * 地名を思い出さずに場所が決まる。
 *
 * 対応表は日本郵便が配っているものを取り込む
 * （scripts/import_postal_codes.ts）。**日本郵便のデータに座標は無い**
 * ので、住所から座標は取り込みのときに国土地理院で引いて一緒に持つ。
 * 画面を開くたびに外へ出ないようにするため。
 *
 * **表がまだ無くても 503 を返すだけにする。**画面はその欄を「いま
 * 使えません」にするだけで、地名や緯度経度での入力は動く。DDL の適用は
 * 一方向なので、運用側が時期を選べるようにしておく。
 */

export const dynamic = "force-dynamic";

/**
 * 表がまだ適用されていないときの Postgres のコード。
 *
 * `errorCode()` は使えない。生 SQL の失敗を Prisma は P2010 で包み、
 * Postgres 側のコードは meta の中に入る。しかもドライバによって形が
 * 違う（アダプタ経由だと message にだけ載ることがある）。
 * **どの包み方でも拾えるよう、文字列として探す。**
 */
const UNDEFINED_TABLE = "42P01";

function isMissingTable(e: unknown): boolean {
  try {
    // meta も message も含めてまるごと見る。表が無い、という 1 点しか
    // 判定していないので、広めに拾って構わない。
    return JSON.stringify(
      e instanceof Error ? { m: e.message, ...e } : e,
    ).includes(UNDEFINED_TABLE);
  } catch {
    return String(e).includes(UNDEFINED_TABLE);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("code") ?? "";

  // 全角・ハイフンを許して 7 桁に揃える。
  const code = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, "");

  if (code.length !== 7) {
    return NextResponse.json(
      { success: false, error: "郵便番号は 7 桁で入れてください。" },
      { status: 400 },
    );
  }

  try {
    const rows = await prisma.$queryRaw<
      Array<{ address: string; lat: number | null; lon: number | null }>
    >(
      Prisma.sql`SELECT address, lat, lon
                   FROM postal_codes
                  WHERE code = ${code}
                  LIMIT 1`,
    );

    const row = rows[0];
    if (!row || row.lat === null || row.lon === null) {
      // 番号は表にあっても座標が埋まっていないことがある。
      // 「見つからない」と同じ扱いにして、地名で探してもらう。
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({
      success: true,
      data: { address: row.address, lat: row.lat, lon: row.lon },
    });
  } catch (e) {
    if (isMissingTable(e)) {
      // 表がまだ無い。画面はこの欄だけ使えないと出す。
      return NextResponse.json(
        { success: false, error: "郵便番号の対応表がまだ入っていません。" },
        { status: 503 },
      );
    }
    console.error("郵便番号の検索に失敗:", toLogMessage(e));
    return NextResponse.json(
      { success: false, error: "郵便番号を調べられませんでした。" },
      { status: 500 },
    );
  }
}
