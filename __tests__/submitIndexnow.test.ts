import { describe, it, expect } from "vitest";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  changedCodes,
  explicitUrls,
  urlsFor,
} from "../scripts/submit_indexnow";

/**
 * IndexNow に送る URL の選び方。
 *
 * 送りすぎ（毎晩 1,000 頁）も、送り漏れ（動いた頁を落とす）も画面には
 * 出ない。検索エンジン側のログでしか分からないので、ここで固定する。
 */

const area = (code: string, count = 10) => ({
  code,
  lat: 35.0,
  lon: 139.0,
  count,
  sqmRent: 1000,
  medianRent: 50000,
});

/** 文章のある（index の）市区町村を 1 つ、無い（noindex の）ものを 1 つ */
const INDEXED = Object.keys(AREA_EDITORIAL)[0];
const NOINDEX = "13101"; // 千代田区。文章は無い

describe("IndexNow に送る URL", () => {
  it("前提: 検査に使う 2 つの区分が台帳と合っている", () => {
    expect(AREA_EDITORIAL[INDEXED]).toBeTruthy();
    expect(AREA_EDITORIAL[NOINDEX]).toBeUndefined();
  });

  it("値が動いていなければ 0 件", () => {
    const d = { areas: [area(INDEXED), area(NOINDEX)] };
    expect(changedCodes(d, d)).toEqual([]);
  });

  it("asOf だけ変わっても動いたことにしない", () => {
    // 毎晩変わる項目を見ると、毎晩 1,000 頁送ることになる
    const prev = { areas: [{ ...area(INDEXED), asOf: "2026-09-03" }] };
    const next = { areas: [{ ...area(INDEXED), asOf: "2026-09-04" }] };
    expect(changedCodes(prev, next)).toEqual([]);
  });

  it("件数・座標・相場のどれかが動けば拾う", () => {
    const base = area(INDEXED);
    for (const patch of [
      { count: 11 },
      { lat: 35.1 },
      { sqmRent: 1001 },
      { medianRent: 51000 },
    ]) {
      const prev = { areas: [base] };
      const next = { areas: [{ ...base, ...patch }] };
      expect(changedCodes(prev, next), JSON.stringify(patch)).toEqual([
        INDEXED,
      ]);
    }
  });

  it("新しく現れた市区町村も拾う", () => {
    expect(changedCodes({ areas: [] }, { areas: [area(INDEXED)] })).toEqual([
      INDEXED,
    ]);
  });

  it("noindex の市区町村頁は送らない。県頁は送る", () => {
    const urls = urlsFor([NOINDEX]);
    expect(urls).not.toContain(
      `https://cloud-palette.com/houi/area/${NOINDEX}`,
    );
    expect(urls).toContain("https://cloud-palette.com/houi/pref/13");
  });

  it("index の市区町村頁は、その県頁と一緒に送る", () => {
    const urls = urlsFor([INDEXED]);
    expect(urls).toContain(`https://cloud-palette.com/houi/area/${INDEXED}`);
    expect(urls).toContain(
      `https://cloud-palette.com/houi/pref/${INDEXED.slice(0, 2)}`,
    );
  });

  it("同じ県の市区町村が複数動いても県頁は 1 回", () => {
    const codes = Object.keys(AREA_EDITORIAL).filter((c) =>
      c.startsWith(INDEXED.slice(0, 2)),
    );
    const urls = urlsFor(codes);
    const prefUrls = urls.filter((u) => u.includes("/houi/pref/"));
    expect(prefUrls).toEqual([
      `https://cloud-palette.com/houi/pref/${INDEXED.slice(0, 2)}`,
    ]);
  });
});

/**
 * 明示して送る口（`--urls`）と、その置き場（2026-09-14）。
 *
 * ## なぜ足したか
 *
 * 呼び口が `scrape-rentals.yml` の中にしか無く、#1289 でその
 * `schedule:` を外したので **2026-09-13 以降 1 件も送られていない。**
 * 巡回を止めたこと自体は正しいのに、**関係の無い SEO の仕組みが巻き添えで
 * 止まった**（CLAUDE.md 3 節と同じ構図）。
 *
 * さらに `areaDirections.json` は凍結したので、差分の経路は今後 0 件の
 * まま。一方で頁の中身は変わる（#1303 は 1,022 頁に断りを足した）。
 * **送る手立てが 1 つも無かった。**
 */
describe("明示して送る URL", () => {
  it("カンマ区切りで受け取り、並べ替えて重複を落とす", () => {
    expect(
      explicitUrls([
        "--urls",
        "https://cloud-palette.com/b, https://cloud-palette.com/a ,https://cloud-palette.com/a",
      ]),
    ).toEqual(["https://cloud-palette.com/a", "https://cloud-palette.com/b"]);
  });

  it("よそのホストは通さない", () => {
    /* 鍵の持ち主が保証していない URL を送らない。IndexNow は host と key の
       対で受理するので、混ぜると送信そのものが弾かれうる */
    expect(
      explicitUrls([
        "--urls",
        "https://example.com/a,https://cloud-palette.com/b",
      ]),
    ).toEqual(["https://cloud-palette.com/b"]);
  });

  it("https 以外と壊れた値は落とす", () => {
    expect(
      explicitUrls([
        "--urls",
        "http://cloud-palette.com/a,ほげ,,  ,https://cloud-palette.com/ok",
      ]),
    ).toEqual(["https://cloud-palette.com/ok"]);
  });

  it("--urls が無ければ空（差分の経路に落ちる）", () => {
    expect(explicitUrls([])).toEqual([]);
    expect(explicitUrls(["--apply"])).toEqual([]);
    expect(explicitUrls(["--urls"])).toEqual([]);
  });
});

describe("置き場", () => {
  const wf = (name: string) =>
    readFileSync(join(process.cwd(), ".github/workflows", name), "utf8");

  it("止まっているワークフローの外に口がある", () => {
    /* scrape-rentals.yml は schedule を外してあるので、そこだけに口が
       あると誰も送れない */
    const indexnow = wf("indexnow.yml");
    expect(indexnow).toContain("workflow_dispatch:");
    expect(indexnow).toContain("submit_indexnow.ts");
  });

  it("定時では回さない（変わっていない頁を毎晩送らない）", () => {
    /* スクリプトの註のとおり、1,000 頁を routine で送ると無視されるか
       悪印象になる。送ってよいのは人が判断したときだけ */
    const indexnow = wf("indexnow.yml");
    expect(indexnow).not.toMatch(/^\s*schedule:/m);
    expect(indexnow).not.toContain("cron");
  });

  it("既定は dry-run（押し間違いで送らない）", () => {
    expect(wf("indexnow.yml")).toContain("default: false");
  });

  it("巡回側の口は残してある（再開したら自動で動く）", () => {
    expect(wf("scrape-rentals.yml")).toContain("submit_indexnow.ts");
  });
});
