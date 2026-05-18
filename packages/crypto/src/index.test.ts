import { describe, expect, it } from "vitest";
import { createEmptyVaultPayload, decryptVaultPayload, encryptVaultPayload } from "./index";

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
});
