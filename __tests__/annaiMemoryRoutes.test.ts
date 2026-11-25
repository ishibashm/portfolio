import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUIDE_MEMORY_CONSENT_VERSION,
  GUIDE_MEMORY_COOKIE,
  clearMemoryCookieHeader,
  memoryCookieHeader,
  type GuideMemoryExportJson,
} from "@/lib/guide/guideMemory";
import * as guideMemoryModule from "@/lib/guide/guideMemory";
import { POST as deletePost } from "@/app/annai/memory/delete/route";
import { GET as exportGet } from "@/app/annai/memory/export/route";
import { POST as savePost } from "@/app/annai/memory/save/route";

const TEST_KEY_B64 = randomBytes(32).toString("base64");
const VALID_COOKIE_ID = randomBytes(32).toString("base64url");
const ORIGIN = "https://cloud-palette.com";

describe("annaiMemoryRoutes (/annai/memory/save, /delete, /export)", () => {
  const prevEnabled = process.env.GUIDE_MEMORY_ENABLED;
  const prevKey = process.env.GUIDE_MEMORY_KEY;

  beforeEach(() => {
    process.env.GUIDE_MEMORY_ENABLED = "true";
    process.env.GUIDE_MEMORY_KEY = TEST_KEY_B64;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (prevEnabled === undefined) {
      delete process.env.GUIDE_MEMORY_ENABLED;
    } else {
      process.env.GUIDE_MEMORY_ENABLED = prevEnabled;
    }
    if (prevKey === undefined) {
      delete process.env.GUIDE_MEMORY_KEY;
    } else {
      process.env.GUIDE_MEMORY_KEY = prevKey;
    }
  });

  it("save route: 別オリジンまたは Origin 欠落の POST を 403 で拒否し、saveMemory を呼ばない", async () => {
    const saveSpy = vi.spyOn(guideMemoryModule, "saveMemory");

    const crossOriginReq = new Request(`${ORIGIN}/annai/memory/save`, {
      method: "POST",
      headers: {
        origin: "https://evil.example.org",
        host: "cloud-palette.com",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "consent=yes&star=7",
    });
    const res1 = await savePost(crossOriginReq);
    expect(res1.status).toBe(403);
    expect(res1.headers.get("set-cookie")).toBeNull();

    const noOriginReq = new Request(`${ORIGIN}/annai/memory/save`, {
      method: "POST",
      headers: {
        host: "cloud-palette.com",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "consent=yes&star=7",
    });
    const res2 = await savePost(noOriginReq);
    expect(res2.status).toBe(403);
    expect(res2.headers.get("set-cookie")).toBeNull();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("save route: application/x-www-form-urlencoded 以外の Content-Type を 415 で拒否する", async () => {
    const saveSpy = vi.spyOn(guideMemoryModule, "saveMemory");
    const req = new Request(`${ORIGIN}/annai/memory/save`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        host: "cloud-palette.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({ consent: "yes", star: 7 }),
    });
    const res = await savePost(req);
    expect(res.status).toBe(415);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("save route: 4KB を超えるフォーム本文を 413 で拒否し、saveMemory を呼ばない", async () => {
    const saveSpy = vi.spyOn(guideMemoryModule, "saveMemory");
    const oversizeBody = `consent=yes&slug=${"a".repeat(5000)}`;
    const req = new Request(`${ORIGIN}/annai/memory/save`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        host: "cloud-palette.com",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: oversizeBody,
    });
    const res = await savePost(req);
    expect(res.status).toBe(413);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("save route: 同意チェック（consent=yes）が無い場合は /annai/memory?e=consent へ 303 リダイレクトし、何も保存せず Cookie も発行しない", async () => {
    const saveSpy = vi.spyOn(guideMemoryModule, "saveMemory");
    const req = new Request(`${ORIGIN}/annai/memory/save`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        host: "cloud-palette.com",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "star=7&pref=13&topic=kippou",
    });
    const res = await savePost(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/annai/memory?e=consent");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("save route: 同意ありのときは不正値を落として saveMemory を呼び、Set-Cookie 付きで /annai/memory?saved=1 へ 303 リダイレクトする", async () => {
    const now = new Date("2026-11-25T03:00:00.000Z");
    const saveSpy = vi
      .spyOn(guideMemoryModule, "saveMemory")
      .mockResolvedValue({
        cookieValue: VALID_COOKIE_ID,
        idLabel: "1234abcd",
        memory: {
          v: 1,
          star: 7,
          pref: "13",
          topics: ["kippou"],
          slugs: ["valid-slug"],
        },
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + 90 * 86400_000),
      });

    const req = new Request(`${ORIGIN}/annai/memory/save`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        host: "cloud-palette.com",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "consent=yes&star=7&pref=13&topic=kippou&topic=invalid_topic&slug=valid-slug&slug=%E4%B8%8D%E6%AD%A3%E3%82%B9%E3%83%A9%E3%82%B0",
    });

    const res = await savePost(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/annai/memory?saved=1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBe(
      memoryCookieHeader(VALID_COOKIE_ID),
    );
    expect(saveSpy).toHaveBeenCalledWith({
      cookieValue: undefined,
      patch: {
        star: 7,
        pref: "13",
        topics: ["kippou"],
        slugs: ["valid-slug"],
      },
      consent: true,
    });
  });

  it("delete route: 行を削除して Cookie を Max-Age=0 で消去し、/annai/memory?deleted=1 へ 303 リダイレクトする", async () => {
    const deleteSpy = vi
      .spyOn(guideMemoryModule, "deleteMemory")
      .mockResolvedValue({ deleted: true });

    const req = new Request(`${ORIGIN}/annai/memory/delete`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        host: "cloud-palette.com",
        "content-type": "application/x-www-form-urlencoded",
        cookie: `${GUIDE_MEMORY_COOKIE}=${VALID_COOKIE_ID}`,
      },
      body: "",
    });

    const res = await deletePost(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/annai/memory?deleted=1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBe(clearMemoryCookieHeader());
    expect(deleteSpy).toHaveBeenCalledWith(VALID_COOKIE_ID);
  });

  it("export route: 記憶があるときは Content-Disposition: attachment の JSON を返し、無いときは 404 を返す", async () => {
    const mockPayload: GuideMemoryExportJson = {
      memoryId: "deadbeef",
      consentVersion: GUIDE_MEMORY_CONSENT_VERSION,
      createdAt: "2026-11-25T03:00:00.000Z",
      lastUsedAt: "2026-11-25T03:00:00.000Z",
      expiresAt: "2027-02-23T03:00:00.000Z",
      data: {
        star: 7,
        pref: "13",
        prefName: "東京都",
        topics: ["kippou"],
        slugs: ["kippou-article"],
      },
    };

    const exportSpy = vi
      .spyOn(guideMemoryModule, "exportMemory")
      .mockResolvedValueOnce(mockPayload)
      .mockResolvedValueOnce(null);

    const reqOk = new Request(`${ORIGIN}/annai/memory/export`, {
      method: "GET",
      headers: {
        cookie: `${GUIDE_MEMORY_COOKIE}=${VALID_COOKIE_ID}`,
      },
    });
    const resOk = await exportGet(reqOk);
    expect(resOk.status).toBe(200);
    expect(resOk.headers.get("content-disposition")).toBe(
      'attachment; filename="annai-memory.json"',
    );
    expect(resOk.headers.get("cache-control")).toBe("no-store");
    expect(resOk.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await resOk.json()).toEqual(mockPayload);
    expect(exportSpy).toHaveBeenCalledWith(VALID_COOKIE_ID);

    const reqNone = new Request(`${ORIGIN}/annai/memory/export`, {
      method: "GET",
    });
    const resNone = await exportGet(reqNone);
    expect(resNone.status).toBe(404);
    expect(await resNone.json()).toEqual({ found: false });
  });
});
