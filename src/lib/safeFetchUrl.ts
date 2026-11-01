import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";

/**
 * ページ取得の共通の歯止め。
 *
 * 公開 MCP は利用者の URL をそのまま開かない。Chromium を起動するのは
 * 賃貸のオンデマンド取得（既定オフ）だけで、開く先は myhome.nifty.com
 * に組み立てた URL。それでもリダイレクトと DNS の向き先は別問題なので、
 * ホストの許可リストと、解決後のアドレスの両方を見てから繋ぐ。
 *
 * 許可リストに載っていても、ループバック・プライベート・リンクローカル・
 * クラウドのメタデータアドレスへは繋がない。名前の時点で分かる
 * metadata.google.internal も、解決結果が 169.254.169.254 でも同じ。
 */

export class UnsafeFetchUrlError extends Error {
  constructor() {
    super("Unsafe fetch URL");
    this.name = "UnsafeFetchUrlError";
  }
}

export type DnsAnswer = { address: string; family: number };

export type DnsLookup = (hostname: string) => Promise<readonly DnsAnswer[]>;

const METADATA_HOSTS = new Set(["metadata.google.internal", "metadata.goog"]);

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addAddress("255.255.255.255", "ipv4");
blocked.addSubnet("224.0.0.0", 4, "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("ff00::", 8, "ipv6");

export async function defaultDnsLookup(
  hostname: string,
): Promise<readonly DnsAnswer[]> {
  const found = await lookup(hostname, { all: true, verbatim: true });
  return found.map((item) => ({ address: item.address, family: item.family }));
}

function unbracket(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

/** 末尾のドット（絶対名）と IPv6 の括弧を除いた比較用の名前。 */
export function hostKey(hostname: string): string {
  return unbracket(hostname).toLowerCase().replace(/\.+$/, "");
}

/** IPv4 射影（::ffff:a9fe:a9fe を含む）をドット十進に戻す。 */
export function ipv4FromMapped(raw: string): string | null {
  const ip = unbracket(raw).toLowerCase();
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (dotted && isIP(dotted[1]) === 4) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

export function isBlockedIp(raw: string): boolean {
  const bare = unbracket(raw);
  const mapped = ipv4FromMapped(bare);
  const address = mapped ?? bare;
  if (isIP(address) === 4) return blocked.check(address, "ipv4");
  if (isIP(address) === 6) return blocked.check(address, "ipv6");
  return true;
}

function assertAnswers(answers: readonly DnsAnswer[]) {
  if (answers.length === 0) throw new UnsafeFetchUrlError();
  for (const answer of answers) {
    if (isBlockedIp(answer.address)) throw new UnsafeFetchUrlError();
  }
}

export async function assertSafeBrowserUrl(
  raw: string,
  options: { allowHosts: readonly string[]; lookup?: DnsLookup },
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeFetchUrlError();
  }
  if (url.username || url.password) throw new UnsafeFetchUrlError();
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeFetchUrlError();
  }
  const host = hostKey(url.hostname);
  if (!host || host === "localhost" || METADATA_HOSTS.has(host)) {
    throw new UnsafeFetchUrlError();
  }
  const allow = new Set(options.allowHosts.map((item) => hostKey(item)));
  if (!allow.has(host)) throw new UnsafeFetchUrlError();
  if (isIP(ipv4FromMapped(host) ?? host)) {
    if (isBlockedIp(host)) throw new UnsafeFetchUrlError();
    return url;
  }
  let answers: readonly DnsAnswer[];
  try {
    answers = await (options.lookup ?? defaultDnsLookup)(host);
  } catch (error) {
    if (error instanceof UnsafeFetchUrlError) throw error;
    throw new UnsafeFetchUrlError();
  }
  assertAnswers(answers);
  return url;
}

/** https.request の lookup。検査したアドレスだけを返し、別の解決結果へ繋がない。 */
export function safeConnectLookup(
  allowHosts: readonly string[],
  resolve: DnsLookup = defaultDnsLookup,
): LookupFunction {
  return (hostname, options, callback) => {
    void (async () => {
      const host = hostKey(hostname);
      const answers = await assertSafeBrowserUrl(`https://${host}/`, {
        allowHosts,
        lookup: resolve,
      }).then(() => resolve(host));
      assertAnswers(answers);
      return answers;
    })().then(
      (answers) => {
        if (options.all) {
          callback(
            null,
            answers.map((item) => ({ ...item })),
          );
          return;
        }
        callback(null, answers[0].address, answers[0].family);
      },
      (error: unknown) => {
        const err = error instanceof Error ? error : new Error("dns");
        callback(Object.assign(err, { code: "EAI_AGAIN" }), "", 0);
      },
    );
  };
}

export type PageRequest = (
  target: URL,
  init: {
    userAgent: string;
    timeoutMs: number;
    lookup: LookupFunction;
  },
) => Promise<{ status: number; body: string }>;

export function requestAllowlistedPage(
  target: URL,
  init: {
    userAgent: string;
    timeoutMs: number;
    lookup: LookupFunction;
  },
): Promise<{ status: number; body: string }> {
  const transport = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      target,
      {
        method: "GET",
        headers: {
          "User-Agent": init.userAgent,
          Accept: "*/*",
          "Accept-Encoding": "identity",
        },
        lookup: init.lookup,
        timeout: init.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function fetchAllowlisted(
  raw: string,
  allowHosts: readonly string[],
  init: { userAgent: string; timeoutMs: number },
  request: PageRequest = requestAllowlistedPage,
): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
  const target = await assertSafeBrowserUrl(raw, { allowHosts });
  const page = await request(target, {
    ...init,
    lookup: safeConnectLookup(allowHosts),
  });
  // https.request はリダイレクトを追わない。3xx は呼び出し側がブラウザーへ渡す。
  return {
    ok: page.status >= 200 && page.status < 300,
    status: page.status,
    text: () => Promise.resolve(page.body),
  };
}
