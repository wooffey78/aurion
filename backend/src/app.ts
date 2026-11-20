import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { readFileSync } from "node:fs";
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
import { dataImportRoutes } from "./routes/data-import.js";
import { cloudRoutes } from "./routes/cloud.js";
import { expenseReportRoutes } from "./routes/expense-reports.js";
import { paRoutes } from "./routes/pa.js";
import { bankRoutes } from "./routes/bank.js";
import { paymentRoutes } from "./routes/payments.js";
import { paOutgoingRoutes } from "./routes/pa-outgoing.js";
import { paEreportingRoutes } from "./routes/pa-ereporting.js";
import { syncReplicationRoutes } from "./routes/sync.js";
import { androidAssetLinksRoutes } from "./routes/assetlinks.js";
import { AurionError } from "./services/errors.js";
import { query, db, tenantRequestScope } from "./db.js";
import { loggerOptions, recordRequest, metricsSnapshot } from "./services/observability.js";
import { randomUUID } from "node:crypto";
import lightMyRequest from "light-my-request";

export async function buildApp() {
  // Bloc 24 — journalisation structurée : JSON avec service/version/environnement, chaque
  // requête reçoit un identifiant unique renvoyé dans X-Request-Id (reliability ticket ↔ logs).
  const app = Fastify({
    ...loggerOptions(),
    genReqId: () => randomUUID(),
    trustProxy: config.NODE_ENV === "production",
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
  });
  // Métriques internes (aucun identifiant utilisateur/client) ; l'endpoint reste réservé à l'admin.
  app.addHook("onResponse", async (request, reply) => { recordRequest(reply.statusCode); });

  // Bloc 1 : la page d'accueil est servie avec la configuration canonique injectée depuis
  // l'environnement serveur (APP_BASE_URL). Aucune URL de production n'est codée en dur dans
  // les sources du frontend (assets/js/config.js lit cette balise) ; le mode local Windows et
  // les enveloppes natives qui posent window.AURION_API_URL avant config.js restent inchangés.
  const indexFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../index.html");
  const serveIndex = async (_request: unknown, reply: any) => {
    const base = config.APP_BASE_URL.trim().replace(/"/g, "&quot;");
    reply
      .header("Cache-Control", "no-cache, no-store, must-revalidate")
      .header("Pragma", "no-cache")
      .header("Expires", "0")
      .type("text/html; charset=utf-8");
    const html = readFileSync(indexFile, "utf8");
    return reply.send(base ? html.replace(/<head([^>]*)>/i, `<head$1><meta name="aurion-api-base" content="${base}">`) : html);
  };
  app.get("/", serveIndex);
  app.get("/index.html", serveIndex);

  await app.register(cookie);
  // Le backend sert UNIQUEMENT le frontend (jamais .env, source, stockage privé, migrations...).
  await app.register(fastifyStatic, {
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../"),
    prefix: "/",
    decorateReply: false,
    dotfiles: "deny",
    index: ["index.html"],
    // /public/ sert uniquement les pages publiques autonomes (page suppression de compte).
    allowedPath: (p: string) => p === "/" || /^\/(index\.html|assets\/|branding\/|public\/)/.test(p) || /^\/(sw\.js|manifest\.webmanifest)$/.test(p),
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
  // Android/TWA : assetlinks pour l'association d'application (Digital Asset Links).
  await app.register(androidAssetLinksRoutes);
  // Bloc 24 — métriques internes (réservées à l'administration) : latence via journaux pino
  // (reqId + responseTime), taux 5xx, taille du pool PostgreSQL. Aucune donnée personnelle.
  app.get("/internal/metrics", { preHandler: app.requireAuth }, async (request, reply) => {
    const admin = await query("select 1 from platform_admins pa where pa.user_id=$1", [request.auth!.userId]);
    if (!admin.rowCount) return reply.code(403).send({ error: "FORBIDDEN" });
    const pool = db as unknown as { totalCount?: number; idleCount?: number; waitingCount?: number };
    return metricsSnapshot({ total: pool.totalCount ?? null, idle: pool.idleCount ?? null, waiting: pool.waitingCount ?? null });
  });
  await app.register(dashboardJournalRoutes);
  await app.register(clientAddressRoutes);
  await app.register(dataImportRoutes);
  await app.register(cloudRoutes);
  await app.register(expenseReportRoutes);
  await app.register(paRoutes);
  await app.register(bankRoutes);
  await app.register(paymentRoutes);
  await app.register(paOutgoingRoutes);
  await app.register(paEreportingRoutes);
  await app.register(syncReplicationRoutes);

  // Isolation multi-tenant (RLS 074) : enveloppe du cycle de vie complet de chaque requête HTTP dans un
  // contexte AsyncLocalStorage. Le plugin d'authentification y inscrit l'organisation active
  // (setRequestTenant) ; les requêtes SQL sous-jacentes posent alors un SET LOCAL transactionnel.
  // Sans organisation authentifiée, le contexte reste null : les tables protégées échouent fermé.
  // Deux chemins d'entrée sont couverts : le serveur HTTP réel (échange du listener « request »,
  // mêmes fonctions appelées dans le même contexte synchrone) et les requêtes injectées de test
  // (app.inject, qui n'emprunte PAS le listener HTTP).
  const injectable = app as unknown as { inject: (opts: unknown, cb?: unknown) => unknown };
  const httpHandler = app.routing;
  const tenantScopedHandler = ((req: never, res: never) =>
    tenantRequestScope.run({ organizationId: null }, () => httpHandler(req, res))) as typeof app.routing;
  // Fastify force ready() avant tout inject ; ce comportement est reproduit ici, puis la requête
  // injectée traverse le même contexte tenant que le serveur HTTP réel.
  injectable.inject = ((opts: unknown, cb?: unknown) =>
    app.ready().then(() => lightMyRequest(tenantScopedHandler, opts as never, cb as never))) as typeof app.inject;
  app.addHook("onReady", async function () {
    const server = (this as any).server;
    if (!server || typeof server.listeners !== "function") return;
    const listeners = server.listeners("request");
    if (!listeners.length) return;
    server.removeAllListeners("request");
    server.on("request", (req: unknown, res: unknown) => {
      tenantRequestScope.run({ organizationId: null }, () => {
        for (const listener of listeners) (listener as (a: unknown, b: unknown) => void).call(server, req, res);
      });
    });
  });

  return app;
}
