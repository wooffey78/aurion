import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import security from "./plugins/security.js";
import auth from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { organizationRoutes } from "./routes/organizations.js";
import { moduleRoutes } from "./routes/modules.js";
import { documentsRoutes } from "./routes/documents.js";
import { businessRoutes } from "./routes/business.js";
import { integrationRoutes } from "./routes/integrations.js";
import { mailRoutes } from "./routes/mail.js";
import { accountRoutes } from "./routes/account.js";
import { settingsRoutes } from "./routes/settings.js";
import { supportRoutes } from "./routes/support.js";
import { adminRoutes } from "./routes/admin.js";
import { dashboardJournalRoutes } from "./routes/dashboard-journal.js";
import { clientAddressRoutes } from "./routes/client-addresses.js";
import { aiAssistanceRoutes } from "./routes/ai-assistance.js";
import { AurionError } from "./services/errors.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: config.NODE_ENV === "production",
  });

  await app.register(cookie);
  // Le backend sert UNIQUEMENT le frontend (jamais .env, source, stockage privé, migrations...).
  await app.register(fastifyStatic, {
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../"),
    prefix: "/",
    decorateReply: false,
    dotfiles: "deny",
    index: ["index.html"],
    allowedPath: (p: string) => p === "/" || /^\/(index\.html|assets\/|branding\/)/.test(p) || /^\/(sw\.js|manifest\.webmanifest)$/.test(p),
    setHeaders: (res, filePath) => {
      if (/\.(?:html|js|mjs|css|webmanifest)$/i.test(filePath)) {
        res.header("Cache-Control", "no-cache, no-store, must-revalidate");
        res.header("Pragma", "no-cache");
        res.header("Expires", "0");
      }
    },
  });
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 30, parts: 40 },
  });
  await app.register(security);
  await app.register(auth);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    if (error instanceof AurionError) return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    if ((error as any).statusCode === 413) return reply.code(413).send({ error: "FILE_TOO_LARGE" });
    if (error && typeof error === "object" && Boolean((error as { validation?: unknown }).validation)) {
      return reply.code(400).send({ error: "INVALID_REQUEST" });
    }
    return reply.code(500).send({ error: "INTERNAL_ERROR" });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(organizationRoutes);
  await app.register(moduleRoutes);
  await app.register(documentsRoutes);
  await app.register(businessRoutes);
  await app.register(integrationRoutes);
  await app.register(mailRoutes);
  await app.register(accountRoutes);
  await app.register(settingsRoutes);
  await app.register(supportRoutes);
  await app.register(adminRoutes);
  await app.register(dashboardJournalRoutes);
  await app.register(clientAddressRoutes);
  await app.register(aiAssistanceRoutes);

  return app;
}
