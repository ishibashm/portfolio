import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";

const CANDIDATE_CONTEXT = {
  birthDate: "1990-01-10",
  targetDate: "2026-10-05",
  baseLat: "35.6895",
  baseLon: "139.6917",
  tenchusatsuMode: "strict",
  involuntaryMove: false,
  directionFilterMode: "composite",
  useClassical: true,
} as const;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("SpotVerdict address / station form and Gmail removal", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("renders input[name=q] inside a GET search form and shows station note only in candidateContext", () => {
    const { rerender } = render(
      <SpotVerdict baseLat={35.6895} baseLon={139.6917} useClassical />,
    );
    const input = screen.getByRole("textbox", {
      name: "住所・駅名・座標から調べる（物件URLも可）",
    }) as HTMLInputElement;
    expect(input.getAttribute("name")).toBe("q");
    const form = input.closest("form");
    expect(form).not.toBeNull();
    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.getAttribute("action")).toBe(
      "/relocation/arbitrage#candidate-import",
    );
    expect(form?.getAttribute("role")).toBe("search");
    const submit = screen.getByRole("button", { name: "調べる" });
    expect(submit.getAttribute("type")).toBe("submit");
    expect(
      screen.queryByText(
        "駅名は同じ名前の駅が別の場所にあることがあります。ピンの位置を確かめてください。",
      ),
    ).toBeNull();

    rerender(
      <SpotVerdict
        baseLat={35.6895}
        baseLon={139.6917}
        useClassical
        candidateContext={CANDIDATE_CONTEXT}
      />,
    );
    expect(
      screen.getByText(
        "駅名は同じ名前の駅が別の場所にあることがあります。ピンの位置を確かめてください。",
      ),
    ).toBeInTheDocument();
  });

  it("reads ?q=... on mount and triggers a geocoder fetch (including anonymous 401 fallback)", async () => {
    window.history.replaceState(
      {},
      "",
      `/relocation/arbitrage?q=${encodeURIComponent("吉祥寺駅")}`,
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (String(url) === "/api/relocation/candidates/geocode") {
          return new Response(
            JSON.stringify({ error: "候補の保存にはログインが必要です。" }),
            { status: 401 },
          );
        }
        if (String(url).startsWith("/api/geocode?q=")) {
          return new Response(
            JSON.stringify({
              lat: 35.7031,
              lon: 139.5798,
              name: "東京都武蔵野市吉祥寺南町",
              source: "station",
            }),
          );
        }
        return new Response("{}", { status: 404 });
      });

    render(
      <SpotVerdict
        baseLat={35.6895}
        baseLon={139.6917}
        useClassical
        candidateContext={CANDIDATE_CONTEXT}
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "住所・駅名・座標から調べる（物件URLも可）",
    }) as HTMLInputElement;
    expect(input.value).toBe("吉祥寺駅");

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        `/api/geocode?q=${encodeURIComponent("吉祥寺駅")}`,
        { cache: "no-store" },
      ),
    );
    expect(
      await screen.findByRole("link", {
        name: "成約価格・地価を見る（国交省の公開データ）",
      }),
    ).toHaveAttribute("href", "/relocation/purchase");
  });

  it("updates ?q= via history.replaceState on successful form submit, preserves other params and hash, deletes q when empty, and skips requestedPoint", async () => {
    window.history.replaceState(
      {},
      "",
      "/relocation/arbitrage?targetDate=2026-10-05#candidate-import",
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).startsWith("/api/geocode?q=")) {
        return new Response(
          JSON.stringify({
            lat: 35.7031,
            lon: 139.5798,
            name: "東京都武蔵野市吉祥寺南町",
            source: "station",
          }),
        );
      }
      return new Response("{}", { status: 404 });
    });

    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    const { rerender } = render(
      <SpotVerdict baseLat={35.6895} baseLon={139.6917} useClassical />,
    );

    const input = screen.getByRole("textbox", {
      name: "住所・駅名・座標から調べる（物件URLも可）",
    }) as HTMLInputElement;
    const submit = screen.getByRole("button", { name: "調べる" });

    fireEvent.change(input, { target: { value: "  吉祥寺駅  " } });
    fireEvent.click(submit);

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("q")).toBe("吉祥寺駅");
      expect(params.get("targetDate")).toBe("2026-10-05");
      expect(window.location.hash).toBe("#candidate-import");
    });

    replaceStateSpy.mockClear();
    rerender(
      <SpotVerdict
        baseLat={35.6895}
        baseLon={139.6917}
        useClassical
        requestedPoint={{ lat: 35.0116, lon: 135.7681, seq: 1 }}
      />,
    );
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("q")).toBe(
      "吉祥寺駅",
    );

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(submit);
    const afterClear = new URLSearchParams(window.location.search);
    expect(afterClear.has("q")).toBe(false);
    expect(afterClear.get("targetDate")).toBe("2026-10-05");
    expect(window.location.hash).toBe("#candidate-import");
  });

  it("no file under src/ imports lib/gmail and src/app/api/relocation/email/gmail does not exist", () => {
    expect(
      existsSync(join(process.cwd(), "src/app/api/relocation/email/gmail")),
    ).toBe(false);
    expect(existsSync(join(process.cwd(), "src/lib/gmail"))).toBe(false);
    for (const file of listSourceFiles(join(process.cwd(), "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("lib/gmail");
    }
  });
});
