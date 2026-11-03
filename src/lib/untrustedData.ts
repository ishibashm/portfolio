import { randomBytes } from "node:crypto";

/**
 * 道具の出力を AI へ渡す際の区切り。
 *
 * 固定文字列の区切りは、記事本文や外部データに同じ文字列が含まれると
 * 閉じタグを偽装できる。呼び出しごとに 16 バイトの乱数を付け、本文中の
 * 区切り文字列は切り詰め後に無害化する。
 */

const DEFAULT_MAX_CHARS = 6000;
const DELIMITER_TOKEN_RE =
  /(?:(?:BEGIN|END)_)?UNTRUSTED_TOOL_DATA(?:_[0-9a-zA-Z_-]*)?/gi;
const TRAILING_PARTIAL_RE = /(?:BEGIN|END)_UNTRUSTED[0-9a-zA-Z_-]*$/i;
const UNWRAP_NONCE_RE =
  /^BEGIN_UNTRUSTED_TOOL_DATA_([0-9a-fA-F]+)\n([\s\S]*)\nEND_UNTRUSTED_TOOL_DATA_\1$/;
const UNWRAP_PLAIN_RE =
  /^BEGIN_UNTRUSTED_TOOL_DATA\n([\s\S]*)\nEND_UNTRUSTED_TOOL_DATA$/;

export function untrustedNonce(): string {
  return randomBytes(16).toString("hex");
}

function sanitizeUntrusted(text: string): string {
  let current = text;
  while (DELIMITER_TOKEN_RE.test(current)) {
    DELIMITER_TOKEN_RE.lastIndex = 0;
    current = current.replace(DELIMITER_TOKEN_RE, "[removed-delimiter]");
  }
  current = current.replace(TRAILING_PARTIAL_RE, "[removed-delimiter]");
  return current;
}

export function wrapUntrusted(
  data: string,
  nonce = untrustedNonce(),
  maxChars = DEFAULT_MAX_CHARS,
): string {
  // 切り詰めによって区切り文字列が再構成されないよう、先に切り詰めてから無害化する。
  const truncated = data.slice(0, maxChars);
  const sanitized = sanitizeUntrusted(truncated);
  return `BEGIN_UNTRUSTED_TOOL_DATA_${nonce}\n${sanitized}\nEND_UNTRUSTED_TOOL_DATA_${nonce}`;
}

export function unwrapUntrusted(text: string): string {
  const nonceMatch = UNWRAP_NONCE_RE.exec(text);
  if (nonceMatch) return nonceMatch[2];
  const plainMatch = UNWRAP_PLAIN_RE.exec(text);
  if (plainMatch) return plainMatch[1];
  return text;
}
