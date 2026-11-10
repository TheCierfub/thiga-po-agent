import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** 32 octets, encodés en base64. `openssl rand -base64 32`. */
export function linearCookieKey(secret: string | undefined): Buffer | null {
  if (!secret?.trim()) return null;
  const key = Buffer.from(secret.trim(), "base64");
  return key.length === 32 ? key : null;
}

/** AES-256-GCM. Le jeton ne contient pas le texte en clair. */
export function sealJson(value: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function openJson<T>(token: string, key: Buffer): T | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 12 + 16 + 1) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
