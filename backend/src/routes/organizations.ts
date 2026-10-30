import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { organizationSchema } from "../services/validation.js";
import { applyConfigurationQuestionnaire, syncPrimaryActivityFromOrganization } from "../services/configuration-sync.js";

export async function organizationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/organization", async (request, reply) => {
    await syncPrimaryActivityFromOrganization(request.auth!.organizationId);
    const r = await query(
      `select id,name,activity,custom_activity,siren,siret,legal_form,address,postal_code,city,website,configuration_data,configuration_incomplete,created_at,updated_at
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
}
