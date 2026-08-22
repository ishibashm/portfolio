import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  objectKeyFor,
  publicUrl,
  readR2Config,
  slugifyFileName,
  validateImage,
} from "@/lib/r2";

/**
 * 画像の置き場（R2）の、通信しない部分。
 *
 * 実際の PUT は本番の鍵が要るので、ここでは鍵の作り方・URL への
 * 変換・受け付ける条件だけを固定する。**この 3 つが記事に残る**ので、
 * 後から変えると過去の記事の画像が全部切れる。
 */

const CONFIG = {
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucket: "cloud-palette-images",
  publicBase: "https://img.cloud-palette.com",
};

/*
  TextEncoder の .buffer は ArrayBufferLike なので、そのままでは
  ArrayBuffer に渡せない。キャストで黙らせず、実体を作って写す。
*/
function bytesOf(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  const out = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(out).set(encoded);
  return out;
}

describe("設定の読み取り", () => {
  it("全部そろっていれば読める", () => {
    const c = readR2Config({
      R2_ACCOUNT_ID: "a",
      R2_ACCESS_KEY_ID: "b",
      R2_SECRET_ACCESS_KEY: "c",
      R2_BUCKET: "d",
      NEXT_PUBLIC_IMAGE_BASE_URL: "https://img.example.com",
    });
    expect(c?.bucket).toBe("d");
  });

  it("末尾の / は落とす（URL が // にならないように）", () => {
    const c = readR2Config({
      R2_ACCOUNT_ID: "a",
      R2_ACCESS_KEY_ID: "b",
      R2_SECRET_ACCESS_KEY: "c",
      R2_BUCKET: "d",
      NEXT_PUBLIC_IMAGE_BASE_URL: "https://img.example.com/",
    });
    expect(c?.publicBase).toBe("https://img.example.com");
  });

  it("1 つでも欠けたら null（部分的に動かさない）", () => {
    const c = readR2Config({
      R2_ACCOUNT_ID: "a",
      R2_ACCESS_KEY_ID: "b",
      R2_SECRET_ACCESS_KEY: "c",
      R2_BUCKET: "d",
    });
    expect(c).toBeNull();
  });
});

describe("ファイル名の正規化", () => {
  it("英数字とハイフンだけに落とす", () => {
    expect(slugifyFileName("Houi Diagram v2.PNG")).toBe("houi-diagram-v2");
  });

  it("日本語だけの名前は image に落ちる（鍵に意味は持たせない）", () => {
    expect(slugifyFileName("方位の図.png")).toBe("image");
  });

  it("拡張子は落とす", () => {
    expect(slugifyFileName("a.b.c.jpg")).toBe("a-b-c");
  });
});

describe("鍵の作り方", () => {
  it("年月は日本時間で切る（UTC の月末夜に翌月へ入らない）", () => {
    // 2026-08-31T23:30Z は JST では 2026-09-01 08:30。
    const key = objectKeyFor(
      "fig.png",
      "image/png",
      bytesOf("x"),
      new Date("2026-08-31T23:30:00Z"),
    );
    expect(key.startsWith("blog/2026/09/")).toBe(true);
  });

  it("同じ中身なら同じ鍵（二重に置かれない）", () => {
    const a = objectKeyFor("fig.png", "image/png", bytesOf("same"));
    const b = objectKeyFor("fig.png", "image/png", bytesOf("same"));
    expect(a).toBe(b);
  });

  it("同じ名前でも中身が違えば別の鍵（前のものを潰さない）", () => {
    const a = objectKeyFor("fig.png", "image/png", bytesOf("one"));
    const b = objectKeyFor("fig.png", "image/png", bytesOf("two"));
    expect(a).not.toBe(b);
  });

  it("拡張子は content-type から決める（元の名前を信用しない）", () => {
    const key = objectKeyFor("fig.png", "image/webp", bytesOf("x"));
    expect(key.endsWith(".webp")).toBe(true);
  });
});

describe("公開 URL への変換", () => {
  it("土台と鍵をつなぐ", () => {
    expect(publicUrl("blog/2026/08/a-1234abcd.png", CONFIG)).toBe(
      "https://img.cloud-palette.com/blog/2026/08/a-1234abcd.png",
    );
  });

  it("先頭に / があっても // にしない", () => {
    expect(publicUrl("/blog/a.png", CONFIG)).toBe(
      "https://img.cloud-palette.com/blog/a.png",
    );
  });
});

describe("受け付ける条件", () => {
  it("PNG は通る", () => {
    expect(validateImage("image/png", 1024)).toBeNull();
  });

  it("SVG は理由つきで断る（中に script を書けるため）", () => {
    const message = validateImage("image/svg+xml", 1024);
    expect(message).toContain("SVG");
  });

  it("上限ちょうどは通り、1 バイト超えると断る", () => {
    expect(validateImage("image/png", MAX_IMAGE_BYTES)).toBeNull();
    expect(validateImage("image/png", MAX_IMAGE_BYTES + 1)).toContain(
      "大きすぎ",
    );
  });

  it("空は断る", () => {
    expect(validateImage("image/png", 0)).toContain("空");
  });
});
