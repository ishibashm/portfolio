// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  agentBillingState,
  recordAgentBillingFailure,
  recordAgentModelSuccess,
} from "@/lib/agentBillingState";
import { GET as adminGET } from "@/app/api/admin/ai-status/route";
import { GET as publicGET } from "@/app/api/mcp-chain/status/route";
const { getAuthUser } = vi.hoisted(() => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/userConfig", () => ({ getAuthUser }));
vi.mock("@/lib/agentSession", () => ({
  agentSessionUser: async () => ({ signedIn: false }),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("billingを記録し、古い成功は解除せず、新しい成功後も最後の時刻を保持する", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T00:01:02Z"));
  const previous = agentBillingState().revision;
  recordAgentBillingFailure();
  recordAgentModelSuccess(previous);
  expect(agentBillingState()).toMatchObject({
    paused: "billing",
    lastBillingAt: "2026-10-17T00:01:02.000Z",
  });
  recordAgentModelSuccess(agentBillingState().revision);
  expect(agentBillingState()).toMatchObject({
    paused: null,
    lastBillingAt: "2026-10-17T00:01:02.000Z",
  });
});
it.each([
  [null, 401],
  [{ email: "visitor@example.com" }, 403],
])("管理APIは未認証・非管理者を拒否する %j", async (user, status) => {
  vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
  getAuthUser.mockResolvedValue(user);
  const response = await adminGET();
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain("lastBillingAt");
});
it("管理者には時刻、公開APIには停止フラグだけを返す", async () => {
  vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
  getAuthUser.mockResolvedValue({ email: "owner@example.com" });
  recordAgentBillingFailure();
  const admin = await adminGET();
  expect(admin.headers.get("cache-control")).toBe("no-store");
  expect(await admin.json()).toEqual({
    paused: "billing",
    lastBillingAt: agentBillingState().lastBillingAt,
  });
  const response = await publicGET(
    new Request("https://cloud-palette.com/api/mcp-chain/status"),
  );
  const body = await response.json();
  expect(body.paused).toBe("billing");
  expect(body).not.toHaveProperty("lastBillingAt");
  expect(body).not.toHaveProperty("revision");
  expect(JSON.stringify(body)).not.toMatch(/aistudio|API_KEY|Buy credits/);
  recordAgentModelSuccess(agentBillingState().revision);
  expect(
    (
      await (
        await publicGET(
          new Request("https://cloud-palette.com/api/mcp-chain/status"),
        )
      ).json()
    ).paused,
  ).toBeNull();
});
