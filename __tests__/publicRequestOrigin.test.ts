// @vitest-environment node
import { expect, it } from "vitest";
import { publicRequestOrigin } from "@/lib/apiGuard";

it.each([
  [
    { host: "cloud-palette.com", "x-forwarded-proto": "https" },
    "https://cloud-palette.com",
  ],
  [
    { "x-forwarded-host": "cloud-palette.com", "x-forwarded-proto": "https" },
    "https://cloud-palette.com",
  ],
  [{ "x-forwarded-host": "cloud-palette.com" }, "https://cloud-palette.com"],
  [{ host: "localhost:3000" }, "http://localhost:3000"],
  [
    { host: "example.com:8443", "x-forwarded-proto": "https" },
    "https://example.com:8443",
  ],
  [{ host: "example.com", "x-forwarded-host": "evil.example" }, null],
  [{ host: "example.com,evil.example" }, null],
  [{ host: "example.com", "x-forwarded-proto": "https,http" }, null],
  [{ host: "example.com", "x-forwarded-proto": "javascript" }, null],
  [{ host: "user:SECRET@example.com" }, null],
  [{ host: "example.com/SECRET" }, null],
  [{ host: "example.com:invalid" }, null],
  [{}, "http://0.0.0.0:8080"],
] as [Record<string, string>, string | null][])(
  "resolves only unambiguous public origins: %j",
  (headers, expected) => {
    expect(
      publicRequestOrigin({
        headers: new Headers(headers),
        nextUrl: { host: "0.0.0.0:8080", protocol: "http:" },
      }),
    ).toBe(expected);
  },
);
