import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePlaceName } from "@/lib/placeLabel";

afterEach(() => vi.unstubAllGlobals());

it("does not show the previous profile's municipality while resolving new coordinates", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("lat=35.01")) {
        return {
          ok: true,
          json: async () => ({ data: { name: "京都府京都市中京区" } }),
        };
      }
      return new Promise(() => {});
    }),
  );
  const { result, rerender } = renderHook(
    ({ lat, lon }) => usePlaceName(lat, lon),
    { initialProps: { lat: 35.01, lon: 135.75 } },
  );
  await waitFor(() => expect(result.current).toBe("京都府京都市中京区 付近"));
  rerender({ lat: 35.165, lon: 136.905 });
  expect(result.current).toBe("北緯 35.165 / 東経 136.905");
});
