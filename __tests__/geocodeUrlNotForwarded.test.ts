import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/geocode/route";
import { suumoCitySearchUrl } from "@/lib/portalLinks";

/*
  「この地点を調べる」の入口（`/api/geocode`）に **URL が貼られたとき**の話。

  ## 見つかった不具合 — 貼った URL が外へ出ていた

  この route は読み取れなかった `q` を **nominatim（openstreetmap.org）へ
  そのまま載せて**投げていた。#1310 で「地点に物件ページの URL を控える」欄を
  作った以上、同じ画面の検索欄に URL が貼られるのは**想定内の操作**で、
  そのとき**利用者が見ている物件の URL が外部のサービスに渡っていた。**

  地点の URL は端末とこちらの DB にしか置かない約束（`user_spots`）なのに、
  検索欄を通ると約束の外へ出る。**入口が 1 つでも漏れていれば漏れている。**

  ## 直し方

  URL は**この route で折り返す。**外（geolonia・nominatim）へは一切渡さない。
  綴りから市区町村が読めれば代表点を返し、読めなければ 404 で地名を促す。

  ## 取りに行ってもいない

  貼られた URL を開きに行くのはスクレイピングで、規約が名指しで禁じている
  （backlog 25 節）。読むのは綴りだけ。母集団ごとの見張りは
  `userSpotUrlNeverFetched`。
*/

const SUUMO = suumoCitySearchUrl("13103") as string;

function req(q: string): Request {
  return new Request(
    `https://cloud-palette.com/api/geocode?q=${encodeURIComponent(q)}`,
  );
}

/**
 * 外への要求を、呼ばれたこと自体が分かる形に差し替える。
 *
 * 型は**この関数の戻り値から引く。**`ReturnType<typeof vi.spyOn>` と
 * 書くと型引数の付かない既定（`(...args: unknown[]) => unknown`）になり、
 * 実際の fetch の型と合わずに tsc が落ちる。キャストで押し通さない
 * （CLAUDE.md 4 節）。
 */
function spyOnFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    throw new Error(`外部へ要求が出た: ${String(input)}`);
  });
}

describe("貼られた URL を外へ出さない", () => {
  let fetchSpy: ReturnType<typeof spyOnFetch>;

  /*
    **この見張りは fetch の spy だけに頼っていない。**
    `@geolonia/normalize-japanese-addresses` は自前の通信を持っていて、
    spy をすり抜ける（実測：旧実装に当てると spy は「呼ばれていない」の
    まま、外への要求が実際に飛んで 500 になった）。

    効いているのは**先に返すこと**そのもの。URL のときは外へ出る処理に
    入る前に 200 か 404 を返すので、旧実装では 500 になる所が 404 になる。
    spy は nominatim の分を押さえる二重の網。
  */
  beforeEach(() => {
    fetchSpy = spyOnFetch();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("見張りが空回りしていない（URL を貼る前提が生きている）", () => {
    expect(SUUMO).toContain("sc=13103");
  });

  it("検索一覧の URL は、外に出さずにその街の代表点を返す", async () => {
    const res = await GET(req(SUUMO));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("東京都港区");
    expect(typeof body.lat).toBe("number");
    expect(typeof body.lon).toBe("number");
    /* 街の代表点であって物件の場所ではない、と名乗る */
    expect(body.source).toBe("municipality");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("場所を読み取れない URL も、外に出さずに 404 で返す", async () => {
    for (const url of [
      "https://suumo.jp/chintai/jnc_000012345/",
      "https://www.homes.co.jp/chintai/b-1234567890/",
      "https://example.com/a/b/c?q=%E6%9D%B1%E4%BA%AC",
      "http://suumo.jp/?sc=13103",
      "javascript:alert(1)",
      "//suumo.jp/?sc=13103",
    ]) {
      const res = await GET(req(url));
      expect(res.status, url).toBe(404);
      const body = await res.json();
      expect(body.error, url).toContain("市区町村名");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("県までしか指していない URL は、何が足りないかを言う（外には出さない）", async () => {
    /*
      HOME'S の県の一覧を貼った人が「読み取れませんでした」で止まった
      （2026-09-17）。市区町村は綴りに無いが県は読めるので、
      「愛知県までしか指していない」と、その県の市区町村名の例を返す。
      県の代表点は返さない（県の真ん中からの方位はその人の街の方位ではない）。
    */
    for (const url of [
      "https://www.homes.co.jp/chintai/aichi/",
      "https://www.homes.co.jp/chintai/aichi/nagoya-city/",
      "https://suumo.jp/jj/chintai/ichiran/FR301FC001/?ar=050&bs=040&ta=23",
    ]) {
      const res = await GET(req(url));
      expect(res.status, url).toBe(404);
      const body = await res.json();
      expect(body.error, url).toContain("愛知県までしか指していません");
      expect(body.error, url).toMatch(/例: .+[市区町村]/);
      expect(body.lat, url).toBeUndefined();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("q が無いときは今までどおり 400", async () => {
    const res = await GET(new Request("https://cloud-palette.com/api/geocode"));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("URL でない入力の扱いは変えていない", () => {
  it("地名は URL と見なさない（今までの経路へ行く）", async () => {
    /*
      ここで外への要求が出るのは**正しい**（住所の正規化）。URL の判定が
      地名まで巻き込んでいないことを、`looksLikeUrl` の形で確かめる。
      route を実際に走らせると外へ出るので、綴りの規則だけを見る。
    */
    const src = (await import("node:fs")).readFileSync(
      "src/app/api/geocode/route.ts",
      "utf8",
    );
    const m = src.match(
      /function looksLikeUrl\(raw: string\): boolean \{\n\s*return ([\s\S]*?);\n\}/,
    );
    expect(m, "looksLikeUrl が見つからない").not.toBeNull();
    const looksLikeUrl = new Function("raw", `return ${m![1]};`) as (
      raw: string,
    ) => boolean;

    for (const place of [
      "東京都港区",
      "名古屋市中区",
      "京都駅",
      "35.0116, 135.7681",
      "1-2-3 丸の内",
      "https ではない場所",
    ]) {
      expect(looksLikeUrl(place), place).toBe(false);
    }
    for (const url of [
      "https://suumo.jp/?sc=13103",
      "http://example.com",
      "//example.com",
      "javascript:alert(1)",
      "data:text/html,x",
    ]) {
      expect(looksLikeUrl(url), url).toBe(true);
    }
  });
});
