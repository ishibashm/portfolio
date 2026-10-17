// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-2222-4333-8444-555555555555";
afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/userConfig");
  vi.doUnmock("@/lib/agentEntitlement");
  vi.unstubAllEnvs();
});

function mockUser(user: { id: string; email: string } | null) {
  vi.doMock("@/lib/userConfig", () => ({
    getAuthUser: vi.fn(async () =>
      user ? { ...user, emailVerified: true } : null,
    ),
    toUserId: (u: { id: string }) =>
      /^[0-9a-f-]{36}$/.test(u.id) ? u.id : null,
  }));
}
const withCookie = (cookie: string) =>
  new Request("https://cloud-palette.com/api/mcp-chain", {
    headers: { cookie },
  });

describe("agentSessionUser", () => {
  it("ログイン中は真偽と id を返す。メールは返さない", async () => {
    mockUser({ id: USER_ID, email: "someone@example.com" });
    const { agentSessionUser } = await import("@/lib/agentSession");
    const session = await agentSessionUser(withCookie("sb-x-auth-token=1"));
    expect(session).toEqual({ signedIn: true, userId: USER_ID });
    expect(JSON.stringify(session)).not.toContain("example.com");
  });
  it("Cookie が無効・認証が失敗したら未ログイン", async () => {
    mockUser(null);
    const { agentSessionUser } = await import("@/lib/agentSession");
    expect(await agentSessionUser(withCookie("sb-x-auth-token=1"))).toEqual({
      signedIn: false,
    });
  });
});

describe("AI の入口", () => {
  it("ログイン中は本人の id でレートを数え、モデルへはログインの有無だけを渡す", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MCP_AGENT_ENABLED", "true");
    vi.stubEnv("MCP_AGENT_MOCK", "true");
    mockUser({ id: USER_ID, email: "someone@example.com" });
    const seen: unknown[] = [];
    vi.doMock("@/lib/agentEntitlement", () => ({
      canUseAgent: (input: unknown) => {
        seen.push(input);
        return {
          allowed: true,
          remaining: { requests: 1, tokens: 1 },
          finish: () => {},
        };
      },
    }));
    const runAgent = vi.fn(async () => {});
    vi.doMock("@/lib/mcpAgent", async (original) => ({
      ...(await original<typeof import("@/lib/mcpAgent")>()),
      runAgent,
    }));
    const { POST } = await import("@/app/api/mcp-chain/route");
    const response = await POST(
      new Request("https://cloud-palette.com/api/mcp-chain", {
        method: "POST",
        headers: {
          Origin: "https://cloud-palette.com",
          "Content-Type": "application/json",
          cookie: "sb-x-auth-token=1",
          "x-forwarded-for": "192.0.2.10",
        },
        body: JSON.stringify({
          mode: "llm",
          question: "質問",
          conversationKey: "conversation_abc123",
        }),
      }),
    );
    await response.text();
    vi.doUnmock("@/lib/mcpAgent");
    expect(seen[0]).toMatchObject({ userId: USER_ID, mode: "llm" });
    const context = (runAgent.mock.calls[0] as unknown[])[7] as {
      session: { signedIn: boolean; saveOffer: { available: boolean } };
    };
    expect(context.session.signedIn).toBe(true);
    expect(context.session.saveOffer.available).toBe(false);
    expect(JSON.stringify(context)).not.toContain(USER_ID);
    expect(JSON.stringify(context)).not.toContain("example.com");
  });
});
