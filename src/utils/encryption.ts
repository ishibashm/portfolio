import crypto from "crypto";

/**
 * 開発でだけ使う鍵。**本番では絶対に使わない。**
 *
 * 以前はこれが「API_SECRET_KEY → NEXTAUTH_SECRET → これ」という
 * フォールバックの**最後の項**で、環境変数がどちらも無いと黙って使われた。
 * リポジトリは公開設定なので、そうなると利用者が保存した Gemini の API キーが
 * **誰でも読める鍵**で暗号化される。エラーにならないので気付けない。
 *
 * 本番で実際に何が起きているかは #592 でデプロイ時に出すようにして確かめた。
 * `API_SECRET_KEY` は設定されていて、この鍵は使われていなかった。
 * 使われていなかったからこそ、**外しても保存済みの暗号文はそのまま読める。**
 *
 * 名前を分けて `NODE_ENV !== "production"` で囲ったので、本番に落ちてくる
 * 経路は無い。
 */
const DEV_ONLY_KEY = "dev_only_insecure_key_do_not_use_in_production";

let warnedAboutDevKey = false;

/**
 * AES-256 用に 32 バイトの鍵を作る。
 *
 * `NEXTAUTH_SECRET` は見ない。NextAuth をやめた時点でどこにも設定されて
 * おらず、フォールバックの連鎖を長くしているだけだった。
 */
function getSecretKey() {
  const secret = process.env.API_SECRET_KEY;

  if (!secret) {
    // 本番は落とす。黙って弱い鍵に落ちるより、気付けるほうがよい。
    // 保存と読み出しのどちらも API_SECRET_KEY 前提で暗号化されているので、
    // 別の鍵で続けても復号できず、結局は動かない。
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "API_SECRET_KEY が設定されていません。Cloud Run の環境変数" +
          "（deploy.yml が読む ENV_FILE シークレット）に入れてください。",
      );
    }
    if (!warnedAboutDevKey) {
      warnedAboutDevKey = true;
      console.warn(
        "[encryption] API_SECRET_KEY 未設定のため開発用の鍵を使います。" +
          "この鍵で作った暗号文は本番では読めません。",
      );
    }
    return crypto.createHash("sha256").update(DEV_ONLY_KEY).digest();
  }

  // 長さを 32 バイトに揃えるためのハッシュ。鍵導出ではない。
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(text: string): string {
  if (!text) return text;

  const iv = crypto.randomBytes(16);
  const key = getSecretKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  // Format: iv:authTag:encryptedText
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedData: string): string | null {
  if (!encryptedData) return null;

  try {
    const parts = encryptedData.split(":");
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, encryptedText] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = getSecretKey();

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption failed", error);
    return null;
  }
}
