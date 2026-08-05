import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession, createServerClient, cookies } = vi.hoisted(
  () => ({
    exchangeCodeForSession: vi.fn(),
    createServerClient: vi.fn(),
    cookies: vi.fn(),
  }),
);

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("next/headers", () => ({ cookies }));

import { GET } from "@/app/auth/callback/route";

describe("the OAuth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSession.mockResolvedValue({ error: null });
    createServerClient.mockReturnValue({ auth: { exchangeCodeForSession } });
    cookies.mockResolvedValue({ getAll: vi.fn(() => []), set: vi.fn() });
  });

  it("sends a successful login to the dashboard by default", async () => {
    const response = await GET(
      new Request("https://cloud-palette.com/auth/callback?code=ok"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://cloud-palette.com/dashboard",
    );
  });

  it("preserves an explicitly requested destination", async () => {
    const response = await GET(
      new Request(
        "https://cloud-palette.com/auth/callback?code=ok&next=%2Fcalendar",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://cloud-palette.com/calendar",
    );
  });
});
