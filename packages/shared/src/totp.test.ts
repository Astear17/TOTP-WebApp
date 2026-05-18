import { describe, expect, it } from "vitest";
import { generateTotpCode } from "./totp";

describe("generateTotpCode", () => {
  it("generates stable RFC-style TOTP codes with SHA1", () => {
    expect(generateTotpCode({
      secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      digits: 8,
      period: 30,
      epoch: 59000
    })).toBe("94287082");
  });
});
