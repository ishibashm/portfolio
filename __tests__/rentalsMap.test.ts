import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 地図に置く物件ピン。
 *
 * MagneticMapInner には最初から物件ピンを描く実装があり、SolarTimeClock
 * には「☐ 全物件表示 / ☑ 新築のみ表示」の切替も、/api/rentals/map も
 * あった。繋がっていなかったのは取得の 1 本だけで、mapProperties は
 * setter を一度も呼ばれず常に空。切替を押しても、何も無いものを
 * 絞り込んでいた。
 *
 * 繋ぐにあたって route 側で 3 つ決めた。ここで固定する。
 */

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { rental_properties: { findMany } },
}));

import { GET } from "@/app/api/rentals/map/route";

const call = (qs: string) =>
  GET(new Request(`http://localhost/api/rentals/map${qs}`));

describe("/api/rentals/map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
  });

  it("座標のある物件だけを引く", async () => {
    await call("");
    const args = findMany.mock.calls[0][0];
    expect(args.where.lat).toEqual({ not: null });
    expect(args.where.lon).toEqual({ not: null });
  });

  it("掲載が終わった物件を出さない", async () => {
    // expire_date を過ぎたリンクは 404 になる。スキャナーは既に外して
    // いるので、地図だけ古いものを出す状態にしない。
    await call("");
    const or = findMany.mock.calls[0][0].where.OR;
    expect(or[0]).toEqual({ expire_date: null });
    expect(or[1].expire_date.gte).toBeInstanceOf(Date);
  });

  it("地図が読まない列を返さない", async () => {
    // 全スカラー列を返していたので source_emails まで出ていた。
    await call("");
    const select = findMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual([
      "address",
      "id",
      "is_new_build",
      "lat",
      "lon",
      "property_name",
      "rent",
      "url",
    ]);
    expect(select).not.toHaveProperty("source_emails");
  });

  it("件数に上限を置く（公開ページから叩ける）", async () => {
    await call("?limit=999999");
    expect(findMany.mock.calls[0][0].take).toBe(2000);

    findMany.mockClear();
    await call("?limit=0");
    expect(findMany.mock.calls[0][0].take).toBe(1);

    findMany.mockClear();
    await call("?limit=abc");
    expect(findMany.mock.calls[0][0].take).toBe(500);

    findMany.mockClear();
    await call("?limit=300");
    expect(findMany.mock.calls[0][0].take).toBe(300);
  });

  it("DB が落ちても 500 を返して例外を投げない", async () => {
    findMany.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await call("");
    expect(res.status).toBe(500);
  });

  it("引けたぶんをそのまま返す", async () => {
    findMany.mockResolvedValue([
      {
        id: "a",
        lat: 35.6,
        lon: 139.7,
        property_name: "テスト物件",
        rent: 85000,
        address: "東京都新宿区",
        is_new_build: true,
        url: "https://example.com/1",
      },
    ]);
    const res = await call("");
    const json = await res.json();
    expect(json).toHaveLength(1);
    // 地図が読む列が揃っていること。
    expect(json[0].lat).toBe(35.6);
    expect(json[0].property_name).toBe("テスト物件");
  });
});

describe("画面への配線", () => {
  const src = readFileSync(
    join(process.cwd(), "src", "components", "SolarTimeClock.tsx"),
    "utf8",
  )
    .split("\r\n")
    .join("\n");
  // 地図の描画側はタブ分割（3/3）で home/DestinationMapPanel へ移った。
  // 取得の効率（fetch の門番）は親、渡し方（表示条件）はパネルが持つ。
  const panelSrc = readFileSync(
    join(process.cwd(), "src", "components", "home", "DestinationMapPanel.tsx"),
    "utf8",
  )
    .split("\r\n")
    .join("\n");

  it("押した人にだけ取りに行く（公開ホームなので既定では引かない）", () => {
    expect(src).toContain('fetch("/api/rentals/map?limit=500")');
    expect(src).toContain(
      "const [showProperties, setShowProperties] = useState(false);",
    );
  });

  it("一度取ったら使い回す", () => {
    expect(src).toContain(
      "if (!showProperties || mapProperties.length > 0 || propertiesLoading) {",
    );
  });

  it("出していないときは地図に渡さない", () => {
    // 字下げは整形で変わる（実際に prettier で変わって CI が落ちた）ので、
    // 空白に寛容な形で「出していないなら空配列を渡す」だけを見る。
    expect(panelSrc).toMatch(/!showProperties\s*\?\s*\[\]/);
  });

  it("空のものを絞り込む選択肢を見せない", () => {
    expect(panelSrc).toContain("{showProperties && (");
  });
});
