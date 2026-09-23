import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_PORTAL_URLS,
  PORTAL_LINK_DISCLAIMER,
  SUUMO_PERSONAL_SITE_EXCEPTION,
  portalLinksForCity,
  suumoCitySearchUrl,
} from "@/lib/portalLinks";
import { AREAS } from "@/lib/areaContent";

/*
  外部の不動産サイトへのリンクを**画面に置く側**の見張り。

  台帳（`lib/portalLinks`）は `portalLinks.test.ts` が見ている。こちらは
  **台帳を迂回して URL を書いていないか**を見る。規約で許された先だけを
  持つ台帳を作っても、画面が自分で URL を組み立てたら意味が無い。

  ## 気にしていること

  1. **画面の中に生の外部 URL が無い。**必ず台帳の関数から取る
  2. **誤認させないための一言が必ず付く**（HOME'S の規約）
  3. **旗を下ろせば市区町村の頁へ渡さなくなる。**利用者の判断が変わった
     ときに、1 か所で戻せること
*/

const COMPONENT = "src/components/portal/CityPortalLinks.tsx";
/** 描くのはこちら。「この地点を調べる」と共有している（2026-09-23）。 */
const LIST = "src/components/portal/PortalLinkList.tsx";
const SPOT = "src/components/relocation/SpotVerdict.tsx";
const AREA_PAGE = "src/app/houi/area/[code]/page.tsx";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("画面が台帳を迂回していない", () => {
  it("部品の中に生の外部 URL を書いていない", () => {
    /* 台帳の import と JSX だけ。suumo.jp / homes.co.jp の字面が出たら、
       それは台帳を通さずに組み立てている */
    for (const rel of [COMPONENT, LIST, SPOT]) {
      expect(read(rel), rel).not.toMatch(/https?:\/\/(www\.)?(suumo|homes)\./);
    }
  });

  it("組み立ても描き方も 1 つ（市区町村ページと「この地点を調べる」）", () => {
    /* 市区町村ページは台帳の portalLinksForCity を通して共有の部品に渡す。
       以前は suumoCitySearchUrl と portalLinksForPref を自分で組み合わせ、
       札も自前で描いていた */
    const page = read(COMPONENT);
    expect(page).toContain("portalLinksForCity(code)");
    expect(page).toContain("<PortalLinkList");
    expect(page).not.toMatch(/<a\b/);
    expect(read(SPOT)).toContain("<PortalLinkList");
    expect(read(SPOT)).not.toMatch(/<a\b[^>]*href=\{l(ink)?\.href\}/);
    /* 共有の部品は台帳を値で読まない（物件検索の頁の初期バンドル） */
    expect(read(LIST)).toMatch(/import type \{ PortalLink \}/);
    expect(read(LIST)).not.toMatch(
      /^import \{[^}]*\} from "@\/lib\/portalLinks"/m,
    );
  });

  it("市区町村の頁も、部品を通して出している", () => {
    const src = read(AREA_PAGE);
    expect(src).not.toMatch(/https?:\/\/(www\.)?(suumo|homes)\./);
    expect(src).toContain("CityPortalLinks");
  });

  it("誤認させないための一言が付いている", () => {
    /* HOME'S の規約:「提携または協力関係にあるものと誤認される…サイト
       からのリンクはお断りいたします」 */
    expect(read(COMPONENT)).toContain("PORTAL_LINK_DISCLAIMER");
    /* 描く側は受け取った断り書きを必ず出す（省略可能な引数にしない） */
    expect(read(LIST)).toMatch(/disclaimer: string;/);
    expect(PORTAL_LINK_DISCLAIMER).toContain("提携");
  });

  it("外部リンクは新しいタブ + 台帳の rel で開く", () => {
    const src = read(LIST);
    const anchors = src.match(/<a\b[\s\S]*?>/g) ?? [];
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(a, a).toContain('target="_blank"');
      /* rel は台帳の値をそのまま使う（字面で書き直さない） */
      expect(a, a).toMatch(/rel=\{link\.rel\}/);
    }
  });
});

describe("渡してよい先だけを作っている", () => {
  it("市区町村の URL は、許された組み立てからしか出ない", () => {
    /* 実在する市区町村を広く通す。壊れた入力は null になること */
    for (const a of AREAS.slice(0, 200)) {
      const url = suumoCitySearchUrl(a.code);
      if (!SUUMO_PERSONAL_SITE_EXCEPTION) {
        expect(url, a.full).toBeNull();
        continue;
      }
      expect(url, a.full).toContain(`&sc=${a.code}`);
      expect(url, a.full).toContain(`&ta=${a.code.slice(0, 2)}`);
    }
    for (const bad of ["", "1", "123456", "abcde", "13 103"]) {
      expect(suumoCitySearchUrl(bad), bad).toBeNull();
    }
  });

  it("旗を下ろすと、県のトップへ落ちる先しか残らない", () => {
    /* 組み立ては台帳の `portalLinksForCity` に寄せた（2026-09-23）。
       `suumoCitySearchUrl` が null（旗が false）なら県のリンクのまま
       残し、市区町村の URL で上書きしない */
    expect(read("src/lib/portalLinks.ts")).toMatch(
      /const cityUrl = suumoCitySearchUrl\(code\);[\s\S]*?cityUrl \?/,
    );
    /* null になったときの落ち先は台帳の URL だけ（壊れたコードで確かめる） */
    for (const l of portalLinksForCity("1310")) {
      expect(ALLOWED_PORTAL_URLS, l.href).toContain(l.href);
      expect(l.city, l.href).toBeUndefined();
    }
    /* 落ちる先は必ず許された一覧の中 */
    expect(ALLOWED_PORTAL_URLS.length).toBeGreaterThan(0);
    for (const u of ALLOWED_PORTAL_URLS) {
      expect(u, u).toMatch(/^https:\/\//);
    }
  });
});
