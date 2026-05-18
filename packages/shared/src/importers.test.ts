import { describe, expect, it } from "vitest";
import { parseGoogleAuthenticatorMigrationUri, parseProtonAuthenticatorExport } from "./importers";

describe("importers", () => {
  it("parses Proton Authenticator export JSON", () => {
    const entries = parseProtonAuthenticatorExport(JSON.stringify({
      version: 1,
      entries: [{
        content: {
          entry_type: "Totp",
          uri: "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA1&digits=6&period=30"
        }
      }]
    }));
    expect(entries).toHaveLength(1);
    expect(entries[0].issuer).toBe("Example");
  });

  it("parses Google Authenticator migration payloads", () => {
    const uri = makeGoogleMigrationUri();
    const parsed = parseGoogleAuthenticatorMigrationUri(uri);
    expect(parsed.entries).toEqual([{
      issuer: "Example",
      accountName: "alice@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA1",
      digits: 6,
      period: 30
    }]);
    expect(parsed.batchSize).toBe(1);
    expect(parsed.batchIndex).toBe(0);
  });
});

function makeGoogleMigrationUri(): string {
  const secret = Uint8Array.from([72, 101, 108, 108, 111, 33, 222, 173, 190, 239]);
  const otp = concat(
    fieldBytes(1, secret),
    fieldString(2, "Example:alice@example.com"),
    fieldString(3, "Example"),
    fieldVarint(4, 1),
    fieldVarint(5, 1),
    fieldVarint(6, 2)
  );
  const payload = concat(
    fieldBytes(1, otp),
    fieldVarint(2, 1),
    fieldVarint(3, 1),
    fieldVarint(4, 0),
    fieldVarint(5, 7)
  );
  return `otpauth-migration://offline?data=${encodeURIComponent(bytesToBase64(payload))}`;
}

function fieldVarint(field: number, value: number): Uint8Array {
  return concat(varint((field << 3) | 0), varint(value));
}

function fieldBytes(field: number, value: Uint8Array): Uint8Array {
  return concat(varint((field << 3) | 2), varint(value.length), value);
}

function fieldString(field: number, value: string): Uint8Array {
  return fieldBytes(field, new TextEncoder().encode(value));
}

function varint(value: number): Uint8Array {
  const bytes: number[] = [];
  let current = value;
  while (current > 127) {
    bytes.push((current & 0x7f) | 0x80);
    current >>= 7;
  }
  bytes.push(current);
  return Uint8Array.from(bytes);
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
