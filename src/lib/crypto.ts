import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { env } from "@/env";

const ALGORITHM  = "aes-256-gcm";
const IV_LENGTH  = 12;  // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;

// Key must be 32 bytes — env.ENCRYPTION_KEY is 64-char hex
function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

export function encrypt(plaintext: string): string {
  const iv         = randomBytes(IV_LENGTH);
  const cipher     = createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: TAG_LENGTH });
  const encrypted  = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag        = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid ciphertext format");

  const iv        = Buffer.from(ivHex,  "hex");
  const tag       = Buffer.from(tagHex, "hex");
  const data      = Buffer.from(dataHex, "hex");
  const decipher  = createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: TAG_LENGTH });

  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}