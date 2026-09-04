import { describe, expect, it } from "vitest";
import { activeNavHref, CORE_ROUTES } from "@/lib/siteStructure";

/**
 * サイドバーで点灯させる 1 つを選ぶ。
 *
 * 利用者の報告（2026-09-04）：「タブが 2 つ選ばれてるのはバグ？」。
 * `/houi/fengshui` を開くと「本命星と吉方位を調べる」（/houi）と
 * 「風水（八宅）で吉方位を調べる」（/houi/fengshui）が両方点いていた。
 */

const HREFS = ["/", "/houi", "/houi/fengshui", "/houi/area", "/calendar"];

describe("点灯するのは 1 つだけ", () => {
  it("入れ子の頁では、いちばん長く一致したものを選ぶ", () => {
    expect(activeNavHref("/houi/fengshui", HREFS)).toBe("/houi/fengshui");
    expect(activeNavHref("/houi", HREFS)).toBe("/houi");
  });

  it("市区町村ページは「吉方位にある街を調べる」に付く", () => {
    /* ここも 2 つ点いていた（/houi と /houi/area）。1,022 枚ある */
    expect(activeNavHref("/houi/area/13101", HREFS)).toBe("/houi/area");
  });

  it("項目の並び順に左右されない", () => {
    /* 長さで選ぶので、配列の順で答えが変わってはいけない */
    const reversed = [...HREFS].reverse();
    expect(activeNavHref("/houi/area/13101", reversed)).toBe("/houi/area");
    expect(activeNavHref("/houi/fengshui", reversed)).toBe("/houi/fengshui");
  });

  it("該当が無ければ何も点けない", () => {
    expect(activeNavHref("/about", HREFS)).toBeNull();
    expect(activeNavHref(null, HREFS)).toBeNull();
    expect(activeNavHref(undefined, HREFS)).toBeNull();
  });
});

describe("前方一致は区切りで見る", () => {
  it("途中で切れた一致は取らない", () => {
    /* startsWith だけだと /houika が /houi に一致してしまう */
    expect(activeNavHref("/houika", HREFS)).toBeNull();
    expect(activeNavHref("/calendarium", HREFS)).toBeNull();
  });

  it("区切りの先まで含めた一致は取る", () => {
    expect(activeNavHref("/calendar/2026", HREFS)).toBe("/calendar");
  });
});

describe("ホームは例外", () => {
  it("まるごと同じときだけ点く", () => {
    /* 前方一致を許すと、すべての頁で点いてしまう */
    expect(activeNavHref("/", HREFS)).toBe("/");
    expect(activeNavHref("/houi", HREFS)).not.toBe("/");
    expect(activeNavHref("/about", HREFS)).toBeNull();
  });
});

describe("実際のナビに当てる", () => {
  const hrefs = CORE_ROUTES.map((r) => r.href);

  it("入れ子になっている項目が実在する（この検査が空回りしていない）", () => {
    const nested = hrefs.filter((h) =>
      hrefs.some((other) => other !== h && h.startsWith(`${other}/`)),
    );
    expect(nested.length).toBeGreaterThan(0);
  });

  it("どの項目を開いても、点くのはその項目だけ", () => {
    for (const href of hrefs) {
      expect(activeNavHref(href, hrefs), href).toBe(href);
    }
  });
});
