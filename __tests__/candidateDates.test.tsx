import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  CandidateDates,
  topCandidateDates,
} from "@/components/relocation/CandidateDates";
import type { DayVerdict } from "@/utils/auspiciousDays";

const day = (date: string, patch: Partial<DayVerdict> = {}) =>
  ({
    date,
    isTripleAuspicious: true,
    dayLayer: "OPTIMAL",
    blockedByTenchusatsu: false,
    ...patch,
  }) as DayVerdict;
const props = {
  birthDate: "1990-05-15",
  lon: 135.5,
  ready: true,
  directionFilterMode: "composite",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("keeps three distinct earliest qualifying dates and merges their directions", () => {
  expect(
    topCandidateDates(
      [
        {
          directionLabel: "北",
          days: [
            day("2026-11-10"),
            day("2026-11-05"),
            day("2026-11-04"),
            day("2026-11-06"),
            day("2026-11-07", { blockedByTenchusatsu: true }),
            day("2026-11-01"),
            day("2027-01-01"),
            day("2026-11-08", { dayLayer: "SAFE" }),
            day("2026-11-09", { isTripleAuspicious: false }),
          ],
        },
        { directionLabel: "東", days: [day("2026-11-04")] },
      ],
      "2026-11-04",
      "2026-12-31",
    ),
  ).toEqual([
    { date: "2026-11-04", directions: ["北", "東"] },
    { date: "2026-11-05", directions: ["北"] },
    { date: "2026-11-06", directions: ["北"] },
  ]);
});
it("uses the page profile and a 60-day JST window without new inputs", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T16:00:00Z"));
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      summaries: [{ directionLabel: "北", days: [day("2026-11-05")] }],
    }),
  });
  vi.stubGlobal("fetch", fetch);
  const { container } = render(<CandidateDates {...props} />);
  expect(container.querySelector("input,select")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "候補日を出す" }));
  await screen.findByText("2026-11-05");
  const params = new URL(fetch.mock.calls[0][0], "https://example.test")
    .searchParams;
  expect(Object.fromEntries(params)).toMatchObject({
    birthDate: props.birthDate,
    lon: "135.5",
    from: "2026-11-04",
    to: "2027-01-02",
    scope: "triple",
  });
});
it("does not calculate sample data and clears results when the profile changes", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ summaries: [] }) }),
  );
  const { rerender } = render(<CandidateDates {...props} ready={false} />);
  expect(screen.getByRole("button")).toBeDisabled();
  rerender(<CandidateDates {...props} />);
  fireEvent.click(screen.getByRole("button"));
  await screen.findByText(/条件に合う候補日がありません/);
  rerender(<CandidateDates {...props} birthDate="1991-01-01" />);
  expect(screen.queryByText(/条件に合う候補日がありません/)).toBeNull();
});
it("shows a retryable error and ignores a response from an old profile", async () => {
  let resolve!: (value: unknown) => void;
  const fetch = vi
    .fn()
    .mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    )
    .mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch", fetch);
  const { rerender } = render(<CandidateDates {...props} />);
  fireEvent.click(screen.getByRole("button"));
  rerender(<CandidateDates {...props} lon={140} />);
  resolve({ ok: true, json: async () => ({ summaries: [] }) });
  await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button"));
  await screen.findByText(/もう一度お試しください/);
  expect(screen.queryByText(/条件に合う候補日がありません/)).toBeNull();
});

it.each([
  { blockedByTenchusatsu: true },
  { isTripleAuspicious: false },
  { dayLayer: "SAFE" },
  { dayLayer: "NOISE_HA" },
  { date: "2026-11-03" },
  { date: "2027-01-03" },
])("excludes an ineligible date (%j)", (patch) => {
  expect(
    topCandidateDates(
      [{ directionLabel: "北", days: [day("2026-11-04", patch)] }],
      "2026-11-04",
      "2027-01-02",
    ),
  ).toEqual([]);
});
