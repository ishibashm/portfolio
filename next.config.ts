import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  /*
    lint の設定はここに置かない（キー名を書き出しにすると、ESLint が
    行内設定と読んで parse error になる。実際に落ちた）。

    Next 16 で `next lint` ごと無くなり、next.config のそのキーは
    **読まれずに警告になる**（`Unrecognized key(s) in object: 'eslint'` と
    `Invalid next.config.ts options detected`）。ビルドのたびに 2 行出て
    いた。lint は npm run lint（と pre-commit の lefthook）で見ている
    ので、ここに書く必要がない。
  */
  // www is mapped to this same Cloud Run service, so the canonical-host
  // redirect is issued here rather than at the edge.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.cloud-palette.com" }],
        destination: "https://cloud-palette.com/:path*",
        statusCode: 301,
      },
      /*
        Search Console の 404 一覧（2026-08-16 の書き出し・19 件）にあった
        もののうち、**後継がはっきりしている 1 つ**だけ受ける。

        内訳は 15 件が /_next/static/media/*.woff2（ビルドごとにハッシュが
        変わるフォント。古い版の残骸で、放っておけば消える）、
        /about と /blog は**いま実在する**（クロールが 2026-02 で古いだけ）、
        /portfolio は旧サイトの頁で後継が無い。

        後継が無いものを送らないのは、送り先の中身が元の頁と無関係だと
        Google が soft 404 として扱うため。**404 のままが正しい。**
      */
      {
        // 問い合わせ。日本語の URL から英語の経路へ移した。
        source: "/お問い合わせ",
        destination: "/contact",
        permanent: true,
      },
      {
        // 上と同じ宛先。符号化された形で来たときも受ける。
        source: "/%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B",
        destination: "/contact",
        permanent: true,
      },
      {
        /*
          購読の口。RSS は /blog/feed.xml にある。

          Search Console が `/feed/` を「noindex タグによって除外」として
          挙げていた。実在しないので 404 ページが返り、その 404 ページに
          noindex が付いているだけ、という読み方になる。

          `/feed` は旧サイト（WordPress 系）の慣習的な経路で、**後継が
          はっきりしている**ので送る。ここは soft 404 の心配が無い
          （送り先が元の URL の目的とまったく同じ）。
        */
        source: "/feed",
        destination: "/blog/feed.xml",
        permanent: true,
      },
    ];
  },
  /*
    都道府県の輪郭は、内容が変わらないのに毎回取り直しになっていた。

    public/ に置いたファイルに Next.js が付ける既定は
    `Cache-Control: public, max-age=0`。ブラウザは**開くたびにサーバへ
    確認**しに行く。ETag があるので中身の再送は無いが、往復そのものが
    残る。スマホの回線では、これが「2 回目も遅い」の正体になっていた
    （利用者から報告あり）。

    県境は年に何度も動くものではない。1 日を過ぎたら裏で取り直しつつ、
    画面には手元のものをすぐ出す（stale-while-revalidate）。これなら
    輪郭を引き直したときも、翌日には行き渡る。

    **max-age を 1 年にして immutable にはしない。**ファイル名にハッシュが
    付かないので、更新したときに古いものが 1 年残りうる。
  */
  async headers() {
    return [
      {
        source: "/prefectures.geojson",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
  /*
    /api/v1 への書き換えは外した。

    この転送先（別プロセスの API）を呼ぶ画面は **#559 で全部消えている**
    （docs/improvement-backlog.md 9 節。widget 群・DynamicCanvas ごと
    2,829 行）。`grep -rn "/api/v1" src/` は 0 件。

    残しておくと、誰かが /api/v1/… を叩いたときに 127.0.0.1:8000 へ
    転送しようとして**繋がらないまま待たされる**。実在しない経路は
    404 を返すほうが正しい。
  */
};

export default nextConfig;
