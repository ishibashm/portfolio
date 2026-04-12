import crypto from "crypto";

// Ensure a 32-byte secret key is available for AES-256
function getSecretKey() {
  const secret = process.env.API_SECRET_KEY || process.env.NEXTAUTH_SECRET || "fallback_default_secret_key_123456";
  // Hash it to ensure it's exactly 32 bytes
  return crypto.createHash("sha256").update(String(secret)).digest();
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