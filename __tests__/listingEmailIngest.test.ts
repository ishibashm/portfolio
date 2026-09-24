// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractEmailUrls, EmailPreviewError } from "@/lib/listingEmailIngest";
const url = "https://suumo.jp/chintai/123/";
const part = (
  body: string,
  headers = "Content-Type: text/plain; charset=utf-8",
) => `${headers}\r\n\r\n${body}`;
const multi = (parts: string[]) =>
  part(
    `preamble\r\n--b\r\n${parts.join("\r\n--b\r\n")}\r\n--b--\r\nepilogue`,
    'Content-Type: multipart/mixed; boundary="b"',
  );
afterEach(() => vi.restoreAllMocks());
describe("email URL extraction", () => {
  it("reuses Phase 1 normalization, deduplicates, rejects unsafe and unsubscribe URLs without network", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(
      extractEmailUrls(
        `${url}?utm_source=mail ${url} https://www.homes.co.jp/chintai/1/ https://www.eheya.net/a https://www.shamaison.com/a http://suumo.jp/a https://localhost/a https://127.0.0.1/a https://suumo.jp/a?token=secret https://suumo.jp/unsubscribe https://suumo.jp/a?redirect=https://example.com`,
        "text",
      ).urls,
    ).toEqual([
      url,
      "https://www.homes.co.jp/chintai/1/",
      "https://www.eheya.net/a",
      "https://www.shamaison.com/a",
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("only reads HTML anchor href, handles entities; ignores scripts, comments, base, visible text and images", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(
      extractEmailUrls(
        `<base href="https://example.com"><!-- <a href="https://example.com/comment"> --><script><a href="https://example.com/script"></script><style>https://example.com/style</style><img src="https://example.com/pixel"><a href="/relative">${url}</a><a href="https://suumo.jp/a?x=1&amp;y=2" onclick="alert(1)">link</a><a href="javascript:alert(1)">x</a>`,
        "html",
      ).urls,
    ).toEqual(["https://suumo.jp/a?x=1&y=2"]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("decodes nested MIME, base64, quoted-printable and folded headers; skips attachments and message/rfc822", () => {
    const raw = multi([
      part(
        Buffer.from(url).toString("base64"),
        "Content-Type: text/plain;\r\n charset=utf-8\r\nContent-Transfer-Encoding: base64",
      ),
      part(
        '<a href=3D"https://www.homes.co.jp/abc?utm_source=3Dm=\r\nail">x</a>',
        "Content-Type: text/html\r\nContent-Transfer-Encoding: quoted-printable",
      ),
      part(
        "https://example.com/attachment",
        "Content-Type: text/plain\r\nContent-Disposition: attachment",
      ),
      part(
        "https://example.com/named",
        'Content-Type: text/plain; name="x.txt"',
      ),
      part(
        "https://example.com/inline",
        "Content-Type: text/plain\r\nContent-Disposition: inline; filename*=utf-8''x.txt",
      ),
      part(
        "https://example.com/continued-name",
        'Content-Type: text/plain\r\nContent-Disposition: inline; filename*0="x"; filename*1=".txt"',
      ),
      part("https://example.com/pixel", "Content-Type: image/png"),
      part(part("https://example.com/forward"), "Content-Type: message/rfc822"),
    ]);
    expect(extractEmailUrls(raw, "mime").urls).toEqual([
      url,
      "https://www.homes.co.jp/abc",
    ]);
  });
  it.each([
    "not MIME",
    part(url, "Content-Type: text/plain; charset=shift_jis"),
    part(
      "%%%",
      "Content-Type: text/plain\r\nContent-Transfer-Encoding: base64",
    ),
    part(
      "=QZ",
      "Content-Type: text/plain\r\nContent-Transfer-Encoding: quoted-printable",
    ),
    part(url, "Content-Type: text/plain\r\nContent-Type: text/html"),
    part("--b\n" + part(url), "Content-Type: multipart/mixed; boundary=b"),
    part(url, "Content-Type: text/plain\r\nContent-Transfer-Encoding: gzip"),
  ])("rejects unsupported/ambiguous MIME without echoing content", (raw) => {
    expect(() => extractEmailUrls(raw, "mime")).toThrow(EmailPreviewError);
  });
  it("enforces byte, part, depth and URL limits", () => {
    expect(() => extractEmailUrls("あ".repeat(4001), "text")).toThrow();
    expect(() =>
      extractEmailUrls(multi(Array(41).fill(part(url))), "mime"),
    ).toThrow();
    let nested = part(url);
    for (let i = 0; i < 8; i++)
      nested = part(
        `--b${i}\n${nested}\n--b${i}--`,
        `Content-Type: multipart/alternative; boundary=b${i}`,
      );
    expect(() => extractEmailUrls(nested, "mime")).toThrow();
    const result = extractEmailUrls(
      Array.from({ length: 21 }, (_, i) => `https://suumo.jp/${i}`).join(" "),
      "text",
    );
    expect(result.urls).toHaveLength(20);
    expect(result.truncated).toBe(true);
  });
});
