import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { organizationSchema } from "../services/validation.js";
import { applyConfigurationQuestionnaire, syncPrimaryActivityFromOrganization } from "../services/configuration-sync.js";
import { randomUUID } from "node:crypto";
import { readPrivateObject, writePrivateObject, deletePrivateObject } from "../services/storage.js";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** Type réel du logo d'après sa signature binaire (le type déclaré par le navigateur n'est jamais cru). SVG refusé. */
export function logoImageType(bytes: Buffer): { mime: string; ext: string } | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", ext: ".png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: ".jpg" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp", ext: ".webp" };
  return null;
}

export async function organizationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/organization", async (request, reply) => {
    await syncPrimaryActivityFromOrganization(request.auth!.organizationId);
    const r = await query(
      `select id,name,activity,custom_activity,siren,siret,legal_form,address,postal_code,city,website,configuration_data,configuration_incomplete,(logo_key is not null) as has_logo,created_at,updated_at
       from organizations where id=$1`,
      [request.auth!.organizationId],
    );
    if (!r.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    return r.rows[0];
  });

  app.patch("/organization", async (request, reply) => {
    const parsed = organizationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const d = parsed.data;
    const r = await query(
      `update organizations
       set name=$1,activity=$2,custom_activity=nullif($3,''),
           siren=nullif($4,''),siret=nullif($5,''),legal_form=nullif($6,''),address=nullif($7,''),postal_code=nullif($8,''),city=nullif($9,''),website=nullif($10,''),configuration_data=coalesce($11::jsonb,configuration_data),configuration_incomplete=coalesce($12,configuration_incomplete),updated_at=now()
       where id=$13
       returning id,name,activity,custom_activity,siren,siret,legal_form,address,postal_code,city,website,configuration_data,configuration_incomplete,updated_at`,
      [
        d.name,
        d.activity,
        d.customActivity || "",
        d.siren || "",
        d.siret || "",
        (d as any).legalForm || "",
        (d as any).address || "",
        (d as any).postalCode || "",
        (d as any).city || "",
        (d as any).website || "",
        (d as any).configurationData === undefined ? null : JSON.stringify((d as any).configurationData),
        (d as any).configurationIncomplete === undefined ? null : d.configurationIncomplete,
        request.auth!.organizationId,
      ],
    );

    if (!r.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    await syncPrimaryActivityFromOrganization(request.auth!.organizationId, { forceIdentity: true });
    await applyConfigurationQuestionnaire(request.auth!.organizationId, (d as any).configurationData);
    const fresh = await query(
      `select id,name,activity,custom_activity,siren,siret,legal_form,address,postal_code,city,website,configuration_data,configuration_incomplete,created_at,updated_at
       from organizations where id=$1`,
      [request.auth!.organizationId],
    );
    return fresh.rows[0] ?? r.rows[0];
  });

  // Logo de l'entreprise (parcours d'accueil et Paramètres) : facultatif, jamais bloquant.
  app.get("/organization/logo", async (request, reply) => {
    const key = (await query("select logo_key from organizations where id=$1", [request.auth!.organizationId])).rows[0]?.logo_key;
    if (!key) return reply.code(404).send({ error: "NOT_FOUND", message: "Aucun logo enregistré." });
    try {
      const bytes = await readPrivateObject(String(key));
      const type = logoImageType(bytes);
      if (!type) return reply.code(404).send({ error: "NOT_FOUND" });
      return reply.header("Content-Type", type.mime).header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff").send(bytes);
    } catch { return reply.code(404).send({ error: "NOT_FOUND", message: "Logo introuvable." }); }
  });
  app.post("/organization/logo", { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async (request, reply) => {
    let part: any;
    try { part = await (request as any).file({ limits: { fileSize: LOGO_MAX_BYTES, files: 1 } }); } catch { return reply.code(400).send({ error: "INVALID_IMAGE", message: "Choisissez une image PNG, JPEG ou WebP de 2 Mo au maximum." }); }
    if (!part) return reply.code(400).send({ error: "INVALID_IMAGE", message: "Aucun fichier reçu." });
    const bytes: Buffer = await part.toBuffer().catch(() => Buffer.alloc(0));
    if (part.file?.truncated || bytes.length > LOGO_MAX_BYTES) return reply.code(413).send({ error: "FILE_TOO_LARGE", message: "Le logo dépasse 2 Mo." });
    const type = logoImageType(bytes);
    if (!type) return reply.code(400).send({ error: "INVALID_IMAGE", message: "Format refusé : utilisez une image PNG, JPEG ou WebP (le SVG n’est pas accepté)." });
    const org = request.auth!.organizationId;
    const key = `private/${org}/logo-${randomUUID()}${type.ext}`;
    await writePrivateObject(key, bytes, type.mime);
    const old = (await query("select logo_key from organizations where id=$1", [org])).rows[0]?.logo_key;
    await query("update organizations set logo_key=$1,updated_at=now() where id=$2", [key, org]);
    if (old) { try { await deletePrivateObject(String(old)); } catch { /* ancien fichier déjà absent */ } }
    return { ok: true, hasLogo: true, mime: type.mime, size: bytes.length };
  });
  app.delete("/organization/logo", async request => {
    const org = request.auth!.organizationId;
    const old = (await query("update organizations o set logo_key=null,updated_at=now() from (select logo_key from organizations where id=$1) prev where o.id=$1 returning prev.logo_key", [org])).rows[0]?.logo_key;
    if (old) { try { await deletePrivateObject(String(old)); } catch { /* déjà absent */ } }
    return { ok: true, hasLogo: false };
  });
}
