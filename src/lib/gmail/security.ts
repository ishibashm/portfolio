import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class GmailError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function requireGmailEnabled() {
  if (process.env.LISTING_EMAIL_GMAIL_ENABLED !== "true")
    throw new GmailError("GMAIL_DISABLED");
}
export function gmailConfig() {
  requireGmailEnabled();
  const clientId = process.env.LISTING_EMAIL_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.LISTING_EMAIL_GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.LISTING_EMAIL_GOOGLE_REDIRECT_URI;
  const encoded = process.env.LISTING_EMAIL_ENCRYPTION_KEY;
  const keyId = process.env.LISTING_EMAIL_ENCRYPTION_KEY_ID;
  if (
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !encoded ||
    !keyId ||
    !/^[A-Za-z0-9_-]{1,40}$/.test(keyId) ||
    !/^[A-Za-z0-9+/]{43}=$/.test(encoded)
  )
    throw new GmailError("GMAIL_CONFIG");
  const key = Buffer.from(encoded, "base64");
  let uri: URL;
  try {
    uri = new URL(redirectUri);
  } catch {
    throw new GmailError("GMAIL_CONFIG");
  }
  if (
    key.length !== 32 ||
    uri.protocol !== "https:" ||
    uri.username ||
    uri.password ||
    uri.hash ||
    uri.search ||
    uri.pathname !== "/api/relocation/email/gmail/callback"
  )
    throw new GmailError("GMAIL_CONFIG");
  return { clientId, clientSecret, redirectUri, key, keyId };
}
export function seal(value: unknown, ownerId: string, connectionId: string) {
  const { key, keyId } = gmailConfig();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(JSON.stringify([ownerId, connectionId, keyId])));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    keyId,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}
export function unseal(
  value: string,
  ownerId: string,
  connectionId: string,
): unknown {
  try {
    const { key, keyId } = gmailConfig();
    const parts = value.split(".");
    if (parts.length !== 4 || parts[0] !== keyId) throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(parts[1], "base64url"),
    );
    decipher.setAAD(
      Buffer.from(JSON.stringify([ownerId, connectionId, keyId])),
    );
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(parts[3], "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new GmailError("GMAIL_CIPHERTEXT");
  }
}
