import type { AdapterFactory, AdapterPayload } from "oidc-provider";
import type { McpProviderStore, McpStateRow } from "@/lib/mcpProviderStore";
import { createMcpStateCrypto, McpStateError } from "@/lib/mcpStateCrypto";

const limits = new Map([
  ["AuthorizationCode", 60],
  ["AccessToken", 600],
  ["RefreshToken", 30 * 86400],
  ["Grant", 30 * 86400],
  ["Session", 3600],
  ["Interaction", 600],
]);
const grantable = new Set(["AuthorizationCode", "AccessToken", "RefreshToken"]);

/** No singleton, DB construction, env lookup, fallback store, or HTTP mount. */
export async function createMcpProviderAdapter(deps: {
  crypto: ReturnType<typeof createMcpStateCrypto>;
  store: McpProviderStore;
  now?: () => Date;
}) {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("MCP_AUTH_REQUIRES_NODE_22");
  const { errors } = await import("oidc-provider");
  const now = deps.now ?? (() => new Date());
  function makeRow(
    model: string,
    id: string,
    payload: AdapterPayload,
    expiresAt: Date,
  ): McpStateRow {
    const keyHash = deps.crypto.digest(model, "id", id);
    const sealed = deps.crypto.seal(model, keyHash, payload);
    return {
      model,
      keyHash,
      ...sealed,
      payload: new Uint8Array(sealed.payload),
      grantId:
        model === "Grant"
          ? id
          : grantable.has(model)
            ? (payload.grantId ?? null)
            : null,
      uidHash:
        model === "Session" && payload.uid
          ? deps.crypto.digest(model, "uid", payload.uid)
          : null,
      userCodeHash: null, // Device/user-code grants are not enabled in v1.
      expiresAt,
      consumedAt: null,
    };
  }
  async function read(
    model: string,
    selector: { keyHash: string } | { uidHash: string },
  ) {
    const row = await deps.store.find(model, selector);
    if (!row || row.expiresAt <= now()) return undefined;
    const payload = deps.crypto.open(model, row.keyHash, row);
    // The atomic DB column is authoritative; provider saves cannot clear it.
    delete payload.consumed;
    if (row.consumedAt)
      payload.consumed = Math.floor(row.consumedAt.getTime() / 1000);
    return payload;
  }
  const adapter: AdapterFactory = (model) => {
    // Clients are explicitly configured by the future deployment. DCR/CIMD and
    // storage-backed client registration stay disabled, including unknown IDs.
    if (model === "Client")
      return {
        find: async () => undefined,
        findByUid: async () => undefined,
        findByUserCode: async () => undefined,
        upsert: async () => {
          throw new McpStateError();
        },
        consume: async () => {
          throw new McpStateError();
        },
        destroy: async () => {
          throw new McpStateError();
        },
        revokeByGrantId: async () => {
          throw new McpStateError();
        },
      };
    const maximum = limits.get(model);
    if (!maximum) throw new McpStateError();
    return {
      async upsert(id, payload, expiresIn) {
        if (
          !expiresIn ||
          !Number.isFinite(expiresIn) ||
          expiresIn <= 0 ||
          expiresIn > maximum ||
          (grantable.has(model) && !payload.grantId)
        )
          throw new McpStateError();
        const at = now().getTime();
        const expiry = Math.min(
          at + expiresIn * 1000,
          payload.exp === undefined ? Infinity : payload.exp * 1000,
        );
        if (!Number.isFinite(expiry) || expiry <= at) throw new McpStateError();
        await deps.store.put(makeRow(model, id, payload, new Date(expiry)));
      },
      find: (id) =>
        read(model, { keyHash: deps.crypto.digest(model, "id", id) }),
      findByUid: (uid) =>
        model === "Session"
          ? read(model, { uidHash: deps.crypto.digest(model, "uid", uid) })
          : Promise.resolve(undefined),
      findByUserCode: async () => undefined,
      async consume(id) {
        if (!grantable.has(model)) throw new McpStateError();
        if (
          !(await deps.store.consume(
            model,
            deps.crypto.digest(model, "id", id),
          ))
        )
          throw new errors.InvalidGrant();
      },
      destroy: (id) =>
        deps.store.destroy(
          model,
          deps.crypto.digest(model, "id", id),
          model === "Grant" ? id : undefined,
        ),
      revokeByGrantId: (grantId) => deps.store.revokeByGrantId(grantId),
    };
  };
  return {
    adapter,
    claimInteraction: (uid: string, expiresAt: Date) =>
      deps.store.claim(makeRow("InteractionClaim", uid, {}, expiresAt)),
  };
}
