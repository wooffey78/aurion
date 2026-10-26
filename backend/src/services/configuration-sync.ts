import { query } from '../db.js';
import { profileFor, defaultCgvFor } from './profiles.js';
import { detectFiscalSettings, detectLegalFormFromProfile } from './fiscal-detection.js';

const clean = (v: unknown) => String(v ?? '').trim();
const placeholderActivity = (a: any) => !a || a.code === 'principale' && ((!a.name || /^(activité principale|à configurer)$/i.test(clean(a.name))) || /^(à configurer)$/i.test(clean(a.description)) || a.configuration_defined === false);

async function saveContributionPresets(activityId: string, contributions: any[]) {
  await query('delete from activity_contributions where activity_id=$1',[activityId]);
  for (const [position,c] of contributions.entries()) {
    await query(`insert into activity_contributions(activity_id,name,rate,basis,mandatory,variable,source,position) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(activity_id,name) do update set rate=excluded.rate,basis=excluded.basis,mandatory=excluded.mandatory,variable=excluded.variable,source=excluded.source,position=excluded.position,updated_at=now()`,[
      activityId,clean(c.name),c.rate===null?null:Number(c.rate),clean(c.basis)||'chiffre d’affaires HT',Boolean(c.mandatory),Boolean(c.variable),clean(c.source)||null,position,
    ]);
  }
}

/**
 * Propagate the organization's single-source identity into its primary activity.
 * User-defined activity data stays authoritative once configuration_defined=true.
 */
export async function applyConfigurationQuestionnaire(orgId: string, configurationData: any = {}) {
  const q = configurationData?.questionnaire || {};
  const map: Record<string,string> = { support: 'support', agenda: 'agenda', accounting: 'accounting', parts: 'easyfixit', stock: 'stock' };
  for (const [answerKey,moduleKey] of Object.entries(map)) {
    const answer = String((q as any)[answerKey] || '');
    if (answer !== 'Oui' && answer !== 'Non') continue;
    const moduleRow = (await query('select id from modules where key=$1',[moduleKey])).rows[0];
    if (!moduleRow) continue;
    await query(`insert into organization_modules(organization_id,module_id,enabled) values($1,$2,$3)
      on conflict(organization_id,module_id) do update set enabled=excluded.enabled,updated_at=now()`,
      [orgId,moduleRow.id,answer === 'Oui']);
  }
}

export async function syncPrimaryActivityFromOrganization(orgId: string, options: { forceIdentity?: boolean } = {}) {
  const orgRow=(await query('select id,name,activity,custom_activity,legal_form,configuration_incomplete from organizations where id=$1',[orgId])).rows[0];
  if(!orgRow)return null;
  const activity=(await query(`select * from activities where organization_id=$1 and code='principale' order by created_at asc limit 1`,[orgId])).rows[0];
  if(!activity)return null;

  const canSyncIdentity=Boolean(options.forceIdentity) || placeholderActivity(activity);
  const nextName=canSyncIdentity ? (clean(orgRow.custom_activity) || clean(orgRow.name) || activity.name) : activity.name;
  const nextDescription=canSyncIdentity ? (clean(orgRow.custom_activity) || activity.description || null) : activity.description;
  let nextLegalForm=clean(activity.legal_form) || clean(orgRow.legal_form);
  const detectedLegal = !nextLegalForm ? detectLegalFormFromProfile(nextName,nextDescription||'') : null;
  if(!nextLegalForm && detectedLegal?.legalForm) nextLegalForm=clean(detectedLegal.legalForm);

  const p=profileFor(nextName,nextDescription||'');
  const sets=['name=$1','description=$2'];
  const vals:any[]=[nextName,nextDescription||null];
  const identityChanged=clean(activity.name)!==clean(nextName)||clean(activity.description)!==clean(nextDescription||'')||clean(activity.legal_form)!==clean(nextLegalForm);
  if(nextLegalForm && (options.forceIdentity || !clean(activity.legal_form))){ sets.push(`legal_form=$${vals.length+1}`); vals.push(nextLegalForm); }
  const legalFormWasFilled=!clean(activity.legal_form)&&!!nextLegalForm;
  const needsFiscalDetection=!!nextLegalForm && (!activity.configuration_defined || legalFormWasFilled || identityChanged);
  if(needsFiscalDetection){
    const detected=detectFiscalSettings(nextLegalForm,p.code,nextName,nextDescription||'');
    const autoSocial=!activity.configuration_defined||activity.social_auto_detected===true||legalFormWasFilled;
    const autoVat=!activity.configuration_defined||activity.vat_auto_detected===true||legalFormWasFilled;
    if(autoSocial){sets.push(`urssaf_rate=$${vals.length+1}`,`social_regime=$${vals.length+2}`,`social_auto_detected=true`);vals.push(detected.socialRate,detected.socialRegime)}
    if(autoVat){sets.push(`vat_rate=coalesce($${vals.length+1},vat_rate)`,`vat_regime=$${vals.length+2}`,`vat_auto_detected=true`);vals.push(detected.vatRate,detected.vatRegime)}
    if(autoSocial||autoVat)await saveContributionPresets(activity.id,detected.contributions);
    const cgv=defaultCgvFor(p.code,p.title,nextLegalForm);
    sets.push(`cgv_text=coalesce(cgv_text,$${vals.length+1})`); vals.push(cgv);
  }
  const configurationDefined = orgRow.configuration_incomplete===false || activity.configuration_defined===true;
  sets.push(`configuration_defined=$${vals.length+1}`); vals.push(configurationDefined);
  vals.push(activity.id,orgId);
  const result=await query(`update activities set ${sets.join(',')},updated_at=now() where id=$${vals.length-1} and organization_id=$${vals.length} returning *`,vals);
  if(!clean(orgRow.legal_form) && nextLegalForm && detectedLegal?.legalForm){
    await query("update organizations set legal_form=$1,updated_at=now() where id=$2 and (legal_form is null or btrim(legal_form)='')",[nextLegalForm,orgId]);
  }
  return result.rows[0]||activity;
}
