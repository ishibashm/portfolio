import { StrictMode, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
const route = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => route }));
import {
  CandidateEmailImport,
  EmailListingDraftProvider,
} from "@/components/relocation/EmailListingDraft";
import { GmailFeature } from "@/components/relocation/GmailFeature";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";
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
function Navigation() {
  const [destination, setDestination] = useState(false);
  route.push.mockImplementation(() => setDestination(true));
  return (
    <EmailListingDraftProvider>
      <GmailFeature enabled>
        {destination ? (
          <SpotVerdict
            baseLat={35}
            baseLon={135}
            useClassical
            candidateContext={context}
          />
        ) : (
          <CandidateEmailImport />
        )}
      </GmailFeature>
    </EmailListingDraftProvider>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("moves only selected fields from candidate history to confirmation in memory, once in StrictMode", async () => {
  const address = "架空県試験市見本町1-2";
  const storage = vi.spyOn(Storage.prototype, "setItem");
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url) => {
      const path = String(url);
      expect(path.startsWith("/api/")).toBe(true);
      const id = "11111111-2222-4333-8444-555555555555";
      const body = path.endsWith("/status")
        ? {
            connections: [
              { id, labelId: "Label_1", startedAt: "2026-09-25T00:00:00.000Z" },
            ],
          }
        : path.includes("labels?")
          ? { labels: [{ id: "Label_1", name: "物件通知" }] }
          : path.endsWith("/read")
            ? {
                urls: ["https://suumo.jp/a"],
                listings: [
                  { url: "https://suumo.jp/a", propertyName: "合成A", address },
                ],
                nextCursor: null,
                truncated: false,
              }
            : path.endsWith("/geocode")
              ? { lat: 35.4, lon: 135.5, source: "gsi" }
              : {};
      return new Response(JSON.stringify(body));
    });
  render(
    <StrictMode>
      <Navigation />
    </StrictMode>,
  );
  await screen.findByText((content, element) => {
    return (
      element?.tagName === "P" &&
      content.includes("対象ラベル:") &&
      element.textContent?.includes("物件通知")
    );
  });
  fireEvent.click(screen.getByRole("button", { name: "取り込み" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "https://suumo.jp/a を既存入力へ",
    }),
  );
  await waitFor(() =>
    expect(
      fetch.mock.calls.filter(([url]) =>
        String(url).endsWith("/candidates/geocode"),
      ),
    ).toHaveLength(1),
  );
  expect(route.push).toHaveBeenCalledWith(
    "/relocation/arbitrage#candidate-import",
  );
  expect(
    screen.getByRole("textbox", { name: "物件URL・住所・座標から調べる" }),
  ).toHaveValue(address);
  expect(storage).not.toHaveBeenCalled();
  expect(window.location.href).not.toContain(encodeURIComponent(address));
});
