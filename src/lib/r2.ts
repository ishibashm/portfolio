import { AwsClient } from "aws4fetch";
import { createHash } from "node:crypto";
import { toJapanDateString } from "@/utils/japanDate";

/**
 * 記事に貼る画像の置き場（Cloudflare R2）。
 *
 * ## なぜ R2 か
 *
 * Supabase は Free プランで認証にだけ使っている。Storage の無料枠は
 * 1 GB・転送 5 GB/月で、**転送はプロジェクト全体で共有**する。画像は
 * まさに転送を食うもので、認証と同じ枠を食い合う。
 *
 * 500MB の壁で DB を別の Postgres へ移した経緯がある（docs/db-migration）。
 * **同じ壁にもう一度ぶつかりに行かない。**R2 は転送が無料で、容量も
 * 10 GB まで無料。
 *
 * ## 記事には URL でなく「鍵」を入れる
 *
 * 本文に絶対 URL を書き込むと、置き場を替えたときに**記事を全部
 * 書き直す**ことになる。鍵（`blog/2026/08/xxx.webp`）だけを持ち、
 * URL への変換は publicUrl ただ 1 か所で行う。置き場を替えるときに
 * 直すのはこの関数だけで済む。
 *
 * ## SDK を入れない
 *
 * `@aws-sdk/client-s3` は 20 MB 超で依存も多い。ここでやるのは
 * PutObject 1 つだけなので、署名だけを持つ aws4fetch（88 KB・依存なし）
 * を使う。Artifact Registry が 124 GB まで膨らんだ経緯があるので、
 * イメージに載るものは小さく保つ。
 */

/** 受け付ける画像の種類。 */
export const ALLOWED_IMAGE_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/**
 * SVG は**受け付けない。**
 *
 * SVG は中に script を書ける。配信元が img.cloud-palette.com で本体とは
 * 別のドメインなので本体の cookie は取られないが、閲覧者のブラウザで
 * 任意のコードが動く余地をわざわざ作る理由が無い。
 *
 * 図はコードから描く方針（判定ロジックを持っているので盤や方位は
 * 生成できる）なので、SVG を上げる用途がそもそも無い。
 */
export const REJECTED_IMAGE_TYPES: readonly string[] = ["image/svg+xml"];

/** 1 枚の上限。記事の挿絵にこれ以上は要らない。 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** 拡張子。content-type から引く。元のファイル名は信用しない。 */
const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** 公開 URL の土台。末尾に / は付けない */
  publicBase: string;
}

/**
 * 環境変数から設定を読む。**1 つでも欠けたら null。**
 *
 * 部分的に設定された状態で動かすと、署名だけ通って保存先が違う、
 * のような分かりにくい失敗になる。全部そろっているか、いないかの
 * 2 択にする。
 */
export function readR2Config(
  env: Record<string, string | undefined> = process.env,
): R2Config | null {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucket = env.R2_BUCKET;
  const publicBase = env.NEXT_PUBLIC_IMAGE_BASE_URL;
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBase
  ) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBase: publicBase.replace(/\/+$/, ""),
  };
}

/**
 * ファイル名を鍵に使える形へ。
 *
 * 日本語のファイル名がそのまま鍵になると URL で扱いにくいので、
 * ASCII の英数字とハイフンだけに落とす。**何も残らなければ "image"。**
 * 意味は alt に書けばよく、鍵に意味を持たせる必要はない。
 */
export function slugifyFileName(name: string): string {
  const base = name.replace(/\.[^.]*$/, "");
  const safe = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return safe || "image";
}

/**
 * 保存する鍵。**中身のハッシュを混ぜる。**
 *
 * 同じ画像を 2 回上げても同じ鍵になるので二重に置かれない。逆に、
 * 同じファイル名で中身が違うものを上げても**前のものを潰さない。**
 * 名前だけで決めると、記事 A の図が記事 B の図に差し替わる。
 *
 * 年月は**日本時間**で切る。実行環境は UTC（Cloud Run）なので、
 * そのまま getMonth すると月初の朝に前月の棚へ入る。
 */
export function objectKeyFor(
  fileName: string,
  contentType: string,
  bytes: ArrayBuffer,
  now: Date = new Date(),
): string {
  const ext = EXTENSION[contentType];
  if (!ext) throw new Error(`扱えない種類: ${contentType}`);
  const digest = createHash("sha256")
    .update(new Uint8Array(bytes))
    .digest("hex")
    .slice(0, 8);
  const [year, month] = toJapanDateString(now).split("-");
  return `blog/${year}/${month}/${slugifyFileName(fileName)}-${digest}.${ext}`;
}

/**
 * 鍵から公開 URL へ。**変換はここ 1 か所だけ。**
 *
 * 記事の本文は鍵しか持たないので、置き場を替えるときに直すのは
 * この関数と設定だけになる。
 */
export function publicUrl(key: string, config: R2Config): string {
  return `${config.publicBase}/${key.replace(/^\/+/, "")}`;
}

/** 受け取ったものが画像として妥当か。駄目な理由を日本語で返す。 */
export function validateImage(
  contentType: string,
  size: number,
): string | null {
  if (REJECTED_IMAGE_TYPES.includes(contentType)) {
    return "SVG は受け付けていません。PNG・JPEG・WebP・GIF のいずれかにしてください。";
  }
  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    return `${contentType} は画像として扱えません。PNG・JPEG・WebP・GIF のいずれかにしてください。`;
  }
  if (size <= 0) return "中身が空です。";
  if (size > MAX_IMAGE_BYTES) {
    const mb = (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0);
    return `画像が大きすぎます（上限 ${mb} MB）。`;
  }
  return null;
}

/**
 * R2 へ 1 枚置く。成功したら鍵を返す。
 *
 * fetchImpl を差せるようにしてあるのは試験のため（searchConsole.ts と
 * 同じ形）。**本番では既定の fetch を使う。**
 *
 * Cache-Control を 1 年にしているのは、鍵に中身のハッシュが入っていて
 * **同じ鍵なら中身も同じ**だから。差し替えたら別の鍵になるので、
 * 古いものが残り続けることはない。
 */
export async function putImage(
  key: string,
  body: ArrayBuffer,
  contentType: string,
  config: R2Config,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;
  const signed = await client.sign(endpoint, {
    method: "PUT",
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
    body,
  });
  const res = await fetchImpl(signed);
  if (!res.ok) {
    /*
      本文まで読む。R2 は理由を XML で返すので、それが無いと
      「403 でした」しか分からない。鍵の権限違いなのかバケット名
      違いなのかが、ここで分かれる。
    */
    const detail = await res.text().catch(() => "");
    throw new Error(
      `R2 への保存に失敗しました（HTTP ${res.status}）${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }
}
