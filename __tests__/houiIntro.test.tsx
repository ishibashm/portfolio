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

    const [beforeTable] = html.split('<section id="honmei-lookup"');
    const introMatch = beforeTable.match(
      /<section aria-labelledby="houi-intro-heading"[\s\S]*?<\/section>/,
    );
    expect(introMatch).not.toBeNull();
    const intro = introMatch![0];
    const [conclusion, steps] = intro.split(
      "このサイトでの調べ方の手順（入力なしで確認できます）",
    );

    // 免責と共通の凶は、最初の折りたたみより前に表示する。
    expect(conclusion).not.toContain("<details");
    expect(conclusion).toContain("吉方位の調べ方（先に結論）");
    expect(conclusion).toContain(
      "占い上の目安であり、科学的な効果を保証するものではない",
    );
    expect(conclusion).toContain(
      "2026年の年盤では、本命星に関係なく南が「五黄殺」、北が「暗剣殺」と表示されます。",
    );
    expect(html).not.toContain("北が暗剣殺と歳破");
    expect(conclusion).toContain("無料・入力なしで早見表を見られます");
    expect(conclusion).toContain("端末内の計算だけで本命星がわかります");
    expect(conclusion).toContain(
      "今年と今月の吉方位は、本命星別ページで確認できます",
    );
    for (let s = 1; s <= 9; s++) {
      expect(conclusion).toContain(`href="/houi/2026/${s}"`);
    }

    expect(steps).toBeDefined();
    expect(steps.match(/<li>/g)).toHaveLength(6);
    expect(steps).toContain("立春当日は出生時刻で分かれます");
    for (const href of [
      "/houi/area",
      "/relocation/arbitrage",
      "/relocation/timing",
      "/calendar",
      "/guide/honmei",
    ]) {
      expect(steps).toContain(`href="${href}"`);
    }

    const tableIdx = html.indexOf("1950 / ");
    const lookupIdx = html.indexOf("honmei-lookup-mock");
    expect(beforeTable.length).toBeLessThan(tableIdx);
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
