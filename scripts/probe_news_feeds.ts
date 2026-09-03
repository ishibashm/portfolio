import { NEWS_FEEDS } from "../src/data/newsSources";
import { decodeFeedBytes, parseFeed } from "../src/lib/rssParse";

/**
 * /news の配信元が生きているかを、**外から実際に叩いて**確かめる。
 *
 * ## なぜ要るか
 *
 * 台帳（`src/data/newsSources.ts`）の URL は本番でしか生存確認できない
 * （開発環境から外へ出られない）。`fetchNews` は落ちたフィードを黙って
 * 飛ばすので、画面を見ないと気付けない。毎朝の site-audit は「どれが
 * 落ちているか」までは出すが、**なぜ落ちたのか・正しい URL は何か**は
 * 分からない。
 *
 * 実際にそれで 2 件詰まった（2026-09-03）。LIFULL HOME'S PRESS は
 * 推測して置いた 3 つの URL が全部外れ、BUILT（ITmedia）は予備を含めて
 * 落ちた。**推測でもう 1 つ URL を足すのではなく、確かめる。**
 *
 * ## 確かめ方
 *
 * 1. 台帳の `feedUrl`（と `altFeedUrls`）を順に叩く。1 つでも中身の
 *    あるフィードが返れば、その配信元は健在
 * 2. 全部外れたときだけ、**そのサイトの HTML が宣言しているフィード**を
 *    読む（`<link rel="alternate" type="application/rss+xml">`）。
 *    これが本来の探し方で、当てずっぽうに URL を並べるより正確だし、
 *    相手への要求も少ない
 * 3. 宣言が無ければ、よくある形をいくつかだけ試す
 *
 * **落ちている配信元にしか追加の要求を出さない。**平常時は 1 配信元
 * あたり 1 回。
 *
 * ## 使い方
 *
 *   npx tsx scripts/probe_news_feeds.ts
 *
 * 開発環境からは外へ出られないので、`.github/workflows/probe-news-feeds.yml`
 * から回す。DB にも本番にも触らない（読むだけ）。
 */

/** 本番と同じ名乗り。先方が絞りたくなったときに識別できるように。 */
const UA = "cloud-palette.com news reader (+https://cloud-palette.com/news)";
const ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml, text/xml";

/** 叩く間隔。1 秒。 */
const WAIT_MS = 1000;
const wait = () => new Promise((r) => setTimeout(r, WAIT_MS));

/** 宣言が無いときにだけ試す、よくある形。 */
const CONVENTIONAL = [
  "/feed/",
  "/feed",
  "/rss.xml",
  "/index.xml",
  "/atom.xml",
  "?feed=rss2",
];

interface Try {
  url: string;
  status: number;
  bytes: number;
  items: number;
  note: string;
}

async function tryFeed(url: string): Promise<Try> {
  const base = { url, status: 0, bytes: 0, items: 0, note: "" };
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: ACCEPT },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return { ...base, note: `取得に失敗 ${String(e)}` };
  }
  const buf = await res.arrayBuffer();
  const out = { ...base, status: res.status, bytes: buf.byteLength };
  if (!res.ok) return { ...out, note: res.statusText };
  try {
    const xml = decodeFeedBytes(buf, res.headers.get("content-type"));
    const items = parseFeed(xml, 20);
    return {
      ...out,
      items: items.length,
      note: items.length === 0 ? "0 件（フィードではないかも）" : "",
    };
  } catch (e) {
    return { ...out, note: `読めない ${String(e)}` };
  }
}

/** サイトの HTML が宣言しているフィードの URL。 */
async function declaredFeeds(siteUrl: string): Promise<string[]> {
  let html = "";
  try {
    const res = await fetch(siteUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }
  const out: string[] = [];
  /* <link rel="alternate" type="application/rss+xml" href="..."> の順序は
     属性ごとに入れ替わるので、タグを取ってから中を見る */
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss\+xml|atom\+xml)/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      out.push(new URL(href, siteUrl).toString());
    } catch {
      /* 読めない href は捨てる */
    }
  }
  return [...new Set(out)];
}

async function main() {
  const alive: string[] = [];
  const dead: string[] = [];
  const rows: string[] = [];
  const found: string[] = [];

  console.log("## 台帳の配信元\n");
  console.log("| id | 結果 | 使えた URL | 件数 | バイト |");
  console.log("|---|---|---|---|---|");

  for (const source of NEWS_FEEDS) {
    const candidates = [source.feedUrl, ...(source.altFeedUrls ?? [])];
    let ok: Try | null = null;
    const tried: Try[] = [];
    for (const url of candidates) {
      const t = await tryFeed(url);
      tried.push(t);
      if (t.status === 200 && t.items > 0) {
        ok = t;
        break;
      }
      await wait();
    }
    if (ok) {
      alive.push(source.id);
      rows.push(
        `| ${source.id} | ✅ | ${ok.url} | ${ok.items} | ${ok.bytes.toLocaleString()} |`,
      );
    } else {
      dead.push(source.id);
      const last = tried[tried.length - 1];
      rows.push(
        `| ${source.id} | ❌ | — | — | ${last ? `${last.status} ${last.note}` : ""} |`,
      );
    }
    await wait();
  }
  console.log(rows.join("\n"));
  console.log("");
  console.log(`生きている: ${alive.length} 件 — ${alive.join(" ")}`);
  console.log(`落ちている: ${dead.length} 件 — ${dead.join(" ") || "なし"}`);

  if (dead.length === 0) return;

  /* ここから先は落ちている配信元だけ。相手への要求を増やさない */
  console.log("\n## 落ちている配信元を追う\n");
  for (const id of dead) {
    const source = NEWS_FEEDS.find((f) => f.id === id)!;
    console.log(`### ${source.name}（${id}）\n`);
    console.log(`サイト: ${source.siteUrl}\n`);

    const declared = await declaredFeeds(source.siteUrl);
    await wait();
    if (declared.length > 0) {
      console.log(`HTML が宣言しているフィード: ${declared.length} 本\n`);
    } else {
      console.log("HTML はフィードを宣言していない。よくある形を試す\n");
    }

    const targets =
      declared.length > 0
        ? declared
        : CONVENTIONAL.map((p) => {
            try {
              return new URL(p, source.siteUrl).toString();
            } catch {
              return "";
            }
          }).filter(Boolean);

    console.log("| 候補 | status | 件数 | バイト | 備考 |");
    console.log("|---|---|---|---|---|");
    for (const url of targets) {
      const t = await tryFeed(url);
      console.log(
        `| ${t.url} | ${t.status} | ${t.items} | ${t.bytes.toLocaleString()} | ${t.note} |`,
      );
      if (t.status === 200 && t.items > 0) {
        found.push(`${id}: ${t.url}`);
        break;
      }
      await wait();
    }
    console.log("");
  }

  console.log("## 見つかった差し替え先\n");
  console.log(
    found.length > 0
      ? found.map((f) => `- ${f}`).join("\n")
      : "無し。台帳の決まりどおり、リンク集へ移すのが筋。",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
