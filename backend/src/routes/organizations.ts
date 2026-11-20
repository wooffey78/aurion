import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { organizationSchema } from "../services/validation.js";
import { applyConfigurationQuestionnaire, syncPrimaryActivityFromOrganization } from "../services/configuration-sync.js";
import { isOwnerLegalFormAllowed, isEIJuridique, OWNER_LEGAL_FORM_REFUSAL } from "../services/fiscal-detection.js";
import { lookupFrenchCompany, searchFrenchCompaniesByName } from "../services/public-registry.js";
import { randomUUID } from "node:crypto";
import { readPrivateObject, writePrivateObject, deletePrivateObject, logoImageType } from "../services/storage.js";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** Type réel du logo d'après sa signature binaire — implémentation partagée avec les services de documents. */
export { logoImageType };

export async function organizationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/organization", async (request, reply) => {
    await syncPrimaryActivityFromOrganization(request.auth!.organizationId);
    const r = await query(
      `select id,name,activity,custom_activity,siren,siret,legal_form,address,postal_code,city,website,configuration_data,configuration_incomplete,vl_option,vl_verified,vl_effective_from,urssaf_periodicity,urssaf_periodicity_effective_from,urssaf_periodicity_changed_at,(logo_key is not null) as has_logo,created_at,updated_at
       from organizations where id=$1`,
      [request.auth!.organizationId],
    );
    if (!r.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    return r.rows[0];
  });

  app.patch("/organization", async (request, reply) => {
    const parsed = organizationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    // Bloc 7 (recentrage micro-entreprise) : la forme juridique du compte de l'entrepreneur
    // est exclusivement une entreprise individuelle. Une société (SAS, SARL, EURL, SA, SCI…)
    // est refusée explicitement, sans conversion automatique ; les sociétés restent acceptées
    // comme clients ou fournisseurs.
    const legalFormInput = String((parsed.data as any).legalForm || '').trim();
    if (legalFormInput && !isOwnerLegalFormAllowed(legalFormInput)) {
      return reply.code(422).send({ error: "LEGAL_FORM_OUT_OF_SCOPE", message: OWNER_LEGAL_FORM_REFUSAL });
    }

    const d = parsed.data;
    // Bloc 9 — options fiscales déclarées (versement libératoire, périodicité URSSAF).
    // Les changements sont horodatés dans fiscal_options_history (reconstitution historique,
    // mise à jour en cours d'année) ; aucune détection automatique au SIRET.
    const before = (await query(
      `select vl_option,vl_verified,vl_effective_from,urssaf_periodicity,urssaf_periodicity_effective_from from organizations where id=$1`,
      [request.auth!.organizationId],
    )).rows[0];
    const vlOption = (d as any).vlOption !== undefined ? (d as any).vlOption : (before?.vl_option || 'inconnu');
    const vlVerified = (d as any).vlVerified !== undefined ? Boolean((d as any).vlVerified) : Boolean(before?.vl_verified);
    const vlEffectiveFrom = (d as any).vlEffectiveFrom !== undefined ? ((d as any).vlEffectiveFrom || null) : (before?.vl_effective_from || null);
    if ((d as any).vlEffectiveFrom && vlOption !== 'oui') {
      return reply.code(400).send({ error: 'INVALID_INPUT', message: 'La date d’effet du versement libératoire n’est enregistrée que si l’option est déclarée « oui ».' });
    }
    const urssafPeriodicity = (d as any).urssafPeriodicity !== undefined ? ((d as any).urssafPeriodicity || null) : (before?.urssaf_periodicity || null);
    const urssafPeriodicityFrom = (d as any).urssafPeriodicityEffectiveFrom !== undefined ? ((d as any).urssafPeriodicityEffectiveFrom || null) : (before?.urssaf_periodicity_effective_from || null);
    if (urssafPeriodicity && !urssafPeriodicityFrom) {
      return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Indiquez la date d’effet de la périodicité URSSAF (mensuelle ou trimestrielle).' });
    }
    const r = await query(
      `update organizations
       set name=$1,activity=$2,custom_activity=nullif($3,''),
           siren=nullif($4,''),siret=nullif($5,''),legal_form=nullif($6,''),address=nullif($7,''),postal_code=nullif($8,''),city=nullif($9,''),website=nullif($10,''),configuration_data=coalesce($11::jsonb,configuration_data),configuration_incomplete=coalesce($12,configuration_incomplete),updated_at=now(),
           vl_option=$13,vl_verified=$14,vl_effective_from=$15::date,
           urssaf_periodicity=$16::varchar,urssaf_periodicity_effective_from=$17::date,
           urssaf_periodicity_changed_at=case when $16::varchar is not null and $16::varchar is distinct from $18::varchar then now() else urssaf_periodicity_changed_at end
       where id=$19
       returning id,name,activity,custom_activity,siren,siret,legal_form,address,postal_code,city,website,configuration_data,configuration_incomplete,vl_option,vl_verified,vl_effective_from,urssaf_periodicity,urssaf_periodicity_effective_from,urssaf_periodicity_changed_at,(logo_key is not null) as has_logo,updated_at`,
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
        vlOption,
        vlVerified,
        vlEffectiveFrom,
        urssafPeriodicity,
        urssafPeriodicityFrom,
        before?.urssaf_periodicity ?? null,
        request.auth!.organizationId,
      ],
    );

    if (!r.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    // Bloc 9 — journal d'historique : uniquement sur CHANGEMENT effectif (jamais d'écriture répétée).
    const historyRows: Array<[string, string, string | null]> = [];
    if (vlOption !== (before?.vl_option || 'inconnu')) historyRows.push(['vl_option', vlOption, vlEffectiveFrom]);
    if (urssafPeriodicity && urssafPeriodicity !== (before?.urssaf_periodicity || null)) historyRows.push(['urssaf_periodicity', urssafPeriodicity, urssafPeriodicityFrom]);
    for (const [field, value, effective] of historyRows) {
      await query('insert into fiscal_options_history(organization_id,field,value,effective_from,source) values($1,$2,$3,coalesce($4::date,current_date),$5)',
        [request.auth!.organizationId, field, value, effective, vlOption === value || field === 'urssaf_periodicity' ? 'déclaration utilisateur (parcours/paramètres)' : 'déclaration utilisateur']);
    }
    await syncPrimaryActivityFromOrganization(request.auth!.organizationId, { forceIdentity: true });
    await applyConfigurationQuestionnaire(request.auth!.organizationId, (d as any).configurationData);
    const fresh = await query(
      `select id,name,activity,custom_activity,siren,siret,legal_form,address,postal_code,city,website,configuration_data,configuration_incomplete,vl_option,vl_verified,vl_effective_from,urssaf_periodicity,urssaf_periodicity_effective_from,urssaf_periodicity_changed_at,(logo_key is not null) as has_logo,created_at,updated_at
       from organizations where id=$1`,
      [request.auth!.organizationId],
    );
    return fresh.rows[0] ?? r.rows[0];
  });

  // Détection du registre public pour le COMPTE DE L'ENTREPRENEUR (parcours + Paramètres).
  // Bloc 7 : une entreprise détectée dont la forme juridique n'est pas une entreprise
  // individuelle est refusée explicitement (statut « out_of_scope »), sans préremplissage
  // ni conversion automatique. La détection des fournisseurs (GET /suppliers/lookup) reste
  // ouverte à toutes les formes juridiques : les sociétés restent des tiers professionnels.
  app.get("/organization/registry-lookup", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (r, reply) => {
    const id = String((r.query as any)?.identifier || '').trim();
    const digits = id.replace(/[\s.]/g, '');
    try {
      if (/^\d+$/.test(digits)) {
        const result = await lookupFrenchCompany(digits);
        if (result && !isEIJuridique(String(result.legalFormCode || ''))) {
          return {
            status: 'out_of_scope',
            company: null,
            message: `${result.legalName || 'Cette entreprise'} est enregistrée comme « ${result.legalForm || result.legalFormCode} » : ${OWNER_LEGAL_FORM_REFUSAL}`,
          };
        }
        return { company: result, status: result ? (result.closed ? 'closed' : result.establishmentClosed ? 'establishment_closed' : 'found') : 'not_found' };
      }
      const results = await searchFrenchCompaniesByName(id);
      return {
        results: results.map(x => ({ ...x, outOfScope: !isEIJuridique(String(x.legalFormCode || '')) })),
        status: results.length ? 'found' : 'not_found',
      };
    }
    catch (e: any) {
      const code = String(e?.code || '');
      if (code === 'REGISTRY_INVALID_IDENTIFIER') return reply.code(400).send({ error: 'INVALID_IDENTIFIER', status: 'invalid', message: String(e.message) });
      if (code === 'REGISTRY_RATE_LIMITED') return reply.code(429).send({ error: 'REGISTRY_RATE_LIMITED', status: 'unavailable', message: 'Le registre public limite temporairement les requêtes. Réessayez dans quelques secondes.' });
      r.log.warn({ code: code || 'REGISTRY_UNAVAILABLE' }, 'owner registry lookup failed');
      return reply.code(503).send({ error: 'REGISTRY_UNAVAILABLE', status: 'unavailable', message: 'Le registre public est momentanément indisponible. Vous pouvez saisir les informations manuellement.' });
    }
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
    try { part = await (request as any).file({ limits: { fileSize: LOGO_MAX_BYTES, files: 1 } }); } catch { return reply.code(400).send({ error: "INVALID_IMAGE", message: "Choisissez une image PNG ou JPEG de 2 Mo au maximum." }); }
    if (!part) return reply.code(400).send({ error: "INVALID_IMAGE", message: "Aucun fichier reçu." });
    const bytes: Buffer = await part.toBuffer().catch(() => Buffer.alloc(0));
    if (part.file?.truncated || bytes.length > LOGO_MAX_BYTES) return reply.code(413).send({ error: "FILE_TOO_LARGE", message: "Le logo dépasse 2 Mo." });
    const type = logoImageType(bytes);
    // Correctif 078 (D-b) : le WebP est refusé avec message — il n'est pas affichable par les moteurs PDF/DOCX/ODT.
    if (!type || type.mime === "image/webp") return reply.code(400).send({ error: "INVALID_IMAGE", message: "Format refusé : le logo doit être un PNG ou un JPEG — le WebP ne peut pas être affiché sur les documents PDF, DOCX et ODT (le SVG n’est pas accepté)." });
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
