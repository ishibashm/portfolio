import { NextResponse } from "next/server";

/**
 * IndexNow の鍵ファイル。
 *
 * IndexNow は「この URL が変わった」を検索エンジンへ直接知らせる仕組み
 * （Bing・Yandex・Seznam・Naver が対応。**Google は参加していない**）。
 * 送信を受け付けてもらうには、送る側がそのドメインの持ち主であることを
 * 示す必要があり、その証明が「鍵と同じ内容のファイルをそのドメインに
 * 置く」こと。
 *
 * **鍵は認証情報ではない。**公開されている前提の値で、第三者に知られても
 * できるのは「このサイトの URL を検索エンジンに知らせる」ことだけ。
 * それでも値をコードに直書きしない理由は、Google・Bing の所有権確認と
 * 同じで、**差し替えるたびにデプロイが要るのを避けるため**。
 *
 * 規約では鍵ファイルはドメイン直下に置くのが既定だが、`keyLocation` を
 * 一緒に送れば別の場所でもよい。ここを直下（`/<鍵>.txt`）にすると
 * **任意の名前を拾う catch-all のルートが必要になり**、綴りを間違えた
 * URL まで 200 を返すようになる。固定の名前にして、送信側から
 * `keyLocation` で指す。
 *
 * 未設定のときは 404。空の 200 を返すと、鍵が違うのに「ファイルはある」
 * と見えて、送信が弾かれた理由が分からなくなる。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return new NextResponse(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // 鍵は滅多に変えないが、変えたときに古い値が残ると送信が全部弾かれる
      "Cache-Control": "public, max-age=3600",
    },
  });
}
