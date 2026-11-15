import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import HouiPage from "@/app/houi/page";

vi.mock("@/components/houi/HonmeiLookup", () => ({
  HonmeiLookup: () => <div data-testid="honmei-lookup-mock" />,
}));
vi.mock("@/components/houi/MagneticCompass", () => ({
  MagneticCompass: () => <div data-testid="magnetic-compass-mock" />,
}));
vi.mock("@/components/ads/AdBanner", () => ({
  AdBanner: () => null,
}));
vi.mock("@/components/profile/ActiveProfileBadge", () => ({
  ActiveProfileBadge: () => <div data-testid="active-profile-badge-mock" />,
}));

describe("/houi 冒頭の説明と調べ方手順", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("結論先出し・6手順・免責注記・既存導線が生まれ年早見表より前にあり、禁止表現を含まない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00+09:00"));

    const html = renderToStaticMarkup(<HouiPage />);

    // 1) 結論先出し・免責注記・2026年の共通凶（表示ラベルどおり）
    expect(html).toContain("吉方位の調べ方（先に結論）");
    expect(html).toContain(
      "占い上の目安であり、科学的な効果を保証するものではない",
    );
    expect(html).toContain(
      "2026年の年盤では、本命星に関係なく南が「五黄殺」、北が「暗剣殺」と表示されます。",
    );
    expect(html).not.toContain("北が暗剣殺と歳破");

    // 2) 既存導線（/relocation/timing, /calendar, /guide/honmei）
    expect(html).toContain('href="/relocation/timing"');
    expect(html).toContain('href="/calendar"');
    expect(html).toContain('href="/guide/honmei"');

    // 3) 冒頭説明と手順が生まれ年の早見表・HonmeiLookup より前に置かれている
    const introIdx = html.indexOf("吉方位の調べ方（先に結論）");
    const tableIdx = html.indexOf("1950 / ");
    const lookupIdx = html.indexOf("honmei-lookup-mock");
    expect(introIdx).toBeGreaterThan(-1);
    expect(introIdx).toBeLessThan(tableIdx);
    expect(tableIdx).toBeLessThan(lookupIdx);

    // 4) 禁止表現を含まない
    for (const forbidden of [
      "生年月日を入れるだけ",
      "登録不要",
      "今年と今月の吉方位を同じ画面で見られる",
      "最安",
      "全国対応",
      "ランキング",
      "30度",
      "60度",
      "45度",
      "9で割",
      "11から引",
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("2027年では共通の凶に北（五黄殺）・南（暗剣殺）・北東（歳破）が動的に出る", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-06-01T00:00:00+09:00"));

    const html = renderToStaticMarkup(<HouiPage />);
    expect(html).toContain(
      "2027年の年盤では、本命星に関係なく北が「五黄殺」、南が「暗剣殺」、北東が「歳破」と表示されます。",
    );
  });
});
