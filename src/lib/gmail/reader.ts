import { googleJson } from "./transport";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  GMAIL_READONLY_SCOPE,
  type ListingEmailReader,
  type ListingEmailReadWindow,
} from "@/lib/listingEmailConnection";
import {
  GMAIL_MIME_MAX_BYTES,
  extractEmailUrls,
  GMAIL_MIME_LIMITS,
} from "@/lib/listingEmailIngest";
import type { GmailConnectionStore } from "./store";
import {
  GmailError,
  gmailConfig,
  requireGmailEnabled,
  seal,
  unseal,
} from "./security";

const cursorSchema = z
  .object({
    handle: z.uuid(),
    pageToken: z.string().min(1).max(4096),
    maxMessages: z.number().int().min(1).max(20),
    examined: z.number().int().min(0).max(20),
    seen: z.array(z.string()).max(20),
    expiresAt: z.number(),
    labelId: z.string(),
    startedAt: z.string(),
  })
  .strict();
export const gmailStateSchema = z
  .object({
    refreshToken: z.string().min(1).max(8192),
    scope: z.literal(GMAIL_READONLY_SCOPE),
    cursor: cursorSchema.nullable(),
  })
  .strict();
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const metadataSchema = z.object({
  id: idSchema,
  labelIds: z.array(z.string()),
  internalDate: z.string().regex(/^\d+$/),
  sizeEstimate: z.number().int().nonnegative(),
});

export class GmailListingEmailReader implements ListingEmailReader {
  constructor(
    private readonly store: GmailConnectionStore,
    private readonly transport: typeof fetch = fetch,
  ) {}

  async read(ownerId: string, window: ListingEmailReadWindow) {
    requireGmailEnabled();
    const config = gmailConfig();
    try {
      const result = await this.store.withConnection(
        ownerId,
        window.connectionId,
        async (record, save) => {
          if (
            !record ||
            record.userId !== ownerId ||
            record.id !== window.connectionId
          )
            throw new GmailError("NOT_FOUND");
          if (
            !record.labelId ||
            window.labelId !== record.labelId ||
            window.startedAt !== record.startedAt.toISOString() ||
            !Number.isInteger(window.maxMessages) ||
            window.maxMessages < 1 ||
            window.maxMessages > 20
          )
            throw new GmailError("INVALID_WINDOW");
          const selectedLabelId = record.labelId;
          const state = gmailStateSchema.parse(
            unseal(record.sealedState, ownerId, record.id),
          );
          const previous = window.cursor === null ? null : state.cursor;
          if (
            window.cursor !== null &&
            (!previous ||
              previous.handle !== window.cursor ||
              previous.expiresAt <= Date.now() ||
              previous.maxMessages !== window.maxMessages ||
              previous.labelId !== record.labelId ||
              previous.startedAt !== window.startedAt)
          )
            throw new GmailError("INVALID_CURSOR");
          const deadline = Date.now() + 20000;
          const token = z
            .object({
              access_token: z.string().min(1).max(8192),
              token_type: z.literal("Bearer"),
              scope: z.literal(GMAIL_READONLY_SCOPE),
              expires_in: z.number().positive(),
              refresh_token: z.string().min(1).max(8192).optional(),
            })
            .parse(
              await googleJson(
                this.transport,
                "https://oauth2.googleapis.com/token",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                  },
                  body: new URLSearchParams({
                    client_id: config.clientId,
                    client_secret: config.clientSecret,
                    grant_type: "refresh_token",
                    refresh_token: state.refreshToken,
                  }).toString(),
                },
                deadline,
              ),
            );
          const oldCursor = state.cursor;
          const rotated =
            token.refresh_token && token.refresh_token !== state.refreshToken;
          state.refreshToken = token.refresh_token ?? state.refreshToken;
          try {
            const headers = { Authorization: `Bearer ${token.access_token}` };
            const base = "https://gmail.googleapis.com/gmail/v1/users/me/";
            const label = z
              .object({ id: z.string(), type: z.literal("user") })
              .parse(
                await googleJson(
                  this.transport,
                  `${base}labels/${encodeURIComponent(record.labelId)}`,
                  { headers },
                  deadline,
                ),
              );
            if (label.id !== record.labelId)
              throw new GmailError("GMAIL_LABEL");
            const examined = previous?.examined ?? 0;
            const remaining = window.maxMessages - examined;
            if (remaining <= 0) throw new GmailError("INVALID_CURSOR");
            const query = new URLSearchParams({
              labelIds: record.labelId,
              maxResults: String(Math.min(5, remaining)),
              q: `after:${Math.floor(record.startedAt.getTime() / 1000) - 1}`,
              includeSpamTrash: "false",
            });
            if (previous) query.set("pageToken", previous.pageToken);
            const list = z
              .object({
                messages: z
                  .array(z.object({ id: idSchema }))
                  .max(Math.min(5, remaining))
                  .optional(),
                nextPageToken: z.string().min(1).max(4096).optional(),
              })
              .parse(
                await googleJson(
                  this.transport,
                  `${base}messages?${query}`,
                  { headers },
                  deadline,
                ),
              );
            const seen = new Set(previous?.seen ?? []);
            const messages: { rawMime: string }[] = [];
            for (const { id } of list.messages ?? []) {
              if (seen.has(id)) continue;
              seen.add(id);
              const endpoint = `${base}messages/${id}`;
              const meta = metadataSchema.parse(
                await googleJson(
                  this.transport,
                  `${endpoint}?format=metadata&fields=id,labelIds,internalDate,sizeEstimate`,
                  { headers },
                  deadline,
                ),
              );
              const inRange = (m: z.infer<typeof metadataSchema>) =>
                m.id === id &&
                m.labelIds.includes(selectedLabelId) &&
                Number(m.internalDate) >= record.startedAt.getTime();
              if (!inRange(meta)) continue;
              if (meta.sizeEstimate > GMAIL_MIME_MAX_BYTES)
                throw new GmailError("GMAIL_MESSAGE_SIZE");
              const raw = metadataSchema
                .extend({
                  raw: z
                    .string()
                    .max(Math.ceil(GMAIL_MIME_MAX_BYTES / 3) * 4)
                    .regex(/^[A-Za-z0-9_-]+={0,2}$/),
                })
                .parse(
                  await googleJson(
                    this.transport,
                    `${endpoint}?format=raw&fields=id,labelIds,internalDate,sizeEstimate,raw`,
                    { headers },
                    deadline,
                    Math.ceil(GMAIL_MIME_MAX_BYTES / 3) * 4 + 16384,
                  ),
                );
              if (!inRange(raw)) continue;
              const bytes = Buffer.from(raw.raw, "base64url");
              if (
                bytes.length > GMAIL_MIME_MAX_BYTES ||
                raw.sizeEstimate > GMAIL_MIME_MAX_BYTES
              )
                throw new GmailError("GMAIL_MESSAGE_SIZE");
              const rawMime = new TextDecoder("utf-8", { fatal: true }).decode(
                bytes,
              );
              extractEmailUrls(
                rawMime,
                "mime",
                undefined,
                undefined,
                GMAIL_MIME_LIMITS,
              );
              messages.push({ rawMime });
            }
            // Empty/repeating provider pages cannot keep an operation alive forever.
            const nextExamined =
              examined + Math.max(1, list.messages?.length ?? 0);
            const nextCursor =
              list.nextPageToken && nextExamined < window.maxMessages
                ? randomUUID()
                : null;
            state.refreshToken = token.refresh_token ?? state.refreshToken;
            state.cursor = nextCursor
              ? {
                  handle: nextCursor,
                  pageToken: list.nextPageToken!,
                  maxMessages: window.maxMessages,
                  examined: nextExamined,
                  seen: [...seen],
                  expiresAt: Date.now() + 300000,
                  labelId: record.labelId,
                  startedAt: window.startedAt,
                }
              : null;
            await save(seal(state, ownerId, record.id));
            return { messages, nextCursor };
          } catch (error) {
            if (rotated) {
              state.cursor = oldCursor;
              await save(seal(state, ownerId, record.id));
            }
            return {
              failure:
                error instanceof GmailError
                  ? error
                  : new GmailError("GMAIL_UNAVAILABLE"),
            };
          }
        },
      );
      if ("failure" in result) throw result.failure;
      return result;
    } catch (e) {
      throw e instanceof GmailError ? e : new GmailError("GMAIL_UNAVAILABLE");
    }
  }

  async disconnect(ownerId: string, connectionId: string) {
    requireGmailEnabled();
    // Return the revoke result from the transaction so deletion commits even on failure.
    let revoked: boolean;
    try {
      revoked = await this.store.withConnection(
        ownerId,
        connectionId,
        async (record, save) => {
          if (!record || record.userId !== ownerId) return true;
          let success = false;
          try {
            const state = gmailStateSchema.parse(
              unseal(record.sealedState, ownerId, record.id),
            );
            await googleJson(
              this.transport,
              "https://oauth2.googleapis.com/revoke",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  token: state.refreshToken,
                }).toString(),
              },
              Date.now() + 5000,
            );
            success = true;
          } catch {
            /* Local deletion must still commit. Never log token/provider errors. */
          }
          await save(null);
          return success;
        },
      );
    } catch {
      throw new GmailError("GMAIL_DELETE_FAILED");
    }
    if (!revoked) throw new GmailError("GMAIL_REVOKE_FAILED_LOCAL_DELETED");
  }
}
