// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signReminderOffer, signUnsubscribe } from "@/lib/reminders";

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  prisma: {
    reminder: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    notificationConsent: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user_configs: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  fetch: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: mock.prisma }));
vi.mock("@/lib/userConfig", () => ({
  getAuthUser: mock.user,
  toUserId: (u: { id: string }) => u.id,
}));

import * as remindersRoute from "@/app/api/reminders/route";
import * as unsubscribeRoute from "@/app/api/reminders/unsubscribe/route";
import * as cronRoute from "@/app/api/cron/reminders/route";

const secret = "s".repeat(40);
const id = "11111111-2222-4333-8444-555555555555";
const enable = () => {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("REMINDER_FROM_EMAIL", "しるべ <shirube@send.example.com>");
  vi.stubEnv("REMINDER_SECRET", secret);
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("REMINDER_FROM_EMAIL", "");
  vi.stubEnv("REMINDER_SECRET", "");
  vi.stubEnv("CRON_SECRET", "cron");
  mock.user.mockResolvedValue({ id });
  mock.prisma.$transaction.mockImplementation(async (fn) => fn(mock.prisma));
  vi.stubGlobal("fetch", mock.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("disabled (no Resend env)", () => {
  it("GET says disabled without touching the database", async () => {
    const res = await remindersRoute.GET();
    expect(await res.json()).toEqual({ enabled: false });
    expect(mock.user).not.toHaveBeenCalled();
    expect(mock.prisma.reminder.findMany).not.toHaveBeenCalled();
  });
  it("POST and DELETE are 404", async () => {
    const post = await remindersRoute.POST(
      new NextRequest("https://example.com/api/reminders", {
        method: "POST",
        headers: { origin: "https://example.com" },
        body: "{}",
      }),
    );
    expect(post.status).toBe(404);
    const del = await remindersRoute.DELETE(
      new NextRequest("https://example.com/api/reminders?all=1", {
        method: "DELETE",
        headers: { origin: "https://example.com" },
      }),
    );
    expect(del.status).toBe(404);
  });
  it("cron skips with 200 and never reads tables", async () => {
    const res = await cronRoute.POST(
      new Request("https://example.com/api/cron/reminders", {
        method: "POST",
        headers: { authorization: "Bearer cron" },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toBe("disabled");
    expect(mock.prisma.reminder.findMany).not.toHaveBeenCalled();
    expect(mock.fetch).not.toHaveBeenCalled();
  });
});

describe("cron", () => {
  it("rejects a wrong secret", async () => {
    enable();
    const res = await cronRoute.POST(
      new Request("https://example.com/api/cron/reminders", {
        method: "POST",
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("sends a due reminder once, and skips users who revoked consent", async () => {
    enable();
    mock.prisma.reminder.updateMany.mockResolvedValue({ count: 1 });
    mock.prisma.reminder.deleteMany.mockResolvedValue({ count: 0 });
    mock.prisma.reminder.findMany.mockResolvedValue([
      {
        id: "r1",
        user_id: id,
        target_date: "2999-01-04",
        direction: "SE",
        lead_days: 3,
      },
      {
        id: "r2",
        user_id: "99999999-2222-4333-8444-555555555555",
        target_date: "2999-01-04",
        direction: "N",
        lead_days: 3,
      },
    ]);
    mock.prisma.notificationConsent.findFirst.mockImplementation(
      async ({ where }) => (where.user_id === id ? { id: "c1" } : null),
    );
    mock.prisma.user_configs.findFirst.mockResolvedValue({
      user_email: "u@example.com",
    });
    mock.fetch.mockResolvedValue(new Response("{}", { status: 200 }));
    const res = await cronRoute.POST(
      new Request("https://example.com/api/cron/reminders", {
        method: "POST",
        headers: { authorization: "Bearer cron" },
      }),
    );
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(body.skipped).toBe(1);
    expect(mock.fetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(mock.fetch.mock.calls[0][1].body));
    expect(sent.to).toEqual(["u@example.com"]);
    expect(sent.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });
  it("does not send when another run already claimed the reminder", async () => {
    enable();
    mock.prisma.reminder.updateMany
      .mockResolvedValueOnce({ count: 0 }) // expire
      .mockResolvedValueOnce({ count: 0 }); // claim lost
    mock.prisma.reminder.deleteMany.mockResolvedValue({ count: 0 });
    mock.prisma.reminder.findMany.mockResolvedValue([
      {
        id: "r1",
        user_id: id,
        target_date: "2999-01-04",
        direction: "SE",
        lead_days: 3,
      },
    ]);
    await cronRoute.POST(
      new Request("https://example.com/api/cron/reminders", {
        method: "POST",
        headers: { authorization: "Bearer cron" },
      }),
    );
    expect(mock.fetch).not.toHaveBeenCalled();
  });
});

describe("create", () => {
  const offer = { date: "2999-01-04", direction: "SE" };
  const post = (body: unknown, origin = "https://example.com") =>
    remindersRoute.POST(
      new NextRequest("https://example.com/api/reminders", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  it("refuses without the consent tick", async () => {
    enable();
    const token = signReminderOffer(secret, offer);
    const res = await post({ ...offer, token, leadDays: 3 });
    expect(res.status).toBe(400);
    expect(mock.prisma.reminder.upsert).not.toHaveBeenCalled();
  });
  it("refuses a forged token (date the server never offered)", async () => {
    enable();
    const token = signReminderOffer(secret, offer);
    const res = await post({
      ...offer,
      date: "2999-01-05",
      token,
      leadDays: 3,
      consent: true,
    });
    expect(res.status).toBe(400);
    expect(mock.prisma.reminder.upsert).not.toHaveBeenCalled();
  });
  it("refuses cross-site requests", async () => {
    enable();
    const token = signReminderOffer(secret, offer);
    const res = await post(
      { ...offer, token, leadDays: 3, consent: true },
      "https://evil.example",
    );
    expect(res.status).toBe(403);
  });
});

describe("unsubscribe", () => {
  it("GET only shows a confirmation (link scanners do not unsubscribe)", async () => {
    enable();
    const token = signUnsubscribe(secret, id);
    const res = await unsubscribeRoute.GET(
      new Request(
        `https://example.com/api/reminders/unsubscribe?token=${token}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('method="post"');
    expect(mock.prisma.notificationConsent.updateMany).not.toHaveBeenCalled();
  });
  it("POST (incl. one-click) revokes consent and cancels pending reminders", async () => {
    enable();
    const token = signUnsubscribe(secret, id);
    const res = await unsubscribeRoute.POST(
      new Request(
        `https://example.com/api/reminders/unsubscribe?token=${token}`,
        {
          method: "POST",
          body: "List-Unsubscribe=One-Click",
        },
      ),
    );
    expect(res.status).toBe(200);
    expect(mock.prisma.notificationConsent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: id }),
      }),
    );
    expect(mock.prisma.reminder.updateMany).toHaveBeenCalledWith({
      where: { user_id: id, status: { in: ["scheduled", "sending"] } },
      data: { status: "cancelled" },
    });
  });
  it("rejects a tampered token", async () => {
    enable();
    const res = await unsubscribeRoute.POST(
      new Request(
        "https://example.com/api/reminders/unsubscribe?token=abc.def",
        {
          method: "POST",
        },
      ),
    );
    expect(res.status).toBe(400);
    expect(mock.prisma.notificationConsent.updateMany).not.toHaveBeenCalled();
  });
});
