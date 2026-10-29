import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FortuneReport } from "@/components/fortune/FortuneReport";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  config: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@/lib/userConfig", () => ({
  getAuthUser: mocks.auth,
  findUserConfig: mocks.config,
}));
vi.mock("@/lib/fortuneGeneration", () => ({ getFortuneReport: mocks.report }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("hides the section without reading authentication when off", async () => {
  vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "false");
  expect(await FortuneReport()).toBeNull();
  expect(mocks.auth).not.toHaveBeenCalled();
});
it("hides the section for logged-out users", async () => {
  vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "true");
  mocks.auth.mockResolvedValue(null);
  expect(await FortuneReport()).toBeNull();
  expect(mocks.config).not.toHaveBeenCalled();
});
it("shows only the existing registration link for an incomplete profile", async () => {
  vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "true");
  mocks.auth.mockResolvedValue({ id: "verified-user" });
  mocks.config.mockResolvedValue({ birth_date: null });
  const { container } = render(await FortuneReport());
  expect(screen.getByRole("link")).toHaveAttribute("href", "/profile");
  expect(container.children).toHaveLength(1);
  expect(mocks.report).not.toHaveBeenCalled();
});
it("uses the authenticated user's stored profile, with no input box", async () => {
  vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "true");
  mocks.auth.mockResolvedValue({ id: "verified-user" });
  mocks.config.mockResolvedValue({
    birth_date: "1990-05-15",
    base_lat: 35.68,
    base_lon: 139.76,
  });
  mocks.report.mockResolvedValue({
    facts: [],
    fallbackHtml: "<p>計算結果</p>",
    srcdoc: "<p>AI</p>",
  });
  render(await FortuneReport());
  expect(mocks.report).toHaveBeenCalledWith("verified-user", {
    birthDate: "1990-05-15",
    lat: 35.68,
    lon: 139.76,
  });
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByText("計算結果")).toBeInTheDocument();
  const frame = screen.getByTitle("AI装飾の運勢レポート");
  expect(frame).toHaveAttribute("sandbox", "");
  expect(frame).toHaveAttribute("srcdoc", "<p>AI</p>");
  expect(screen.getByText("計算結果").closest("iframe")).toBeNull();
  expect(screen.getByText("計算結果").closest("details")).not.toHaveAttribute(
    "open",
  );
  expect(screen.getByText("計算結果")).not.toBeVisible();
});
it("renders the non-AI fallback without an iframe", async () => {
  vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "true");
  mocks.auth.mockResolvedValue({ id: "verified-user" });
  mocks.config.mockResolvedValue({
    birth_date: "1990-05-15",
    base_lat: 35.68,
    base_lon: 139.76,
  });
  mocks.report.mockResolvedValue({
    facts: [],
    fallbackHtml: "<p>計算結果</p>",
    srcdoc: null,
  });
  const { container } = render(await FortuneReport());
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.querySelector("details")).toBeNull();
  expect(screen.getByText("計算結果")).toBeInTheDocument();
});
