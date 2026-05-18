import { z } from "zod";
import { totpAlgorithmSchema, type TotpAlgorithm } from "./schemas";

const base32Pattern = /^[A-Z2-7]+=*$/;

export function normalizeBase32Secret(secret: string): string {
  return secret.replace(/\s+/g, "").toUpperCase();
}

export function isValidBase32Secret(secret: string): boolean {
  const normalized = normalizeBase32Secret(secret);
  return normalized.length >= 8 && base32Pattern.test(normalized);
}

export type ParsedOtpAuthUri = {
  issuer: string;
  accountName: string;
  secret: string;
  algorithm: TotpAlgorithm;
  digits: 6 | 8;
  period: number;
};

export function parseOtpAuthUri(input: string): ParsedOtpAuthUri {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Invalid otpauth URI.");
  }

  if (url.protocol !== "otpauth:" || url.hostname !== "totp") {
    throw new Error("Only otpauth://totp URIs are supported.");
  }

  const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const [labelIssuer, ...accountParts] = label.split(":");
  const params = url.searchParams;
  const secret = normalizeBase32Secret(params.get("secret") ?? "");

  if (!isValidBase32Secret(secret)) {
    throw new Error("The TOTP secret is not valid Base32.");
  }

  const issuer = (params.get("issuer") || (accountParts.length ? labelIssuer : "")).trim();
  const accountName = (accountParts.length ? accountParts.join(":") : labelIssuer).trim();
  const algorithm = totpAlgorithmSchema.parse((params.get("algorithm") ?? "SHA1").toUpperCase());
  const digits = z.union([z.literal(6), z.literal(8)]).parse(Number(params.get("digits") ?? 6));
  const period = z.number().int().min(10).max(120).parse(Number(params.get("period") ?? 30));

  if (!issuer || !accountName) {
    throw new Error("The otpauth URI must include an issuer and account name.");
  }

  return { issuer, accountName, secret, algorithm, digits, period };
}
