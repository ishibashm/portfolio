import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import {
  UnsafeFetchUrlError,
  assertSafeBrowserUrl,
  fetchAllowlisted,
  safeConnectLookup,
  type PageRequest,
} from "@/lib/safeFetchUrl";

vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async () => [{ address: "203.0.113.10", family: 4 }]);
  return { lookup, default: { lookup } };
});

const allow = ["myhome.nifty.com"];
const publicDns = async () => [{ address: "203.0.113.10", family: 4 }];

afterEach(() => {
  vi.restoreAllMocks();
});

it.each([
  "http://169.254.169.254/computeMetadata/v1/",
  "http://2852039166/",
  "http://0xa9fea9fe/",
  "http://0251.254.169.254/",
  "http://[::ffff:169.254.169.254]/",
  "http://127.0.0.1/",
  "http://10.1.2.3/",
  "http://192.168.0.1/",
  "http://172.16.0.1/",
  "http://[::1]/",
  "http://[fe80::1]/",
  "http://[fc00::1]/",
  "http://0.0.0.0/",
  "file:///etc/passwd",
  "https://user:pass@myhome.nifty.com/",
  "https://metadata.google.internal/",
  "https://metadata.google.internal./",
  "https://evil.example/",
  "https://myhome.nifty.com.evil.example/",
  "not a url",
])("rejects %s", async (raw) => {
  await expect(
    assertSafeBrowserUrl(raw, { allowHosts: allow, lookup: publicDns }),
  ).rejects.toBeInstanceOf(UnsafeFetchUrlError);
});

it("rejects an allowlisted name that resolves to a metadata address", async () => {
  await expect(
    assertSafeBrowserUrl("https://myhome.nifty.com/rent/", {
      allowHosts: allow,
      lookup: async () => [{ address: "169.254.169.254", family: 4 }],
    }),
  ).rejects.toBeInstanceOf(UnsafeFetchUrlError);
});

it("rejects when any answer is private", async () => {
  await expect(
    assertSafeBrowserUrl("https://myhome.nifty.com/", {
      allowHosts: allow,
      lookup: async () => [
        { address: "203.0.113.10", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
    }),
  ).rejects.toBeInstanceOf(UnsafeFetchUrlError);
});

it("rejects metadata names even if they are allowlisted and resolve publicly", async () => {
  await expect(
    assertSafeBrowserUrl("https://metadata.google.internal/", {
      allowHosts: ["metadata.google.internal"],
      lookup: publicDns,
    }),
  ).rejects.toBeInstanceOf(UnsafeFetchUrlError);
});

it("allows the nifty host when DNS is public", async () => {
  const url = await assertSafeBrowserUrl(
    "https://myhome.nifty.com./rent/tokyo/city/",
    { allowHosts: allow, lookup: publicDns },
  );
  expect(url.pathname).toBe("/rent/tokyo/city/");
});

it("connect lookup returns only the checked public addresses", async () => {
  const answers = await new Promise<unknown>((resolve, reject) => {
    safeConnectLookup(allow, publicDns)(
      "myhome.nifty.com",
      { all: true },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      },
    );
  });
  expect(answers).toEqual([{ address: "203.0.113.10", family: 4 }]);
});

it("connect lookup fails closed on link-local answers", async () => {
  await expect(
    new Promise((resolve, reject) => {
      safeConnectLookup(allow, async () => [
        { address: "169.254.169.254", family: 4 },
      ])("myhome.nifty.com", {}, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    }),
  ).rejects.toThrow("Unsafe fetch URL");
});

it("does not connect to loopback even when that host is allowlisted", async () => {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits += 1;
    res.end("no");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  await expect(
    fetchAllowlisted(`http://127.0.0.1:${port}/secret`, ["127.0.0.1"], {
      userAgent: "t",
      timeoutMs: 1000,
    }),
  ).rejects.toBeInstanceOf(UnsafeFetchUrlError);
  expect(hits).toBe(0);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

it("returns a redirect status once and does not request the Location", async () => {
  let calls = 0;
  let lookup: PageRequest extends (
    target: URL,
    init: infer Init,
  ) => Promise<unknown>
    ? Init extends { lookup: infer Lookup }
      ? Lookup
      : never
    : never;
  const request: PageRequest = async (_target, init) => {
    calls += 1;
    lookup = init.lookup;
    return { status: 302, body: "" };
  };
  const response = await fetchAllowlisted(
    "https://myhome.nifty.com/rent/",
    allow,
    { userAgent: "t", timeoutMs: 1000 },
    request,
  );
  expect(response.status).toBe(302);
  expect(response.ok).toBe(false);
  expect(calls).toBe(1);
  await expect(
    new Promise((resolve, reject) => {
      lookup("169.254.169.254", {}, (err, address) => {
        if (err)
          reject(err instanceof Error ? err : new Error(String(address)));
        else resolve(address);
      });
    }),
  ).rejects.toThrow("Unsafe fetch URL");
});
