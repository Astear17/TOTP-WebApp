import jsSHA from "jssha";
import { isValidBase32Secret, normalizeBase32Secret } from "./otpauth";
import type { TotpAlgorithm } from "./schemas";

export type TotpOptions = {
  secret: string;
  algorithm?: TotpAlgorithm;
  digits?: 6 | 8;
  period?: number;
  epoch?: number;
};

export function generateTotpCode(options: TotpOptions): string {
  const secret = normalizeBase32Secret(options.secret);
  if (!isValidBase32Secret(secret)) {
    throw new Error("Invalid Base32 TOTP secret.");
  }

  const period = options.period ?? 30;
  const digits = options.digits ?? 6;
  const counter = Math.floor((options.epoch ?? Date.now()) / 1000 / period);
  const hmac = hmacHex(options.algorithm ?? "SHA1", base32ToHex(secret), counterToHex(counter));
  const offset = Number.parseInt(hmac.slice(-1), 16);
  const binary = (Number.parseInt(hmac.slice(offset * 2, offset * 2 + 8), 16) & 0x7fffffff).toString();
  return binary.slice(-digits).padStart(digits, "0");
}

export function getRemainingSeconds(period = 30, now = Date.now()): number {
  return period - Math.floor((now / 1000) % period);
}

function base32ToHex(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "")) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("Invalid Base32 TOTP secret.");
    bits += value.toString(2).padStart(5, "0");
  }

  let hex = "";
  for (let index = 0; index + 4 <= bits.length; index += 4) {
    hex += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return hex;
}

function counterToHex(counter: number): string {
  return counter.toString(16).padStart(16, "0");
}

function hmacHex(algorithm: TotpAlgorithm, secretHex: string, counterHex: string): string {
  const hash = algorithm === "SHA1" ? "SHA-1" : algorithm === "SHA256" ? "SHA-256" : "SHA-512";
  const sha = new jsSHA(hash, "HEX");
  sha.setHMACKey(secretHex, "HEX");
  sha.update(counterHex);
  return sha.getHMAC("HEX");
}
