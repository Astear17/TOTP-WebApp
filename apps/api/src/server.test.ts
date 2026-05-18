import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
  process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-jwt-signing";
  process.env.CORS_ORIGIN = "http://localhost:5173";
  process.env.NODE_ENV = "test";
});

describe("health route", () => {
  it("returns ok", async () => {
    const { buildServer } = await import("./server.js");
    const app = buildServer({ $disconnect: async () => undefined } as never);
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "totp-webapp-api" });
    await app.close();
  });
});
