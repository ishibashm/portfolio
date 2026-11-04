import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { HonmeiStarLinks } from "@/components/houi/HonmeiStarLinks";
import { PurposeLinks } from "@/components/home/PurposeLinks";
import { TapTooltip } from "@/components/home/TapTooltip";
import { BirthYearPicker } from "@/components/inputs/QuickChoices";
import { TenchusatsuChecker } from "@/components/houi/TenchusatsuChecker";
import { ArticleToolCta } from "@/components/blog/ArticleToolCta";
import { loadSettings, readSettingsSync } from "@/lib/userSettings";
import { tenchusatsuForCivilDate } from "@/utils/tenchusatsuCore";

vi.mock("@/lib/userSettings", () => ({
  loadSettings: vi.fn(),
  readSettingsSync: vi.fn(),
  settingString: (settings: Record<string, unknown>, key: string) =>
    typeof settings[key] === "string" ? settings[key] : undefined,
}));
vi.mock("@/components/guide/GuideCharacter", () => ({ default: () => null }));

const timeline = {
  today: "2026-11-04",
  year: 2026,
  yearNumber: 2026,
  yearBranch: "午",
  monthBranch: "戌",
  months: [],
};
beforeEach(() => {
  vi.mocked(readSettingsSync).mockReturnValue({});
  vi.mocked(loadSettings).mockResolvedValue({
    settings: {},
    source: "local",
  } as unknown as Awaited<ReturnType<typeof loadSettings>>);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("トップと吉方位一覧は当年の数値スラッグ9件へ直接つながる", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-31T15:00:00Z"));
  render(<HonmeiStarLinks />);
  const links = within(
    screen.getByRole("navigation", { name: "2027年の本命星別吉方位" }),
  ).getAllByRole("link");
  expect(links).toHaveLength(9);
  links.forEach((link, i) =>
    expect(link).toHaveAttribute("href", `/houi/2027/${i + 1}`),
  );
  expect(screen.getByRole("link", { name: "五黄土星" })).toHaveAttribute(
    "href",
    "/houi/2027/5",
  );
  for (const file of ["src/app/page.tsx", "src/app/houi/page.tsx"]) {
    expect(readFileSync(file, "utf8")).toContain("<HonmeiStarLinks");
    expect(readFileSync(file, "utf8")).toContain("revalidate = 60");
  }
});

it("トップの目的ボタンはチャットを経由せず4つの道具を開く", () => {
  render(<PurposeLinks />);
  const links = screen.getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/houi/today",
    "/relocation/dashboard",
    "/houi/tenchusatsu",
    "/houi",
  ]);
  const home = readFileSync("src/app/page.tsx", "utf8");
  expect(home).toContain("<PurposeLinks");
  expect(home).not.toContain("AgentEntry");
  expect(home).not.toContain('href="/ask');
  expect(readFileSync("src/app/ask/page.tsx", "utf8")).toBeTruthy();
});

it("2020年代から2020〜2029年をボタンで選べる", () => {
  const change = vi.fn();
  render(<BirthYearPicker onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "2020年代" }));
  for (let year = 2020; year <= 2029; year++) {
    fireEvent.click(screen.getByRole("button", { name: `${year}年` }));
    expect(change).toHaveBeenLastCalledWith(String(year));
  }
});

it("説明はタップで開閉でき、Escapeで閉じ、デスクトップのhoverも残す", () => {
  render(<TapTooltip label="五黄殺">方位の説明</TapTooltip>);
  const button = screen.getByRole("button", { name: "五黄殺" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  const tooltip = screen.getByRole("tooltip", { hidden: true });
  expect(tooltip.className).toContain(
    "[@media(hover:hover)]:group-hover/tooltip:block",
  );
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  expect(button).toHaveAttribute("aria-controls", tooltip.id);
  expect(button).toHaveAttribute("aria-describedby", tooltip.id);
  expect(tooltip.className).not.toContain("hidden");
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(button);
  fireEvent.keyDown(button, { key: "Escape" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(
    readFileSync("src/components/home/ConsultPanel.tsx", "utf8"),
  ).toContain("<TapTooltip");
});

it("保存済みの生年月日で天中殺を自動計算する", async () => {
  vi.mocked(readSettingsSync).mockReturnValue({ birth_date: "1990-05-05" });
  vi.mocked(loadSettings).mockResolvedValue({
    settings: { birth_date: "1990-05-05" },
  } as unknown as Awaited<ReturnType<typeof loadSettings>>);
  render(<TenchusatsuChecker timeline={timeline} />);
  await act(async () => {});
  expect(screen.getByLabelText("日付欄で選ぶ")).toHaveValue("1990-05-05");
  const expected = tenchusatsuForCivilDate(1990, 5, 5);
  expect(
    screen.getByText(new RegExp(`あなたは${expected.tenchusatsu.name}天中殺`)),
  ).toBeTruthy();
});

it("年月日ボタンで即時計算し、遅いプロフィール応答で変更を消さない", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof loadSettings>>) => void;
  vi.mocked(loadSettings).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<TenchusatsuChecker timeline={timeline} />);
  for (const name of ["2020年代", "2024年", "2月", "29日"]) {
    fireEvent.click(screen.getByRole("button", { name }));
  }
  expect(screen.getByLabelText("日付欄で選ぶ")).toHaveValue("2024-02-29");
  expect(screen.getByText(/あなたは.*天中殺/)).toBeTruthy();
  await act(async () => {
    resolve({ settings: { birth_date: "1990-05-05" } } as unknown as Awaited<
      ReturnType<typeof loadSettings>
    >);
  });
  expect(screen.getByLabelText("日付欄で選ぶ")).toHaveValue("2024-02-29");
  fireEvent.click(screen.getByRole("button", { name: "変える" }));
  expect(screen.queryByText(/あなたは.*天中殺/)).toBeNull();
});

it.each(["invalid", "2027-01-01", "2023-02-29"])(
  "無効・未来の保存日付は計算に使わない: %s",
  async (birth_date) => {
    vi.mocked(readSettingsSync).mockReturnValue({ birth_date });
    render(<TenchusatsuChecker timeline={timeline} />);
    await act(async () => {});
    expect(screen.queryByText(/あなたは.*天中殺/)).toBeNull();
  },
);

it("天中殺記事の共通CTAからチェッカーへ進める", () => {
  const { rerender } = render(<ArticleToolCta tags={["天中殺"]} />);
  expect(
    screen.getByRole("link", { name: "生年月日から天中殺を調べる" }),
  ).toHaveAttribute("href", "/houi/tenchusatsu");
  rerender(<ArticleToolCta tags={["風水"]} />);
  expect(
    screen.queryByRole("link", { name: "生年月日から天中殺を調べる" }),
  ).toBeNull();
});
