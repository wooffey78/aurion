import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { query } from '../db.js';
const uuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
const clean = (v: unknown, max = 1000) => String(v ?? '').trim().slice(0, max);
export async function clientAddressRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);
  app.get('/clients/:id/intervention-addresses', async (r, reply) => {
    const org=r.auth!.organizationId,id=String((r.params as any).id);
    if(!uuid(id))return reply.code(400).send({error:'INVALID_CLIENT_ID'});
    const client=await query('select id,intervention_address from clients where id=$1 and organization_id=$2',[id,org]);
    if(!client.rowCount)return reply.code(404).send({error:'CLIENT_NOT_FOUND'});
    let rows=(await query('select id,label,address,is_default as "isDefault",is_active as "isActive",created_at as "createdAt",updated_at as "updatedAt" from client_intervention_addresses where organization_id=$1 and client_id=$2 and is_active=true order by is_default desc,created_at,id',[org,id])).rows;
    if(!rows.length&&clean(client.rows[0].intervention_address))rows=[{id:null,label:'Adresse principale',address:client.rows[0].intervention_address,isDefault:true,isActive:true,legacy:true}];
    return {addresses:rows};
  });
  app.post('/clients/:id/intervention-addresses', async (r, reply) => {
    const org=r.auth!.organizationId,clientId=String((r.params as any).id),b=r.body as any||{},address=clean(b.address,1000);
    if(!uuid(clientId)||!address)return reply.code(400).send({error:'INVALID_ADDRESS'});
    const client=await query('select id from clients where id=$1 and organization_id=$2',[clientId,org]);if(!client.rowCount)return reply.code(404).send({error:'CLIENT_NOT_FOUND'});
    const isDefault=b.isDefault===true;
    if(isDefault)await query('update client_intervention_addresses set is_default=false,updated_at=now() where organization_id=$1 and client_id=$2 and is_active=true',[org,clientId]);
    const id=randomUUID();
    await query('insert into client_intervention_addresses(id,organization_id,client_id,label,address,is_default) values($1,$2,$3,$4,$5,$6)',[id,org,clientId,clean(b.label,120)||null,address,isDefault]);
    if(isDefault||!(await query('select 1 from client_intervention_addresses where organization_id=$1 and client_id=$2 and is_active=true and is_default=true',[org,clientId])).rowCount){
      await query('update client_intervention_addresses set is_default=(id=$1) where organization_id=$2 and client_id=$3 and is_active=true',[id,org,clientId]);
      await query('update clients set intervention_address=$1,updated_at=now() where id=$2 and organization_id=$3',[address,clientId,org]);
    }
    return reply.code(201).send({id,label:clean(b.label,120)||null,address,isDefault});
  });
  app.patch('/clients/:clientId/intervention-addresses/:id', async (r, reply) => {
    const org=r.auth!.organizationId,clientId=String((r.params as any).clientId),id=String((r.params as any).id),b=r.body as any||{};
    if(!uuid(clientId)||!uuid(id))return reply.code(400).send({error:'INVALID_ID'});
    const current=(await query('select * from client_intervention_addresses where id=$1 and client_id=$2 and organization_id=$3 and is_active=true',[id,clientId,org])).rows[0];if(!current)return reply.code(404).send({error:'NOT_FOUND'});
    const address=b.address===undefined?current.address:clean(b.address,1000);if(!address)return reply.code(400).send({error:'ADDRESS_REQUIRED'});
    const isDefault=b.isDefault===undefined?current.is_default:b.isDefault===true;
    if(isDefault)await query('update client_intervention_addresses set is_default=false,updated_at=now() where organization_id=$1 and client_id=$2 and is_active=true',[org,clientId]);
    await query('update client_intervention_addresses set label=$1,address=$2,is_default=$3,updated_at=now() where id=$4 and client_id=$5 and organization_id=$6',[clean(b.label===undefined?current.label:b.label,120)||null,address,isDefault,id,clientId,org]);
    if(isDefault)await query('update clients set intervention_address=$1,updated_at=now() where id=$2 and organization_id=$3',[address,clientId,org]);
    return {ok:true,id,address,isDefault};
  });
  app.delete('/clients/:clientId/intervention-addresses/:id', async (r, reply) => {
    const org=r.auth!.organizationId,clientId=String((r.params as any).clientId),id=String((r.params as any).id);
    if(!uuid(clientId)||!uuid(id))return reply.code(400).send({error:'INVALID_ID'});
    const current=(await query('select address,is_default from client_intervention_addresses where id=$1 and client_id=$2 and organization_id=$3 and is_active=true',[id,clientId,org])).rows[0];if(!current)return reply.code(404).send({error:'NOT_FOUND'});
    await query('update client_intervention_addresses set is_active=false,is_default=false,updated_at=now() where id=$1 and client_id=$2 and organization_id=$3',[id,clientId,org]);
    if(current.is_default){
      const next=(await query('select id,address from client_intervention_addresses where organization_id=$1 and client_id=$2 and is_active=true order by created_at,id limit 1',[org,clientId])).rows[0];
      if(next){await query('update client_intervention_addresses set is_default=(id=$1) where organization_id=$2 and client_id=$3 and is_active=true',[next.id,org,clientId]);await query('update clients set intervention_address=$1,updated_at=now() where id=$2 and organization_id=$3',[next.address,clientId,org]);}
      else await query('update clients set intervention_address=null,updated_at=now() where id=$1 and organization_id=$2',[clientId,org]);
    }
    return {ok:true,archived:true,documentsUnaffected:true};
  });
}