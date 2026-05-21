import { describe, expect, it } from "vitest";
import { createEmptyVaultPayload, decryptVaultPayload, encryptVaultPayload } from "./index";
import { encryptedVaultRecordSchema, type VaultPayload } from "@totp-webapp/shared";

describe("vault crypto", () => {
  it("encrypts and decrypts a vault payload", async () => {
    const encrypted = await encryptVaultPayload(createEmptyVaultPayload(), "correct horse battery staple");
    const decrypted = await decryptVaultPayload(encrypted, "correct horse battery staple");
    expect(decrypted.entries).toEqual([]);
    expect(decrypted.version).toBe(1);
  });

  it("rejects the wrong master password", async () => {
    const encrypted = await encryptVaultPayload(createEmptyVaultPayload(), "correct horse battery staple");
    await expect(decryptVaultPayload(encrypted, "wrong horse battery staple")).rejects.toThrow("Unable to decrypt vault");
  });

  it("roundtrips encrypted backup JSON without changing the vault format", async () => {
    const payload: VaultPayload = {
      ...createEmptyVaultPayload(),
      entries: [{
        id: "entry-1",
        issuer: "Example",
        accountName: "alice@example.com",
        secret: "JBSWY3DPEHPK3PXP",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        tags: ["personal"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }]
    };
    const encrypted = await encryptVaultPayload(payload, "correct horse battery staple");
    const restored = encryptedVaultRecordSchema.parse(JSON.parse(JSON.stringify(encrypted)));
    const decrypted = await decryptVaultPayload(restored, "correct horse battery staple");

    expect(decrypted).toEqual(payload);
    expect(restored.vaultVersion).toBe(1);
    expect(restored.kdf.name).toBe("PBKDF2-SHA256");
    expect(restored.cipher.name).toBe("AES-GCM");
  });
});
