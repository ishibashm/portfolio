import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

/**
 * 消した・移した頁の受け方。
 *
 * Search Console の「見つかりませんでした（404）」の URL 一覧
 * （2026-08-16 の書き出し・19 件）を見て決めた。内訳はこう。
 *
 *   15 件  /_next/static/media/*.woff2
 *          ビルドごとにハッシュが変わるフォント。古い版の残骸なので、
 *          放っておけば消える。転送する対象ではない
 *    1 件  /about        いま実在する（クロールが 2026-02 で古いだけ）
 *    1 件  /blog（www）  同上。www は正規ホストへ 301 で送っている
 *    1 件  /お問い合わせ/ いまは /contact。**これだけ後継がある**
 *    1 件  /portfolio    旧サイトの頁。後継が無い
 *
 * **後継が無いものは送らない。**送り先の中身が元の頁と無関係だと、
 * Google は soft 404 として扱う。転送は付けない。削除が確定した頁
 * （/extract）は middleware の 410 に任せる。
 *
 * next.config は型検査に掛かるが、**どこへ送るかは型では守れない。**
 * 行き先の頁を消したり移したりしたときに気付けるよう、ここで見る。
 */

type Redirect = {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
};

async function redirects(): Promise<Redirect[]> {
  const fn = nextConfig.redirects;
  if (!fn) throw new Error("redirects が定義されていません");
  return (await fn()) as Redirect[];
}

function find(list: Redirect[], source: string) {
  return list.find((r) => r.source === source);
}

describe("消した頁の転送", () => {
  it.each([
    [
      "/blog/when-you-cannot-avoid-a-bad-direction",
      "/blog/does-bad-direction-last-60-years",
    ],
    [
      "/blog/taikyoku-where-to-measure-from",
      "/blog/direction-seen-from-the-original-home",
    ],
    ["/news", "/blog"],
  ])("%s を %s へ 301 で送る", async (source, destination) => {
    const redirect = find(await redirects(), source);
    expect(redirect).toMatchObject({
      destination,
      statusCode: 301,
    });
    expect(redirect).not.toHaveProperty("permanent");
  });

  it("問い合わせの旧 URL を /contact へ 301 で送る", async () => {
    const list = await redirects();
    expect(find(list, "/お問い合わせ")).toMatchObject({
      destination: "/contact",
      permanent: true,
    });
  });

  it("符号化された形でも受ける", async () => {
    // Google の一覧には日本語のまま出るが、実際の要求は %E3%81%8A... で来る。
    const list = await redirects();
    const encoded = encodeURI("/お問い合わせ");
    expect(find(list, encoded)).toMatchObject({
      destination: "/contact",
      permanent: true,
    });
  });

  it("窓から外れた月別カレンダーは転送せず頁として残す", async () => {
    const sources = (await redirects()).map((r) => r.source);
    // 月が変わると 18 か月窓の先頭が外れる。2026-09 は以前 /calendar へ
    // 送っていたが、頁を残す方針に変えたので転送しない。
    for (const path of ["/calendar/2026-09", "/calendar/2026-10"]) {
      expect(sources, `${path} を送っている`).not.toContain(path);
    }
  });

  it("後継の無い頁は送らない（soft 404 を作らない）", async () => {
    const list = await redirects();
    // /portfolio は旧サイトの頁で、いまのサイトに対応するものが無い。
    // 消した 9 頁も同じ。/extract は転送せず 410 にする（gonePaths）。
    const noSuccessor = [
      "/portfolio",
      "/trends",
      "/visualizer",
      "/x-viewer",
      "/research",
      "/extract",
      "/agent-log",
      "/ceremonial-sample",
    ];
    for (const path of noSuccessor) {
      expect(find(list, path)).toBeUndefined();
    }
  });

  it("いま実在する頁を転送に入れていない", async () => {
    // /about と /blog は 404 一覧に出ているが、クロールが古いだけで
    // 現在は実在する。転送を足すと、実在する頁が引けなくなる。
    const list = await redirects();
    expect(find(list, "/about")).toBeUndefined();
    expect(find(list, "/blog")).toBeUndefined();
    // Search Console が 404 と報告したことがあるが、#969 以降は実在する。
    expect(find(list, "/houi/area/47348")).toBeUndefined();
  });

  it("www から正規のホストへ送る設定を消していない", async () => {
    const list = await redirects();
    const canonical = list.find((r) => r.source === "/:path*");
    expect(canonical?.destination).toContain("https://cloud-palette.com");
  });
});
