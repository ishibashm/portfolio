import { randomUUID } from "node:crypto";
import { z } from "zod";
import { GMAIL_READONLY_SCOPE } from "@/lib/listingEmailConnection";
import { gmailStateSchema } from "./reader";
import {
  gmailConfig,
  GmailError,
  requireGmailEnabled,
  seal,
  unseal,
} from "./security";
import { googleJson } from "./transport";
import type { GmailConnectionRecord, GmailConnectionStore } from "./store";

const tokenSchema = z.object({
  access_token: z.string().min(1).max(8192),
  token_type: z.literal("Bearer"),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
  refresh_token: z.string().min(1).max(8192).optional(),
});
const labelSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(1000),
  type: z.enum(["user", "system"]),
});
/** ラベルを確定したとき、何日前に届いたメールから読むか。 */
export const GMAIL_LOOKBACK_DAYS = 7;
const GMAIL_LOOKBACK_MS = GMAIL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

export class GmailAccountService {
  constructor(
    private readonly store: GmailConnectionStore,
    private readonly create: (record: GmailConnectionRecord) => Promise<void>,
    private readonly transport: typeof fetch,
  ) {}

  async exchange(owner: string, code: string, verifier: string) {
    const config = gmailConfig();
    const token = tokenSchema.safeParse(
      await googleJson(
        this.transport,
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
            grant_type: "authorization_code",
            code,
            code_verifier: verifier,
          }).toString(),
        },
        Date.now() + 10000,
      ),
    );
    if (!token.success) throw new GmailError("OAUTH_TOKEN");
    const t = token.data;
    const cleanup = async () => {
      try {
        await googleJson(
          this.transport,
          "https://oauth2.googleapis.com/revoke",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              token: t.refresh_token ?? t.access_token,
            }).toString(),
          },
          Date.now() + 4000,
        );
      } catch {
        /* Fixed error only; no credential logging. */
      }
    };
    if (t.scope !== GMAIL_READONLY_SCOPE || !t.refresh_token) {
      await cleanup();
      throw new GmailError("OAUTH_GRANT");
    }
    const id = randomUUID();
    try {
      await this.create({
        id,
        userId: owner,
        labelId: null,
        startedAt: new Date(),
        sealedState: seal(
          {
            refreshToken: t.refresh_token,
            scope: GMAIL_READONLY_SCOPE,
            cursor: null,
          },
          owner,
          id,
        ),
      });
    } catch {
      await cleanup();
      throw new GmailError("OAUTH_SAVE_FAILED");
    }
    return id;
  }

  private async labelsOperation(owner: string, id: string, selected?: string) {
    requireGmailEnabled();
    const config = gmailConfig();
    try {
      const result = await this.store.withConnection(
        owner,
        id,
        async (record, save) => {
          if (!record || record.userId !== owner || record.id !== id)
            throw new GmailError("NOT_FOUND");
          const state = gmailStateSchema.parse(
            unseal(record.sealedState, owner, id),
          );
          const token = tokenSchema.parse(
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
              Date.now() + 10000,
            ),
          );
          if (token.scope !== GMAIL_READONLY_SCOPE)
            throw new GmailError("OAUTH_GRANT");
          const rotated =
            token.refresh_token && token.refresh_token !== state.refreshToken;
          state.refreshToken = token.refresh_token ?? state.refreshToken;
          try {
            const endpoint =
              "https://gmail.googleapis.com/gmail/v1/users/me/labels";
            const headers = { Authorization: `Bearer ${token.access_token}` };
            if (selected !== undefined) {
              const label = labelSchema.parse(
                await googleJson(
                  this.transport,
                  `${endpoint}/${encodeURIComponent(selected)}?fields=id,name,type`,
                  { headers },
                  Date.now() + 10000,
                ),
              );
              if (label.id !== selected || label.type !== "user")
                throw new GmailError("INVALID_LABEL");
              /*
                確定の 7 日前から読む（利用者の判断、2026-09-25「過去 7 日
                読めたらいいかな」）。以前は確定した瞬間からで、受信箱に
                既にある通知は 1 通も読めず、確定直後の取り込みは必ず 0 件
                だった。reader はこの時刻で after: と internalDate を切る
              */
              const startedAt = new Date(Date.now() - GMAIL_LOOKBACK_MS);
              state.cursor = null;
              await save(seal(state, owner, id), {
                labelId: selected,
                startedAt,
              });
              return {
                selected: {
                  connectionId: id,
                  labelId: selected,
                  startedAt: startedAt.toISOString(),
                },
              };
            }
            const result = z
              .object({ labels: z.array(labelSchema).max(10000).optional() })
              .parse(
                await googleJson(
                  this.transport,
                  `${endpoint}?fields=labels(id,name,type)`,
                  { headers },
                  Date.now() + 10000,
                ),
              );
            if (rotated) await save(seal(state, owner, id));
            return {
              labels: (result.labels ?? [])
                .filter((l) => l.type === "user")
                .map(({ id, name }) => ({ id, name })),
            };
          } catch (error) {
            if (rotated) {
              // Preserve rotation on provider failure without advancing a cursor.
              const original = gmailStateSchema.parse(
                unseal(record.sealedState, owner, id),
              );
              original.refreshToken = state.refreshToken;
              await save(seal(original, owner, id));
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
    } catch (error) {
      throw error instanceof GmailError
        ? error
        : new GmailError("GMAIL_UNAVAILABLE");
    }
  }
  listLabels(owner: string, id: string) {
    return this.labelsOperation(owner, id);
  }
  selectLabel(owner: string, id: string, labelId: string) {
    return this.labelsOperation(owner, id, labelId);
  }
}
