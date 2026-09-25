import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Layout from "@/app/relocation/arbitrage/layout";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";
import { computeDayKigaku } from "@/lib/dayKigakuClient";
const context = {
  birthDate: "1990-01-10",
  targetDate: "2026-10-05",
  baseLat: "35",
  baseLon: "135",
  tenchusatsuMode: "strict",
  involuntaryMove: false,
  directionFilterMode: "composite",
  useClassical: true,
} as const;
const id = "11111111-2222-4333-8444-555555555555";
const listing = {
  url: "https://suumo.jp/a",
  propertyName: "合成ハイツA",
  address: "架空県見本市試験町1-2",
  rentYen: 72000,
  managementFeeYen: 3000,
  layout: "1LDK",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it.each([true, false])(
  "only the chosen listing is geocoded; confirmation required (GSI available=%s)",
  async (enabled) => {
    vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, init) => {
        const path = String(url);
        expect(path.startsWith("/api/")).toBe(true);
        let body: unknown = {};
        let status = 200;
        if (path.endsWith("/status"))
          body = {
            connections: [
              { id, labelId: "Label_1", startedAt: "2026-09-25T00:00:00.000Z" },
            ],
          };
        else if (path.includes("/labels?"))
          body = { labels: [{ id: "Label_1", name: "物件通知" }] };
        else if (path.endsWith("/read"))
          body = {
            urls: [listing.url, "https://suumo.jp/b"],
            listings: [
              listing,
              { url: "https://suumo.jp/b", address: "別の架空住所" },
            ],
            truncated: false,
            nextCursor: null,
          };
        else if (path.endsWith("/candidates/geocode")) {
          expect(JSON.parse(String(init?.body))).toEqual({
            address: listing.address,
          });
          body = enabled
            ? { lat: 35.4, lon: 135.5, source: "gsi", approximate: true }
            : { error: "住所検索は準備中です。地図をクリックしてください。" };
          status = enabled ? 200 : 503;
        } else if (path.endsWith("/duplicates")) body = { count: 0 };
        else if (path.endsWith("/candidates")) body = { candidate: { id } };
        else expect(path.startsWith("/api/geocode/reverse?")).toBe(true);
        return new Response(JSON.stringify(body), { status });
      });
    render(
      <Layout>
        <SpotVerdict
          baseLat={35}
          baseLon={135}
          useClassical
          candidateContext={context}
          dirKigaku={computeDayKigaku(context)!.byDirection}
          onFocus={vi.fn()}
        />
      </Layout>,
    );
    await screen.findByText((content, element) => {
      return (
        element?.tagName === "P" &&
        content.includes("対象ラベル:") &&
        element.textContent?.includes("物件通知")
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "取り込み" }));
    await screen.findByText("合成ハイツA");
    expect(
      fetch.mock.calls.some(([url]) => String(url).endsWith("/geocode")),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: `${listing.url} を既存入力へ` }),
    );
    if (!enabled) {
      await screen.findByText(/住所検索は準備中/);
      expect(
        screen.queryByRole("button", { name: "候補履歴に保存" }),
      ).not.toBeInTheDocument();
    } else {
      const save = await screen.findByRole("button", {
        name: "候補履歴に保存",
      });
      expect(save).toBeDisabled();
      expect(screen.getByLabelText("物件名")).toHaveValue("合成ハイツA");
      expect(screen.getByLabelText("賃料（円）")).toHaveValue(72000);
      fireEvent.change(screen.getByLabelText("賃料（円）"), {
        target: { value: "71000" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "地図で所在地を確認する" }),
      );
      fireEvent.click(
        screen.getByRole("checkbox", { name: /地図の所在地を確認しました/ }),
      );
      fireEvent.click(save);
      await waitFor(() =>
        expect(
          fetch.mock.calls.some(
            ([url]) => String(url) === "/api/relocation/candidates",
          ),
        ).toBe(true),
      );
      const saved = fetch.mock.calls.find(
        ([url]) => String(url) === "/api/relocation/candidates",
      )!;
      expect(JSON.parse(String(saved[1]?.body))).toMatchObject({
        url: listing.url,
        details: {
          propertyName: listing.propertyName,
          address: listing.address,
          rentYen: 71000,
        },
        target: { confirmed: true, approximate: true },
      });
    }
    expect(
      fetch.mock.calls.filter(([url]) =>
        String(url).endsWith("/candidates/geocode"),
      ),
    ).toHaveLength(1);
    expect(storage).not.toHaveBeenCalled();
  },
);
