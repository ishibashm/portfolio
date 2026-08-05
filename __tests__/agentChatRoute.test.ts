import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findMany: vi.fn(),
  createLog: vi.fn(),
  getDecision: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    agentActivityLog: {
      findMany: mocks.findMany,
      create: mocks.createLog,
    },
  },
}));

vi.mock("@/utils/localAgentEngine", () => ({
  getLocalAgentDecision: mocks.getDecision,
}));

import { POST } from "@/app/api/agent/chat/route";

describe("/api/agent/chat access boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL = "admin@example.com";
    mocks.findMany.mockResolvedValue([{ details: "private admin log" }]);
    mocks.createLog.mockResolvedValue({ id: "log-1" });
    mocks.getDecision.mockReturnValue({
      textResponse: "相談への回答",
      thoughtProcess: "local",
      actions: "none",
      toolCalls: [],
    });
  });

  it("answers a logged-in member without exposing or storing shared admin logs", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "member-1", email: "member@example.com" } },
      error: null,
    });

    const response = await POST(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({ message: "今日の助言をください" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.createLog).not.toHaveBeenCalled();
    expect(mocks.getDecision).toHaveBeenCalledWith(
      "USER_CHAT",
      "今日の助言をください",
      expect.objectContaining({ systemLogs: [] }),
    );
  });

  it("keeps shared system-log context and audit logging for the administrator", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "admin-1", email: "admin@example.com" } },
      error: null,
    });

    const response = await POST(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({ message: "ログを確認" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledOnce();
    expect(mocks.createLog).toHaveBeenCalledOnce();
    expect(mocks.getDecision).toHaveBeenCalledWith(
      "USER_CHAT",
      "ログを確認",
      expect.objectContaining({
        systemLogs: [{ details: "private admin log" }],
      }),
    );
  });
});
