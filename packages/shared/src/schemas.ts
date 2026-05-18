import { z } from "zod";

export const totpAlgorithmSchema = z.enum(["SHA1", "SHA256", "SHA512"]);
export type TotpAlgorithm = z.infer<typeof totpAlgorithmSchema>;

export const vaultEntrySchema = z.object({
  id: z.string().min(1),
  issuer: z.string().trim().min(1).max(120),
  accountName: z.string().trim().min(1).max(180),
  secret: z.string().trim().min(8),
  algorithm: totpAlgorithmSchema.default("SHA1"),
  digits: z.union([z.literal(6), z.literal(8)]).default(6),
  period: z.number().int().min(10).max(120).default(30),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type VaultEntry = z.infer<typeof vaultEntrySchema>;

export const vaultPayloadSchema = z.object({
  version: z.literal(1),
  entries: z.array(vaultEntrySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type VaultPayload = z.infer<typeof vaultPayloadSchema>;

export const encryptedVaultRecordSchema = z.object({
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

export type EncryptedVaultRecord = z.infer<typeof encryptedVaultRecordSchema>;

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(256)
});

export const loginSchema = registerSchema;

export const putVaultSchema = z.object({
  encryptedVault: encryptedVaultRecordSchema,
  expectedRevision: z.number().int().nonnegative().optional()
});

export type PutVaultRequest = z.infer<typeof putVaultSchema>;
