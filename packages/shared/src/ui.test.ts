import { describe, expect, it } from "vitest";
import type { VaultEntry } from "./schemas";
import { filterVaultEntries, formatTotpCode, reorderVaultEntries } from "./ui";

const now = "2026-01-01T00:00:00.000Z";

const entries: VaultEntry[] = [
  {
    id: "one",
    issuer: "GitHub",
    accountName: "alice@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    tags: ["code"],
    createdAt: now,
    updatedAt: now
  },
  {
    id: "two",
    issuer: "Email",
    accountName: "work@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    tags: ["mail"],
    createdAt: now,
    updatedAt: now
  },
  {
    id: "three",
    issuer: "Bank",
    accountName: "finance@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    algorithm: "SHA1",
    digits: 8,
    period: 30,
    tags: ["money"],
    createdAt: now,
    updatedAt: now
  }
];

describe("formatTotpCode", () => {
  it("formats 6-digit codes as XXX XXX", () => {
    expect(formatTotpCode("152435")).toBe("152 435");
  });

  it("keeps longer codes readable without changing the raw value", () => {
    expect(formatTotpCode("12345678")).toBe("123 456 78");
  });
});

describe("filterVaultEntries", () => {
  it("searches issuer, account name, and tags", () => {
    expect(filterVaultEntries(entries, "github").map((entry) => entry.id)).toEqual(["one"]);
    expect(filterVaultEntries(entries, "work@example").map((entry) => entry.id)).toEqual(["two"]);
    expect(filterVaultEntries(entries, "money").map((entry) => entry.id)).toEqual(["three"]);
  });

  it("returns all entries for blank queries", () => {
    expect(filterVaultEntries(entries, "   ")).toBe(entries);
  });
});

describe("reorderVaultEntries", () => {
  it("moves entries without mutating the input array", () => {
    const reordered = reorderVaultEntries(entries, "two", -1);
    expect(reordered.map((entry) => entry.id)).toEqual(["two", "one", "three"]);
    expect(entries.map((entry) => entry.id)).toEqual(["one", "two", "three"]);
  });

  it("keeps the same array when movement is out of bounds", () => {
    expect(reorderVaultEntries(entries, "one", -1)).toBe(entries);
    expect(reorderVaultEntries(entries, "missing", 1)).toBe(entries);
  });
});
