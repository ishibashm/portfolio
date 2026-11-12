// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock("@/lib/userConfig", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/prisma", () => ({ default: { practitioner: mocks } }));
vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));
import { POST, PATCH, GET as publicList } from "@/app/api/practitioners/route";
import { GET } from "@/app/api/admin/practitioners/route";
import { isProtectedRoute } from "@/utils/supabase/routeAccess";

const application = {
  displayName: "相談室",
  headline: "引越しのご相談",
  area: "オンライン",
  specialties: ["引越し"],
  profile: "丁寧にご相談をお受けしています。".repeat(5),
  websiteUrl: "https://example.com/",
};
const request = (method: string, body: unknown) =>
  new Request("https://cloud-palette.com/api/practitioners", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SMTP_USER", "sender@gmail.com");
  vi.stubEnv("SMTP_PASS", "app-password");
  vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
  vi.stubEnv("ADMIN_NOTIFY_EMAIL", "notify@example.com");
  mocks.getAuthUser.mockResolvedValue({
    id: "user-1",
    email: "owner@example.com",
  });
  mocks.createTransport.mockReturnValue({
    sendMail: mocks.sendMail,
    close: mocks.close,
  });
  mocks.upsert.mockResolvedValue({ id: "application-1" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("application notification", () => {
  it("saves as pending and sends application details to the owner", async () => {
    const response = await POST(request("POST", application));
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "pending" }),
      }),
    );
    expect(mocks.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendMail.mock.invocationCallOrder[0],
    );
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
      }),
    );
    const message = mocks.sendMail.mock.calls[0][0];
    expect(message.to).toBe("owner@example.com");
    for (const detail of [
      application.displayName,
      application.headline,
      application.profile,
      application.area,
      application.specialties[0],
      application.websiteUrl,
      "owner@example.com",
      "user-1",
      "https://cloud-palette.com/admin/practitioners",
    ])
      expect(message.text).toContain(detail);
    expect(mocks.close).toHaveBeenCalled();
  });
  it.each(["SMTP_USER", "SMTP_PASS"])(
    "warns and succeeds without %s",
    async (key) => {
      vi.stubEnv(key, "");
      expect((await POST(request("POST", application))).status).toBe(200);
      expect(mocks.createTransport).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    },
  );
  it.each(["send", "transport"])(
    "does not fail a saved application on %s failure",
    async (failure) => {
      if (failure === "send")
        mocks.sendMail.mockRejectedValue(new Error("SMTP unavailable"));
      else
        mocks.createTransport.mockImplementation(() => {
          throw new Error("transport failed");
        });
      const response = await POST(request("POST", application));
      expect(await response.json()).toMatchObject({
        success: true,
        status: "pending",
      });
      expect(console.error).toHaveBeenCalled();
    },
  );
  it.each([
    ["notify@example.com", "notify@example.com"],
    ["", "ishibashm@gmail.com"],
  ])("uses the recipient fallback %s", async (configured, expected) => {
    vi.stubEnv("ADMIN_EMAIL", "");
    vi.stubEnv("ADMIN_NOTIFY_EMAIL", configured);
    await POST(request("POST", application));
    expect(mocks.sendMail.mock.calls[0][0].to).toBe(expected);
  });
  it("does not notify when persistence fails", async () => {
    mocks.upsert.mockRejectedValue(new Error("database unavailable"));
    expect((await POST(request("POST", application))).status).toBe(500);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});

describe("admin practitioner flow", () => {
  it("protects the page through the existing admin middleware", () => {
    expect(isProtectedRoute("/admin/practitioners")).toBe(true);
  });
  it.each([
    [null, 401],
    [{ email: "other@example.com" }, 403],
  ])("denies unauthorized list and changes", async (user, status) => {
    mocks.getAuthUser.mockResolvedValue(user);
    expect((await GET()).status).toBe(status);
    expect(
      (
        await PATCH(
          request("PATCH", { id: "application-1", status: "approved" }),
        )
      ).status,
    ).toBe(status);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("lists every review status privately", async () => {
    const rows = ["pending", "approved", "hidden"].map((status) => ({
      id: status,
      status,
      email: "applicant@example.com",
    }));
    mocks.findMany.mockResolvedValue(rows);
    const response = await GET();
    expect(await response.json()).toEqual({ success: true, data: rows });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { status: { in: ["pending", "approved", "hidden"] } },
      orderBy: { updated_at: "desc" },
    });
  });
  it.each(["approved", "hidden"])("updates a listing to %s", async (status) => {
    expect(
      (await PATCH(request("PATCH", { id: "application-1", status }))).status,
    ).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "application-1" },
      data: { status },
    });
  });
  it("rejects an invalid status", async () => {
    expect(
      (
        await PATCH(
          request("PATCH", { id: "application-1", status: "invalid" }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("keeps the public list restricted to approved public fields", async () => {
    mocks.findMany.mockResolvedValue([]);
    await publicList(
      new Request("https://cloud-palette.com/api/practitioners"),
    );
    const query = mocks.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ status: "approved" });
    expect(query.select.email).toBeUndefined();
    expect(query.select.user_id).toBeUndefined();
  });
});
