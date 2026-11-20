import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
export async function moduleRoutes(app:FastifyInstance){
  app.addHook("preHandler",app.requireAuth);
  app.get("/modules",async(request)=>{
    const r=await query(`select m.key,m.name,m.description,coalesce(om.enabled,false) enabled
      from modules m left join organization_modules om on om.module_id=m.id and om.organization_id=$1 order by m.sort_order,m.key`,
      [request.auth!.organizationId]);
    return r.rows;
  });
  app.put("/modules/:key",async(request,reply)=>{
    if(!["owner","admin"].includes(request.auth!.role))return reply.code(403).send({error:"FORBIDDEN"});
    const key=(request.params as {key:string}).key;
    const enabled=(request.body as {enabled?:unknown})?.enabled;
    if(typeof enabled!=="boolean")return reply.code(400).send({error:"INVALID_INPUT"});
    const m=await query<{id:string}>("select id from modules where key=$1",[key]);
    const moduleRow=m.rows[0];
    if(!moduleRow)return reply.code(404).send({error:"MODULE_NOT_FOUND"});
    await query(`insert into organization_modules(organization_id,module_id,enabled) values($1,$2,$3)
      on conflict(organization_id,module_id) do update set enabled=excluded.enabled,updated_at=now()`,
      [request.auth!.organizationId,moduleRow.id,enabled]);
    return {key,enabled};
  });
}