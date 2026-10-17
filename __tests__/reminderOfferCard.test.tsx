import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReminderOfferCard } from "@/app/ask/ReminderOfferCard";
import { EmailLogin } from "@/app/login/EmailLogin";
import { RemindersPanel } from "@/components/account/RemindersPanel";
import { reminderOfferCard } from "@/lib/reminders";

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithOtp: vi.fn() } }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const card = reminderOfferCard(
  "s".repeat(40),
  { date: "2999-01-04", direction: "SE" },
  "2998-12-01",
)!;

describe("ReminderOfferCard", () => {
  it("starts with consent unticked and the set button disabled; equal-weight buttons", () => {
    render(<ReminderOfferCard card={card} />);
    const consent = screen.getByRole("checkbox");
    expect(consent).not.toBeChecked();
    const accept = screen.getByRole("button", { name: "お知らせを設定する" });
    const decline = screen.getByRole("button", { name: "今はしない" });
    expect(accept).toBeDisabled();
    expect(accept.className).toBe(decline.className);
  });
  it("posts consent: true only after ticking", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReminderOfferCard card={card} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "お知らせを設定する" }));
    await waitFor(() =>
      expect(screen.getByText(/お知らせを設定しました/)).toBeTruthy(),
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/reminders");
    expect(JSON.parse(String(init.body))).toMatchObject({
      date: "2999-01-04",
      direction: "SE",
      leadDays: 3,
      consent: true,
    });
  });
  it("「今はしない」 sends nothing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReminderOfferCard card={card} />);
    fireEvent.click(screen.getByRole("button", { name: "今はしない" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("hidden when disabled", () => {
  it("account panel renders nothing when reminders are disabled", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ enabled: false })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<RemindersPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
  it("email login renders nothing unless the server enables it", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ google: true, email: false })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<EmailLogin next="/" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
  it("email login appears when enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ google: true, email: true })),
      ),
    );
    render(<EmailLogin next="/" />);
    expect(
      await screen.findByRole("button", { name: "ログイン用のリンクを送る" }),
    ).toBeTruthy();
  });
});
