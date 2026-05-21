import { describe, expect, it } from "vitest";
import { generateTotpCode } from "./totp";

describe("generateTotpCode", () => {
  const vectors = [
    { epoch: 59_000, sha1: "94287082", sha256: "46119246", sha512: "90693936" },
    { epoch: 1_111_111_109_000, sha1: "07081804", sha256: "68084774", sha512: "25091201" },
    { epoch: 1_111_111_111_000, sha1: "14050471", sha256: "67062674", sha512: "99943326" },
    { epoch: 1_234_567_890_000, sha1: "89005924", sha256: "91819424", sha512: "93441116" },
    { epoch: 2_000_000_000_000, sha1: "69279037", sha256: "90698825", sha512: "38618901" },
    { epoch: 20_000_000_000_000, sha1: "65353130", sha256: "77737706", sha512: "47863826" }
  ];

  const secrets = {
    SHA1: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    SHA256: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA",
    SHA512: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA"
  } as const;

  it("matches RFC 6238 SHA1, SHA256, and SHA512 vectors", () => {
    for (const vector of vectors) {
      expect(generateTotpCode({ secret: secrets.SHA1, algorithm: "SHA1", digits: 8, period: 30, epoch: vector.epoch })).toBe(vector.sha1);
      expect(generateTotpCode({ secret: secrets.SHA256, algorithm: "SHA256", digits: 8, period: 30, epoch: vector.epoch })).toBe(vector.sha256);
      expect(generateTotpCode({ secret: secrets.SHA512, algorithm: "SHA512", digits: 8, period: 30, epoch: vector.epoch })).toBe(vector.sha512);
    }
  });

  it("supports 6-digit and 8-digit output without changing generation logic", () => {
    const options = {
      secret: secrets.SHA1,
      algorithm: "SHA1" as const,
      period: 30,
      epoch: 59_000
    };

    expect(generateTotpCode({ ...options, digits: 8 })).toBe("94287082");
    expect(generateTotpCode({ ...options, digits: 6 })).toBe("287082");
  });
});
