import { z } from "zod";
import { parseOtpAuthUri, type ParsedOtpAuthUri } from "./otpauth";

type GoogleBatch = {
  entries: ParsedOtpAuthUri[];
  batchSize?: number;
  batchIndex?: number;
  batchId?: number;
};

const protonExportSchema = z.object({
  entries: z.array(z.object({
    content: z.object({
      uri: z.string(),
      entry_type: z.string().optional()
    })
  }))
});

export function parseTotpImportText(input: string): GoogleBatch {
  const trimmed = input.trim();
  if (trimmed.startsWith("otpauth-migration://")) {
    return parseGoogleAuthenticatorMigrationUri(trimmed);
  }
  return { entries: [parseOtpAuthUri(trimmed)] };
}

export function parseProtonAuthenticatorExport(input: string): ParsedOtpAuthUri[] {
  const parsed = protonExportSchema.parse(JSON.parse(input));
  return parsed.entries
    .filter((entry) => entry.content.entry_type?.toLowerCase() !== "hotp")
    .map((entry) => parseOtpAuthUri(entry.content.uri));
}

export function parseGoogleAuthenticatorMigrationUri(input: string): GoogleBatch {
  const url = new URL(input.trim());
  if (url.protocol !== "otpauth-migration:" || url.hostname !== "offline") {
    throw new Error("Invalid Google Authenticator migration URI.");
  }

  const data = url.searchParams.get("data");
  if (!data) throw new Error("Google Authenticator migration QR is missing data.");

  const payload = decodeMigrationPayload(base64ToBytes(data));
  const entries = payload.otpParameters
    .filter((entry) => entry.type === 2)
    .map((entry) => ({
      issuer: entry.issuer || inferIssuer(entry.name),
      accountName: inferAccountName(entry.name),
      secret: base32Encode(entry.secret),
      algorithm: algorithmFromGoogle(entry.algorithm),
      digits: digitsFromGoogle(entry.digits),
      period: 30
    }));

  if (entries.length === 0) {
    throw new Error("No supported TOTP entries were found in the Google Authenticator QR.");
  }

  return {
    entries,
    batchSize: payload.batchSize,
    batchIndex: payload.batchIndex,
    batchId: payload.batchId
  };
}

function decodeMigrationPayload(bytes: Uint8Array) {
  const reader = new ProtoReader(bytes);
  const payload: {
    otpParameters: Array<{
      secret: Uint8Array;
      name: string;
      issuer: string;
      algorithm: number;
      digits: number;
      type: number;
    }>;
    batchSize?: number;
    batchIndex?: number;
    batchId?: number;
  } = { otpParameters: [] };

  while (!reader.done()) {
    const { field, wire } = reader.tag();
    if (field === 1 && wire === 2) payload.otpParameters.push(decodeOtpParameters(reader.bytes()));
    else if (field === 3 && wire === 0) payload.batchSize = Number(reader.varint());
    else if (field === 4 && wire === 0) payload.batchIndex = Number(reader.varint());
    else if (field === 5 && wire === 0) payload.batchId = Number(reader.varint());
    else reader.skip(wire);
  }

  return payload;
}

function decodeOtpParameters(bytes: Uint8Array) {
  const reader = new ProtoReader(bytes);
  const entry: {
    secret: Uint8Array<ArrayBufferLike>;
    name: string;
    issuer: string;
    algorithm: number;
    digits: number;
    type: number;
  } = {
    secret: new Uint8Array(),
    name: "",
    issuer: "",
    algorithm: 1,
    digits: 1,
    type: 2
  };

  while (!reader.done()) {
    const { field, wire } = reader.tag();
    if (field === 1 && wire === 2) entry.secret = reader.bytes();
    else if (field === 2 && wire === 2) entry.name = reader.string();
    else if (field === 3 && wire === 2) entry.issuer = reader.string();
    else if (field === 4 && wire === 0) entry.algorithm = Number(reader.varint());
    else if (field === 5 && wire === 0) entry.digits = Number(reader.varint());
    else if (field === 6 && wire === 0) entry.type = Number(reader.varint());
    else reader.skip(wire);
  }

  return entry;
}

class ProtoReader {
  private offset = 0;

  constructor(private readonly bytesValue: Uint8Array) {}

  done(): boolean {
    return this.offset >= this.bytesValue.length;
  }

  tag(): { field: number; wire: number } {
    const value = Number(this.varint());
    return { field: value >> 3, wire: value & 7 };
  }

  varint(): bigint {
    let shift = 0n;
    let result = 0n;
    while (this.offset < this.bytesValue.length) {
      const byte = this.bytesValue[this.offset++];
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
    }
    throw new Error("Invalid protobuf varint.");
  }

  bytes(): Uint8Array {
    const length = Number(this.varint());
    const end = this.offset + length;
    if (end > this.bytesValue.length) throw new Error("Invalid protobuf length.");
    const value = new Uint8Array(length);
    value.set(this.bytesValue.subarray(this.offset, end));
    this.offset = end;
    return value;
  }

  string(): string {
    return new TextDecoder().decode(this.bytes());
  }

  skip(wire: number): void {
    if (wire === 0) {
      this.varint();
      return;
    }
    if (wire === 1) {
      this.offset += 8;
      return;
    }
    if (wire === 2) {
      this.bytes();
      return;
    }
    if (wire === 5) {
      this.offset += 4;
      return;
    }
    throw new Error("Unsupported protobuf wire type.");
  }
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = decodeURIComponent(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base32Encode(bytes: Uint8Array<ArrayBufferLike>): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += alphabet[Number.parseInt(chunk, 2)];
  }
  return output;
}

function algorithmFromGoogle(value: number): "SHA1" | "SHA256" | "SHA512" {
  if (value === 2) return "SHA256";
  if (value === 3) return "SHA512";
  return "SHA1";
}

function digitsFromGoogle(value: number): 6 | 8 {
  return value === 2 ? 8 : 6;
}

function inferIssuer(name: string): string {
  return name.includes(":") ? name.split(":")[0].trim() : "Imported";
}

function inferAccountName(name: string): string {
  return name.includes(":") ? name.split(":").slice(1).join(":").trim() : name.trim();
}
