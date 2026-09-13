import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ESTAT_API_CREDIT } from "@/lib/estatCredit";

/**
 * e-Stat の **API 機能の利用規約が求めるクレジット表示**が、e-Stat の
 * API で取ったデータを出している頁に、規約の文言のまま載っていること。
 *
 * 富裕度（/relocation/wealth）は import_municipalities_wealth.ts が
 * e-Stat の API（統計でみる市区町村のすがた）で取った所得データなのに、
 * 2026-09-11 までサイトのどこにもこの表示が無かった（backlog 26 節）。
 * 文言は規約が指定しているので、言い換えると満たさなくなる。
 *
 * 表示場所は「利用される方が参照できる場所」なら自由（規約）。
 * e-Stat の API で取ったデータを新しく出す頁を足したら、ここに足す。
 */

const PAGES_USING_ESTAT_API = [
  "src/app/relocation/wealth/page.tsx",
  /* 方位別の家賃・空き家率の札。文言は API の meta.credit をそのまま
     出す。route は文言を lib/estatCredit から引く（route ファイルは
     route 以外の名前を export できないので、実体はそちらにある） */
  "src/app/api/housing-stats/by-direction/route.ts",
];

describe("e-Stat の API のクレジット表示", () => {
  for (const source of PAGES_USING_ESTAT_API) {
    it(`${source} に規約の文言がそのまま載っている`, () => {
      const page = readFileSync(join(process.cwd(), source), "utf8");
      /* 文言をそのまま書いているか、lib/estatCredit から引いているか */
      const usesCredit =
        page.includes(ESTAT_API_CREDIT) ||
        page.includes('from "@/lib/estatCredit"');
      expect(usesCredit).toBe(true);
      /* 出典の記載（サイト規約 1-ア）と加工の明記（1-イ）も同じ頁に */
      expect(page).toContain("出典：政府統計の総合窓口(e-Stat)");
      expect(page).toContain("を加工して作成");
    });
  }
});
