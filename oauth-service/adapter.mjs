import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const hashOAuthId = (value) =>
  createHash("sha256").update(value).digest("hex");
const keyId = (key) => hashOAuthId(key).slice(0, 16);

export function assertStorageKeys(keys) {
  if (
    !Array.isArray(keys) ||
    !keys.length ||
    keys.some((key) => !Buffer.isBuffer(key) || key.length !== 32)
  )
    throw new Error("OAuth storage key ring is required");
}

export function sealOAuthValue(keys, context, value) {
  assertStorageKeys(keys);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys[0], iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    v: 1,
    kid: keyId(keys[0]),
    iv: iv.toString("base64url"),
    ct: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function openOAuthValue(keys, context, stored) {
  assertStorageKeys(keys);
  if (
    !stored ||
    stored.v !== 1 ||
    typeof stored.kid !== "string" ||
    typeof stored.iv !== "string" ||
    typeof stored.ct !== "string" ||
    typeof stored.tag !== "string"
  )
    throw new Error("Invalid OAuth storage payload");
  const key = keys.find((candidate) => keyId(candidate) === stored.kid);
  if (!key) throw new Error("OAuth storage key unavailable");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(stored.iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(stored.tag, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(stored.ct, "base64url")),
    decipher.final(),
  ]);
  const payload = JSON.parse(plain.toString("utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Invalid OAuth storage payload");
  return payload;
}

/** Durable oidc-provider adapter with encrypted payloads and hashed lookups. */
export class PrismaOAuthAdapter {
  constructor(model, prisma, keys) {
    assertStorageKeys(keys);
    this.model = model;
    this.records = prisma.mcpOauthRecord;
    this.keys = keys;
  }

  async upsert(id, payload, expiresIn) {
    const idHash = hashOAuthId(id);
    const expiresAt = Number.isFinite(expiresIn)
      ? new Date(Date.now() + Math.max(0, expiresIn) * 1000)
      : null;
    const data = {
      payload: sealOAuthValue(this.keys, `${this.model}:${idHash}`, payload),
      expiresAt,
      consumedAt: null,
      grantIdHash:
        typeof payload.grantId === "string"
          ? hashOAuthId(payload.grantId)
          : null,
      uidHash:
        typeof payload.uid === "string" ? hashOAuthId(payload.uid) : null,
      userCodeHash:
        typeof payload.userCode === "string"
          ? hashOAuthId(payload.userCode)
          : null,
    };
    await this.records.upsert({
      where: { model_idHash: { model: this.model, idHash } },
      create: { model: this.model, idHash, ...data },
      update: data,
    });
  }

  async #find(where) {
    const row = await this.records.findFirst({ where });
    if (!row || (row.expiresAt && row.expiresAt.getTime() <= Date.now()))
      return undefined;
    const payload = openOAuthValue(
      this.keys,
      `${this.model}:${row.idHash}`,
      row.payload,
    );
    return row.consumedAt
      ? { ...payload, consumed: Math.floor(row.consumedAt.getTime() / 1000) }
      : payload;
  }

  async find(id) {
    return this.#find({ model: this.model, idHash: hashOAuthId(id) });
  }
  async findByUid(uid) {
    return this.#find({ model: this.model, uidHash: hashOAuthId(uid) });
  }
  async findByUserCode(userCode) {
    return this.#find({
      model: this.model,
      userCodeHash: hashOAuthId(userCode),
    });
  }

  async consume(id) {
    const result = await this.records.updateMany({
      where: { model: this.model, idHash: hashOAuthId(id), consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (result.count !== 1) throw new Error("OAuth artifact already consumed");
  }

  async destroy(id) {
    await this.records.deleteMany({
      where: { model: this.model, idHash: hashOAuthId(id) },
    });
  }

  async revokeByGrantId(grantId) {
    await this.records.deleteMany({
      where: { model: this.model, grantIdHash: hashOAuthId(grantId) },
    });
  }
}

export const prismaOAuthAdapter = (prisma, keys) =>
  class extends PrismaOAuthAdapter {
    constructor(model) {
      super(model, prisma, keys);
    }
  };
