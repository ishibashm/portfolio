import { randomUUID } from "node:crypto";
import type {
  ListingEmailConnectionMeta,
  ListingEmailReader,
  ListingEmailReadWindow,
} from "@/lib/listingEmailConnection";
import { GMAIL_READONLY_SCOPE } from "@/lib/listingEmailConnection";
import { extractEmailUrls } from "@/lib/listingEmailIngest";

/** Synthetic fixtures only. Never register this adapter in production routes. */
export interface FakeEmailConnection {
  connection: ListingEmailConnectionMeta;
  scopes: readonly string[];
  label: { id: string; type: "user" | "system" };
  messages: readonly {
    id: string;
    labelIds: readonly string[];
    internalDate: number;
    rawMime: string;
  }[];
}
export class EmailReaderError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "INVALID_WINDOW"
      | "INVALID_CURSOR"
      | "INVALID_FIXTURE"
      | "INVALID_MESSAGE",
  ) {
    super(code);
  }
}
type Cursor = {
  ownerId: string;
  connectionId: string;
  labelId: string;
  startedAt: string;
  maxMessages: number;
  offset: number;
  expiresAt: number;
};

/** No network, persistence, logging, OAuth, geocoding or candidate writes. */
export class FakeListingEmailReader implements ListingEmailReader {
  private readonly connections = new Map<string, FakeEmailConnection>();
  private readonly cursors = new Map<string, Cursor>();
  private readonly pageSize: number;
  private readonly cursorTtlMs: number;
  private readonly now: () => number;

  constructor(
    fixtures: readonly FakeEmailConnection[],
    options: {
      pageSize?: number;
      cursorTtlMs?: number;
      now?: () => number;
    } = {},
  ) {
    this.pageSize = options.pageSize ?? 5;
    this.cursorTtlMs = options.cursorTtlMs ?? 300000;
    this.now = options.now ?? Date.now;
    if (
      !Number.isInteger(this.pageSize) ||
      this.pageSize < 1 ||
      this.pageSize > 20 ||
      !Number.isFinite(this.cursorTtlMs) ||
      this.cursorTtlMs <= 0
    )
      throw new EmailReaderError("INVALID_FIXTURE");
    for (const fixture of fixtures) {
      const c = fixture.connection;
      if (
        this.connections.has(c.id) ||
        !c.id ||
        !c.userId ||
        c.provider !== "gmail" ||
        !Number.isFinite(Date.parse(c.startedAt)) ||
        !c.encryptedRefreshToken ||
        !c.encryptionKeyVersion ||
        c.syncCursor !== null ||
        fixture.scopes.length !== 1 ||
        fixture.scopes[0] !== GMAIL_READONLY_SCOPE ||
        fixture.label.type !== "user" ||
        !c.labelId ||
        fixture.label.id !== c.labelId ||
        new Set(fixture.messages.map((m) => m.id)).size !==
          fixture.messages.length ||
        fixture.messages.some((m) => !m.id || !Number.isFinite(m.internalDate))
      )
        throw new EmailReaderError("INVALID_FIXTURE");
      // No aliases to caller-owned fixtures; changes cannot bypass the contract.
      this.connections.set(c.id, structuredClone(fixture));
    }
  }

  async read(ownerId: string, window: ListingEmailReadWindow) {
    const fixture = this.connections.get(window.connectionId);
    if (!fixture || fixture.connection.userId !== ownerId)
      throw new EmailReaderError("NOT_FOUND");
    const c = fixture.connection;
    if (
      window.labelId !== c.labelId ||
      window.startedAt !== c.startedAt ||
      !Number.isInteger(window.maxMessages) ||
      window.maxMessages < 1 ||
      window.maxMessages > 20
    )
      throw new EmailReaderError("INVALID_WINDOW");
    let offset = 0;
    if (window.cursor !== null) {
      const cursor = this.cursors.get(window.cursor);
      if (
        !cursor ||
        cursor.ownerId !== ownerId ||
        cursor.connectionId !== c.id ||
        cursor.labelId !== window.labelId ||
        cursor.startedAt !== window.startedAt ||
        cursor.maxMessages !== window.maxMessages ||
        cursor.expiresAt <= this.now() ||
        c.syncCursor !== window.cursor
      )
        throw new EmailReaderError("INVALID_CURSOR");
      offset = cursor.offset;
    }
    const eligible = fixture.messages
      .filter(
        (m) =>
          m.labelIds.includes(c.labelId) &&
          m.internalDate >= Date.parse(c.startedAt),
      )
      .sort(
        (a, b) => a.internalDate - b.internalDate || a.id.localeCompare(b.id),
      )
      .slice(0, window.maxMessages);
    const page = eligible.slice(offset, offset + this.pageSize);
    // Validate before advancing a cursor; failures do not checkpoint raw MIME.
    try {
      for (const message of page) extractEmailUrls(message.rawMime, "mime");
    } catch {
      throw new EmailReaderError("INVALID_MESSAGE");
    }
    const nextOffset = offset + page.length;
    const nextCursor = nextOffset < eligible.length ? randomUUID() : null;
    if (c.syncCursor) this.cursors.delete(c.syncCursor);
    if (nextCursor)
      this.cursors.set(nextCursor, {
        ownerId,
        connectionId: c.id,
        labelId: c.labelId,
        startedAt: c.startedAt,
        maxMessages: window.maxMessages,
        offset: nextOffset,
        expiresAt: this.now() + this.cursorTtlMs,
      });
    c.syncCursor = nextCursor;
    return { messages: page.map(({ rawMime }) => ({ rawMime })), nextCursor };
  }

  async disconnect(ownerId: string, connectionId: string) {
    const fixture = this.connections.get(connectionId);
    // Idempotent and indistinguishable for missing / foreign connections.
    if (!fixture || fixture.connection.userId !== ownerId) return;
    for (const [id, cursor] of this.cursors) {
      if (cursor.ownerId === ownerId && cursor.connectionId === connectionId)
        this.cursors.delete(id);
    }
    // Removes fake token, cursor, metadata and synthetic MIME references.
    this.connections.delete(connectionId);
  }

  /** Test diagnostics only, never expose through an API. Returns no MIME. */
  inspect(ownerId: string, connectionId: string) {
    const fixture = this.connections.get(connectionId);
    return {
      connection:
        fixture?.connection.userId === ownerId
          ? { ...fixture.connection }
          : null,
      cursorCount: [...this.cursors.values()].filter(
        (c) => c.ownerId === ownerId && c.connectionId === connectionId,
      ).length,
    };
  }
}
