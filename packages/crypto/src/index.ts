import { encryptedVaultRecordSchema, vaultPayloadSchema, type EncryptedVaultRecord, type VaultPayload } from "@totp-webapp/shared";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PBKDF2_ITERATIONS = 600000;

function cryptoApi(): Crypto {
  const api = globalThis.crypto;
  if (!api?.subtle) {
    throw new Error("Web Crypto API is required.");
  }
  return api;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const bytes = base64ToBytes(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function randomBase64(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  cryptoApi().getRandomValues(bytes);
  return bytesToBase64(bytes);
}

export async function deriveVaultKey(masterPassword: string, saltBase64: string, extractable = false): Promise<CryptoKey> {
  if (masterPassword.length < 12) {
    throw new Error("Master password must be at least 12 characters.");
  }

  const baseKey = await cryptoApi().subtle.importKey(
    "raw",
    encoder.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // PBKDF2 is used because it is built into Web Crypto across modern browsers.
  // Argon2id is preferable for password hashing, but reliable browser support
  // requires WASM bundling and a separate supply-chain review.
  return cryptoApi().subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToArrayBuffer(saltBase64),
      iterations: PBKDF2_ITERATIONS
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"]
  );
}

export async function exportVaultKey(key: CryptoKey): Promise<JsonWebKey> {
  return cryptoApi().subtle.exportKey("jwk", key);
}

export async function importVaultKey(key: JsonWebKey): Promise<CryptoKey> {
  return cryptoApi().subtle.importKey("jwk", key, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function encryptVaultPayload(
  payload: VaultPayload,
  masterPassword: string,
  existing?: Pick<EncryptedVaultRecord, "id" | "kdf" | "createdAt" | "revision">
): Promise<EncryptedVaultRecord> {
  const validPayload = vaultPayloadSchema.parse(payload);
  const salt = existing?.kdf.salt ?? randomBase64(16);
  const key = await deriveVaultKey(masterPassword, salt);
  return encryptVaultPayloadWithKey(validPayload, key, {
    id: existing?.id,
    salt,
    createdAt: existing?.createdAt,
    revision: existing?.revision
  });
}

export async function encryptVaultPayloadWithKey(
  payload: VaultPayload,
  key: CryptoKey,
  options: { id?: string; salt: string; createdAt?: string; revision?: number }
): Promise<EncryptedVaultRecord> {
  const iv = randomBase64(12);
  const now = new Date().toISOString();
  const ciphertext = await cryptoApi().subtle.encrypt(
    { name: "AES-GCM", iv: base64ToArrayBuffer(iv) },
    key,
    encoder.encode(JSON.stringify(vaultPayloadSchema.parse(payload)))
  );

  return encryptedVaultRecordSchema.parse({
    id: options.id ?? crypto.randomUUID(),
    vaultVersion: 1,
    kdf: {
      name: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
      salt: options.salt
    },
    cipher: {
      name: "AES-GCM",
      iv,
      ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    },
    createdAt: options.createdAt ?? now,
    updatedAt: now,
    revision: (options.revision ?? 0) + 1
  });
}

export async function decryptVaultPayload(record: EncryptedVaultRecord, masterPassword: string): Promise<VaultPayload> {
  const parsed = encryptedVaultRecordSchema.parse(record);
  const key = await deriveVaultKey(masterPassword, parsed.kdf.salt);
  return decryptVaultPayloadWithKey(parsed, key);
}

export async function decryptVaultPayloadWithKey(record: EncryptedVaultRecord, key: CryptoKey): Promise<VaultPayload> {
  const parsed = encryptedVaultRecordSchema.parse(record);
  try {
    const plaintext = await cryptoApi().subtle.decrypt(
      { name: "AES-GCM", iv: base64ToArrayBuffer(parsed.cipher.iv) },
      key,
      base64ToArrayBuffer(parsed.cipher.ciphertext)
    );
    return vaultPayloadSchema.parse(JSON.parse(decoder.decode(plaintext)));
  } catch {
    throw new Error("Unable to decrypt vault. Check the master password and backup file.");
  }
}

export function createEmptyVaultPayload(): VaultPayload {
  const now = new Date().toISOString();
  return { version: 1, entries: [], createdAt: now, updatedAt: now };
}
