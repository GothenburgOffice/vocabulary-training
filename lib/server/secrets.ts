// API keys in site_settings are encrypted with AES-256-GCM. The key is SETTINGS_ENCRYPTION_KEY
// (32 bytes, base64) from the environment, so a database dump alone doesn't reveal them.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { HttpError } from "./http";

type Env = Record<string, string | undefined>;
function encryptionKey(env: Env) {
  const raw = env.SETTINGS_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}
export const encryptionReady = (env: Env = process.env) => encryptionKey(env) !== null;

export function encryptSecret(plain: string, env: Env = process.env) {
  const key = encryptionKey(env);
  if (!key)
    throw new HttpError(
      503,
      "Set SETTINGS_ENCRYPTION_KEY in .env (32 random bytes, base64) and restart to save API keys.",
    );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", ...[iv, cipher.getAuthTag(), data].map((p) => p.toString("base64"))].join(":");
}

// Null when the value can't be read: no or another encryption key, or tampered data.
export function decryptSecret(stored: string, env: Env = process.env): string | null {
  const key = encryptionKey(env);
  const [version, iv, tag, data] = stored.split(":");
  if (!key || version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}
