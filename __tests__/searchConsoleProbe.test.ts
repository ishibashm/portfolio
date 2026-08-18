import { describe, it, expect, vi } from "vitest";
import {
  SITE_URL_PROPERTY,
  fetchAccessToken,
  inspectUrl,
  inspectUrls,
  probeSearchConsole,
} from "@/lib/searchConsole";
import { inspectionTargets } from "@/lib/searchConsoleTargets";

/**
 * Search Console の疎通確認の固定。
 *
 * 本番（Cloud Run）でしか本当のことは分からないが、**手元で確かめられる
 * ことは 3 つある。**
 *
 *   1. トークンの取り方（メタデータサーバーの作法）が正しいか
 *   2. 失敗の理由を取り違えていないか
 *   3. 権限が無いときに「通った」と言わないか
 *
 * 3 が肝心。ここを間違えると、繋がっていないのに繋がったと報告してしまう。
 */

const TOKEN_HOST = "metadata.google.internal";
const SITES_HOST = "searchconsole.googleapis.com";

/** 呼ばれた URL と引数を覚える fetch の替え玉。 */
function fakeFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  ) as unknown as typeof fetch;
}

/**
 * トークンの応答。**呼ばれるたびに作り直す。**
 * Response の body は一度しか読めないので、使い回すと 2 回目以降が
 * 「取れなかった」ことになり、原因を取り違える。
 */
const okToken = () =>
  new Response(JSON.stringify({ access_token: "T", expires_in: 3599 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("トークンの取り方", () => {
  it("メタデータサーバーには Metadata-Flavor を付ける", async () => {
    let seenHeader: string | undefined;
    let seenUrl = "";
    const f = fakeFetch((url, init) => {
      seenUrl = url;
      seenHeader = (init?.headers as Record<string, string>)?.[
        "Metadata-Flavor"
      ];
      return okToken();
    });

    expect(await fetchAccessToken(f)).toBe("T");
    expect(seenUrl).toContain(TOKEN_HOST);
    // これが無いとメタデータサーバーは応答しない。
    expect(seenHeader).toBe("Google");
    // 読み取りだけ。書き込みの scope を要求しない。
    expect(seenUrl).toContain("webmasters.readonly");
  });

  it("メタデータサーバーが無ければ null（手元・CI）", async () => {
    const f = fakeFetch(() => {
      throw new Error("ENOTFOUND metadata.google.internal");
    });
    expect(await fetchAccessToken(f)).toBeNull();
  });
});

describe("疎通の確認", () => {
  it("トークンが取れなければ notOnCloudRun", async () => {
    const f = fakeFetch(() => {
      throw new Error("ENOTFOUND");
    });
    const probe = await probeSearchConsole(f);
    expect(probe.ok).toBe(false);
    if (!probe.ok) expect(probe.reason).toBe("notOnCloudRun");
  });

  it("プロパティが見えれば ok", async () => {
    const f = fakeFetch((url) => {
      if (url.includes(TOKEN_HOST)) return okToken();
      return new Response(
        JSON.stringify({
          siteEntry: [
            {
              siteUrl: "sc-domain:cloud-palette.com",
              permissionLevel: "siteFullUser",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const probe = await probeSearchConsole(f);
    expect(probe.ok).toBe(true);
    if (probe.ok) {
      expect(probe.sites).toHaveLength(1);
      expect(probe.sites[0].siteUrl).toContain("cloud-palette.com");
    }
  });

  it("403 が返ったら apiError。**通ったことにしない**", async () => {
    // 権限が足りないとき。ここを ok にすると、繋がっていないのに
    // 「通っています」と報告してしまう。
    const f = fakeFetch((url) => {
      if (url.includes(TOKEN_HOST)) return okToken();
      return new Response("insufficient permissions", { status: 403 });
    });

    const probe = await probeSearchConsole(f);
    expect(probe.ok).toBe(false);
    if (!probe.ok) {
      expect(probe.reason).toBe("apiError");
      expect(probe.detail).toContain("403");
    }
  });

  it("繋がったが 1 件も見えないときは、空で ok を返す", async () => {
    /*
      「繋がらない」と「繋がったが見えない」は原因が別。
      前者はクラウドで動いていない、後者はユーザー追加が効いていない。
      同じ扱いにすると、どちらを直せばよいか分からなくなる。
    */
    const f = fakeFetch((url) => {
      if (url.includes(TOKEN_HOST)) return okToken();
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const probe = await probeSearchConsole(f);
    expect(probe.ok).toBe(true);
    if (probe.ok) expect(probe.sites).toEqual([]);
  });

  it("問い合わせ先は Search Console の API（旧 webmasters ドメインではない）", async () => {
    let sitesUrl = "";
    const f = fakeFetch((url) => {
      if (url.includes(TOKEN_HOST)) return okToken();
      sitesUrl = url;
      return new Response(JSON.stringify({ siteEntry: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await probeSearchConsole(f);
    expect(sitesUrl).toContain(SITES_HOST);
  });
});

describe("URL 検査", () => {
  it("プロパティは sc-domain の形で送る", async () => {
    // 実測で Search Console の登録は sc-domain:cloud-palette.com（ドメイン所有）。
    // URL プレフィックス形式で送ると 403 になる。
    let sentBody: Record<string, string> = {};
    const f = fakeFetch((_url, init) => {
      sentBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ inspectionResult: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await inspectUrl("T", "https://cloud-palette.com/blog", f);
    expect(sentBody.siteUrl).toBe(SITE_URL_PROPERTY);
    expect(SITE_URL_PROPERTY).toBe("sc-domain:cloud-palette.com");
    expect(sentBody.inspectionUrl).toBe("https://cloud-palette.com/blog");
  });

  it("判断に使う枝だけを取り出す", async () => {
    const f = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            inspectionResult: {
              indexStatusResult: {
                verdict: "PASS",
                coverageState: "Submitted and indexed",
                robotsTxtState: "ALLOWED",
                indexingState: "INDEXING_ALLOWED",
                lastCrawlTime: "2026-08-16T00:00:00Z",
                // 使わない枝。落ちても壊れないこと。
                pageFetchState: "SUCCESSFUL",
                referringUrls: ["https://example.com"],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const r = await inspectUrl("T", "https://cloud-palette.com/", f);
    expect(r.verdict).toBe("PASS");
    expect(r.indexingState).toBe("INDEXING_ALLOWED");
    expect(r.error).toBeUndefined();
  });

  it("失敗しても投げず、その URL の error に残す", async () => {
    // 1 件の失敗で全部が止まると、残りの状況が分からなくなる。
    const f = fakeFetch(() => new Response("quota exceeded", { status: 429 }));
    const rows = await inspectUrls(
      "T",
      ["https://cloud-palette.com/a", "https://cloud-palette.com/b"],
      f,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].error).toContain("429");
    expect(rows[1].error).toContain("429");
  });
});

describe("検査する URL の選び方", () => {
  it("載るべきものと、外したはずのものの両方を見る", () => {
    const targets = inspectionTargets();
    const groups = new Set(targets.map((t) => t.group));

    // 記事と道具だけ見ても、#379 の noindex が効いたかは分からない。
    expect(groups.has("article")).toBe(true);
    expect(groups.has("core")).toBe(true);
    expect(groups.has("noindexed")).toBe(true);

    // 外したはずのものは shouldBeIndexed が偽。
    for (const t of targets.filter((t) => t.group === "noindexed")) {
      expect(t.shouldBeIndexed).toBe(false);
    }
    for (const t of targets.filter((t) => t.group !== "noindexed")) {
      expect(t.shouldBeIndexed).toBe(true);
    }
  });

  it("1 日の枠（2,000 件）に対して十分小さい", () => {
    // 全ページを舐めるための仕組みではない。増やしすぎると枠を焼く。
    expect(inspectionTargets().length).toBeLessThan(100);
  });

  it("同じ URL を二重に検査しない", () => {
    const urls = inspectionTargets().map((t) => t.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
