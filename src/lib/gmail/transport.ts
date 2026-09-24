import { GmailError, requireGmailEnabled } from "./security";

export async function googleJson(
  transport: typeof fetch,
  url: string,
  init: RequestInit,
  deadline: number,
): Promise<unknown> {
  // All URLs originate below, never from message text or a redirect response.
  const u = new URL(url);
  if (
    !(
      (u.origin === "https://gmail.googleapis.com" &&
        u.pathname.startsWith("/gmail/v1/users/me/")) ||
      (u.origin === "https://oauth2.googleapis.com" &&
        ["/token", "/revoke"].includes(u.pathname))
    )
  )
    throw new GmailError("GMAIL_ENDPOINT");
  requireGmailEnabled();
  if (Date.now() >= deadline) throw new GmailError("GMAIL_TIMEOUT");
  let response: Response;
  try {
    response = await transport(url, {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(3000, deadline - Date.now())),
    });
    if (response.ok && u.pathname === "/revoke") {
      await response.body?.cancel();
      return {};
    }
    const reader = response.body?.getReader();
    if (!reader) throw new GmailError("GMAIL_RESPONSE");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new GmailError("GMAIL_RESPONSE_SIZE");
      }
      chunks.push(value);
    }
    let value;
    try {
      value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new GmailError(
        response.status === 401 ? "GMAIL_RECONNECT" : "GMAIL_PROVIDER",
      );
    }
    if (!response.ok) {
      const expired =
        u.origin === "https://oauth2.googleapis.com" &&
        u.pathname === "/token" &&
        response.status === 400 &&
        value?.error === "invalid_grant";
      throw new GmailError(
        expired || response.status === 401
          ? "GMAIL_RECONNECT"
          : "GMAIL_PROVIDER",
      );
    }
    return value;
  } catch (e) {
    throw e instanceof GmailError ? e : new GmailError("GMAIL_PROVIDER");
  }
}
