import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";

/**
 * 物件を id で引く。名前・住所・座標だけの軽い口。
 *
 * お気に入り（lib/favorites）は **id しか持っていない**。クラウド側の
 * favorite_properties も端末側の localStorage も並んでいるのは id だけで、
 * 「★ を付けた物件がどこにあるか」を後から知る手段が無かった。入れられる
 * のに使えない状態だったので、試算ページから呼び出せるようにする。
 *
 * **id を引数で受ける。**「ログイン中の利用者のお気に入り」を読む口には
 * しない。未ログインでも ★ は押せる（端末に貯まる）ので、その id も
 * 同じ口で引けないと片方だけ使えないことになる。
 *
 * 返すのは走査 API と同じ列名。**同じ物件を別の名前で呼ばない**ため。
 */

export const dynamic = "force-dynamic";

/** 一度に引ける上限。お気に入りの一覧に出すぶんだけあればよい。 */
const MAX_IDS = 200;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("ids") ?? "";

  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  /*
    id は uuid の列。uuid として読めない文字列が混ざると Postgres が
    型変換で落ちるため、形の合わないものはここで捨てる。お気に入りは
    端末にも貯まるので、古い形の値が残っていることがある。
  */
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const valid = ids.filter((id) => UUID_RE.test(id));

  if (valid.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  try {
    /*
      型付きクライアントで引く。生 SQL で uuid の配列を渡すのは
      ドライバごとの扱いに寄りかかることになり、手元では確かめられない。
      ここは索引の効く主キー引きなので、生 SQL にする理由が無い。
    */
    const rows = await prisma.rental_properties.findMany({
      where: { id: { in: valid } },
      select: {
        id: true,
        property_name: true,
        address: true,
        lat: true,
        lon: true,
        rent: true,
        management_fee: true,
        layout: true,
      },
    });

    /*
      並びは渡された id の順に戻す。お気に入りは「新しく入れた順」で
      並んでいるので、DB の返す順で上書きするとその意味が消える。
    */
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = valid.map((id) => byId.get(id)).filter(Boolean);

    return NextResponse.json({ success: true, data: ordered });
  } catch (e) {
    console.error("お気に入り物件の取得に失敗:", toLogMessage(e));
    return NextResponse.json(
      { success: false, error: "物件を読み込めませんでした。" },
      { status: 500 },
    );
  }
}
