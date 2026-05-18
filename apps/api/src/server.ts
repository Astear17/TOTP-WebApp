import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { env } from "./env.js";
import { loginSchema, putVaultSchema, registerSchema } from "./validation.js";

type JwtUser = { sub: string; email: string };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

export function buildServer(prisma = new PrismaClient()): FastifyInstance {
  const app = Fastify({
    logger: env.NODE_ENV === "production" || env.NODE_ENV === "test" ? false : { level: "info" }
  });

  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    }
  });
  app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: false
  });
  app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });
  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: "12h" }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: "Invalid request body.", details: error.flatten().fieldErrors });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "Internal server error." });
  });

  app.get("/api/health", async () => ({ ok: true, service: "totp-webapp-api" }));

  app.post("/api/auth/register", { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.status(400).send({ error: "Unable to register with these credentials." });

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({ data: { email, passwordHash } });
    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return reply.status(201).send({ token, email: user.email });
  });

  app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const email = body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
    if (!valid || !user) return reply.status(401).send({ error: "Invalid credentials." });

    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return { token, email: user.email };
  });

  app.post("/api/auth/logout", async () => ({ ok: true }));

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/vault")) return;
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized." });
    }
  });

  app.get("/api/vault", async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    return { encryptedVault: user?.encryptedVault ?? null };
  });

  app.put("/api/vault", async (request, reply) => {
    const body = putVaultSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) return reply.status(401).send({ error: "Unauthorized." });

    if (typeof body.expectedRevision === "number" && user.vaultRevision !== body.expectedRevision) {
      return reply.status(409).send({
        error: "Remote vault changed. Resolve the conflict before overwriting.",
        encryptedVault: user.encryptedVault
      });
    }

    // The API stores the client-provided encrypted blob as opaque JSON. It never
    // decrypts, logs, validates, or derives any plaintext TOTP secret or code.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        encryptedVault: body.encryptedVault,
        vaultVersion: body.encryptedVault.vaultVersion,
        vaultRevision: body.encryptedVault.revision,
        vaultUpdatedAt: new Date(body.encryptedVault.updatedAt)
      }
    });

    return { encryptedVault: updated.encryptedVault };
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
