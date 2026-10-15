import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => {
  throw new Error("Site DB must not load for an injected reader");
});
import { getMcpProfile, listMcpProfiles } from "@/lib/mcpProfiles";
const context = {
  userId: "11111111-1111-4111-8111-111111111111",
  allowedProfileIds: ["one"],
};
const row = {
  presets: [
    {
      id: "one",
      name: "test",
      birthDate: "1990-05-15",
      baseLat: 35,
      baseLon: 139,
    },
    { id: "hidden", name: "hidden" },
  ],
  metaphysical_config: {},
  updated_at: new Date("2026-10-12T00:00:00Z"),
};
describe("injected MCP profile reader", () => {
  it("validates the owner before reading and keeps selection and input minimization", async () => {
    const read = vi.fn().mockResolvedValue(row);
    expect(
      (await listMcpProfiles(context, {}, read)).profiles.map((p) => p.id),
    ).toEqual(["one"]);
    const result = await getMcpProfile(
      context,
      { profile: { id: "one" } },
      read,
    );
    expect(result).not.toHaveProperty("calculationInputs");
    expect(read).toHaveBeenCalledWith(context.userId);
    await expect(
      listMcpProfiles({ ...context, userId: "dev-bypass-id" }, {}, read),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("does not expose injected driver errors or their cause", async () => {
    const read = vi
      .fn()
      .mockRejectedValue(new Error("private query and coordinates"));
    const error = await getMcpProfile(
      context,
      { profile: { id: "one" } },
      read,
    ).catch((e) => e);
    expect(error.message).toBe("TEMPORARILY_UNAVAILABLE");
    expect(error.cause).toBeUndefined();
  });
});
