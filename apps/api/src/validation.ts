import { z } from "zod";

const encryptedVaultRecordSchema = z.object({
  id: z.string(),
  vaultVersion: z.literal(1),
  kdf: z.object({
    name: z.literal("PBKDF2-SHA256"),
    iterations: z.number().int().min(100000),
    salt: z.string().min(16)
  }),
  cipher: z.object({
    name: z.literal("AES-GCM"),
    iv: z.string().min(16),
    ciphertext: z.string().min(1)
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revision: z.number().int().nonnegative()
});

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(256)
});

export const loginSchema = registerSchema;

export const putVaultSchema = z.object({
  encryptedVault: encryptedVaultRecordSchema,
  expectedRevision: z.number().int().nonnegative().optional()
});
