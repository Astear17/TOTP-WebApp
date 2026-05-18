import { describe, expect, it } from "vitest";
import { parseOtpAuthUri } from "./otpauth";

describe("parseOtpAuthUri", () => {
  it("parses a standard TOTP URI", () => {
    const parsed = parseOtpAuthUri("otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA256&digits=8&period=45");
    expect(parsed).toEqual({
      issuer: "Example",
      accountName: "alice@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA256",
      digits: 8,
      period: 45
    });
  });

  it("rejects non-TOTP URIs", () => {
    expect(() => parseOtpAuthUri("otpauth://hotp/Example:alice?secret=JBSWY3DPEHPK3PXP")).toThrow("Only otpauth://totp");
  });

  it("uses a neutral issuer fallback when an export omits issuer", () => {
    const parsed = parseOtpAuthUri("otpauth://totp/alice@example.com?secret=JBSWY3DPEHPK3PXP");
    expect(parsed.issuer).toBe("Imported");
    expect(parsed.accountName).toBe("alice@example.com");
  });
});
