/** Server adapter contract. No OAuth implementation or credentials here. */
export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";
export interface ListingEmailConnectionMeta {
  id: string;
  userId: string;
  provider: "gmail";
  labelId: string;
  startedAt: string;
  encryptedRefreshToken: string;
  encryptionKeyVersion: string;
  syncCursor: string | null;
}
export interface ListingEmailReadWindow {
  connectionId: string;
  labelId: string;
  startedAt: string;
  /** Total for the entire pagination operation (1..20), not a per-page limit. */
  maxMessages: number;
  /** Opaque, owner/connection/window-bound. Null explicitly starts a new operation. */
  cursor: string | null;
}
export interface ListingEmailReader {
  /** Owner comes from server authentication; raw MIME is transient only. */
  read(
    ownerId: string,
    window: ListingEmailReadWindow,
  ): Promise<{
    messages: readonly { rawMime: string }[];
    nextCursor: string | null;
  }>;
  disconnect(ownerId: string, connectionId: string): Promise<void>;
}
export const GMAIL_CONNECTION_STATUS = "not_connected" as const;
