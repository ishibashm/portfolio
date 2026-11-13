// @vitest-environment node
import { expect, it, vi } from "vitest";
import * as directions from "@/lib/mcpDirections";
import { findRelocationWindows } from "@/lib/relocationWindows";

it("expires after six hours, refreshes LRU hits, and evicts beyond 50 entries", () => {
  const input = { birthDate: "1979-11-17", lon: 135.5, from: "2026-11-14", days: 30 };
  const built = directions.buildBase(input);
  if (!built.ok) throw new Error(built.error);
  const sample = directions.calculateMcpDirectionsDay(built, new Date("2026-11-14T12:00:00+09:00"), "relocation");
  // Cache mechanics need call counts, not another 1,500 days of astronomy.
  const spy = vi.spyOn(directions, "calculateMcpDirectionsDay").mockReturnValue(sample);
  const now = new Date("2026-11-14T00:00:00Z");
  const scan = (lon: number, at = now) => findRelocationWindows({ ...input, lon }, at);
  try {
    expect(scan(135.5).ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(30);
    const hit = scan(135.5);
    if (!hit.ok) throw new Error(hit.error);
    hit.payload.windows.length = 0;
    const again = scan(135.5);
    if (!again.ok) throw new Error(again.error);
    expect(again.payload.windows.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledTimes(30);
    scan(135.5, new Date(now.getTime() + 6 * 3600000 - 1));
    expect(spy).toHaveBeenCalledTimes(30);
    scan(135.5, new Date(now.getTime() + 6 * 3600000));
    expect(spy).toHaveBeenCalledTimes(60);
    const later = new Date(now.getTime() + 6 * 3600000);
    for (let i = 0; i < 49; i++) scan(122 + i / 100, later);
    scan(135.5, later); // Promote the original entry to most recently used.
    scan(123, later); // Entry 51 evicts longitude 122.
    spy.mockClear();
    scan(135.5, later);
    expect(spy).not.toHaveBeenCalled();
    scan(122, later);
    expect(spy).toHaveBeenCalledTimes(30);
  } finally {
    spy.mockRestore();
  }
});
