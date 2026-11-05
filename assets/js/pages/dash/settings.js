// Paramètres : source unique de l'identité entreprise, configuration fonctionnelle et activités métier.
import{api,getActiveActivity,setActiveActivity}from'../../core/api.js';
import{S,e,toast,modalForm,confirmDelete,hooks,askConfirm}from'./core.js';
import{renderMailbox}from'../mailbox.js';
import{renderDataImport}from'../data-import.js';
import{detectCompany,buildProposals,renderProposals}from'../../core/company-detect.js';
import{storageSection,bindStorage}from'./storage.js';

const F=(id,label,val='',extra='')=>`<label class="field"><span>${label}</span><input id="${id}" value="${e(val)}" ${extra}${/placeholder=/.test(extra)?'':` placeholder="Saisissez ${e(label.toLowerCase())}…"`}></label>`;
const v=(m,id)=>m.querySelector('#'+id)?.value.trim()??'';

const CONFIGURATION_QUESTIONS=[
  ['parts','Pièces et fournitures dans les devis','Activer la gestion des pièces et fournitures.'],
  ['stock','Suivi des stocks','Activer le suivi du stock lorsque votre activité le nécessite.'],
  ['contributions','Cotisations détectées','Afficher les cotisations détectées dans la configuration fiscale.'],
  ['support','Fonctions SAV','Afficher les fonctions SAV lorsqu’elles sont pertinentes.'],
  ['agenda','Agenda','Afficher l’agenda et ses fonctions dans Aurion.'],
  ['accounting','Comptabilité et trésorerie','Afficher la comptabilité et la trésorerie dans l’espace de travail.'],
];
const configurationValue=(q,key)=>q?.[key]==='Oui'||q?.[key]==='Non'?q[key]:'';

const settingsCompleteness=(c={})=>{
  const fields=['name','siret','siren','legal_form','address','postal_code','city','website'];
  return Math.round(fields.filter(k=>String(c?.[k]??'').trim()).length/fields.length*100);
};

const configurationSection=()=>{
  const q=S.company?.configuration_data?.questionnaire||{};
  const groups=[
    ['Fonctions commerciales',[CONFIGURATION_QUESTIONS[0]]],
    ['Pilotage',[CONFIGURATION_QUESTIONS[1],CONFIGURATION_QUESTIONS[2],CONFIGURATION_QUESTIONS[5]]],
    ['Organisation',[CONFIGURATION_QUESTIONS[3],CONFIGURATION_QUESTIONS[4]]],
  ];
  return `<section class="panel stack settings-section" id="settings-configuration" data-settings-text="configuration fonctions commerciales pilotage organisation pièces stock cotisations sav agenda comptabilité trésorerie">
    <div class="section-title"><div><h2>3 · Configuration fonctionnelle</h2><small>Ces choix sont définis une seule fois pour l’entreprise et réutilisés par les modules.</small></div><span class="pill">Configuration</span></div>
    <form id="configuration-form">${groups.map(([title,items])=>`<section class="settings-group"><div class="section-title"><h3>${e(title)}</h3></div><div class="grid-2">${items.map(([key,label,help])=>`<label class="field"><span>${e(label)}</span><select name="q-${e(key)}"><option value="">Votre choix</option><option value="Oui" ${configurationValue(q,key)==='Oui'?'selected':''}>Oui</option><option value="Non" ${configurationValue(q,key)==='Non'?'selected':''}>Non</option></select><small class="help">${e(help)}</small></label>`).join('')}</div></section>`).join('')}
      <div class="settings-savebar"><span class="settings-state" id="configuration-state">Aucune modification</span><div class="button-row"><button class="btn secondary" type="button" id="configuration-reset">Annuler</button><button class="btn primary" type="submit">Enregistrer la configuration</button></div></div>
    </form>
  </section>`;
};

const renderContributions=(rows=[])=>!rows.length
  ?'<div class="empty">Aucune cotisation détaillée détectée pour cette forme juridique.</div>'
  :`<div class="section-title"><h3>Cotisations détectées</h3><span class="pill">Automatique</span></div>${rows.map(r=>`<div class="fiscal-contribution-row"><div><b>${e(r.name)}</b><small>${e(r.basis||'')} · ${e(r.source||'')}</small></div><strong>${r.rate===null||r.rate===undefined?'Selon le revenu / la rémunération':Number(r.rate).toLocaleString('fr-FR',{maximumFractionDigits:4})+' %'}</strong></div>`).join('')}`;

const manualInput=(id,label,placeholder,extra='')=>`<label class="field"><span>${label}</span><input id="${id}" placeholder="${placeholder}" ${extra}></label>`;

const activityForm=(a={},profiles=[])=>{
  const contributionBox=`<section class="fiscal-contributions" id="fiscal-contributions">${renderContributions(a.contributions||[])}</section>`;
  return `<div class="settings-subsection" data-settings-text="métier activité profil catalogue">
    <label class="field"><span>Métier</span><select id="profileCode"><option value="">Votre choix</option>${profiles.map(p=>`<option value="${p.code}" ${a.profile_code===p.code?'selected':''}>${e(p.title)}</option>`).join('')}</select><small class="help">Le métier adapte le catalogue, le calculateur et le vocabulaire des documents.</small></label>
    ${manualInput('name','Nom de l’activité','Nom donné à cette activité',a.id?'':'required')}
    ${manualInput('description','Description / métier','Décrivez l’activité avec des mots (ex. réparation de smartphones, plomberie, création de sites web)…')}
    <div class="notice"><b>Identité juridique : ${e(S.company?.legal_form||a.legal_form||'À détecter')}</b><small>Renseignée une seule fois dans « Entreprise » et réutilisée automatiquement ici.</small></div>
  </div>
  <section class="settings-subsection" data-settings-text="fiscalité tva cotisations régime fiscal">
    <div class="notice fiscal-detection" id="fiscal-detection">La fiscalité est détectée à partir de l’identité juridique et du métier.</div>
    ${contributionBox}
    <div class="grid-2">
      <div>${manualInput('vatRate','TVA %','Selon le régime','type="number" step="0.01" min="0" max="100"')}</div>
      <div>${manualInput('urssafRate','Taux agrégé utilisé par le calculateur %','Selon le régime','type="number" step="0.001" min="0" max="99.99')}</div>
    </div>
  </section>
  <section class="settings-subsection" data-settings-text="facturation documents délai pénalités mentions légales cgv">
    <div class="section-title"><div><h3>Facturation et documents</h3><small>Ces informations alimentent automatiquement les devis et factures de cette activité.</small></div></div>
    <div class="grid-2">${manualInput('quoteValidityDays','Validité des devis (jours)','30','type="number" min="1" max="365" step="1"')}${manualInput('paymentTerms','Délais de paiement','Ex. 30 jours')}</div>
    <div class="grid-2">${manualInput('insuranceInfo','Assurance / responsabilité','Mention légale facultative')}${manualInput('mediatorInfo','Médiateur','Mention légale facultative')}</div>
    <label class="field"><span>Notes légales</span><textarea id="legalNotes" rows="3" placeholder="Mentions complémentaires">${e(a.legal_notes||'')}</textarea></label>
  </section>
  <section class="settings-subsection" data-settings-text="tarification coefficients pièces main oeuvre aurion">
    <div class="section-title"><div><h3>Tarification Aurion</h3><small>Le coefficient métier reste un défaut ; chaque devis ou facture peut ensuite l’adapter.</small></div></div>
    <div class="grid-2">${manualInput('defaultPartCoefficientPercent','Coefficient par défaut · pièces %','0','type="number" step="0.01" min="0"')}${manualInput('defaultLaborCoefficientPercent','Coefficient par défaut · main-d’œuvre %','0','type="number" step="0.01" min="0')}</div>
    ${manualInput('marginMinPercent','Coefficient minimal Aurion Guard %','0','type="number" step="0.01" min="0')}
  </section>`;
};

const fillActivityValues=(m,a={})=>{
  const set=(id,val)=>{const el=m.querySelector('#'+id);if(el)el.value=val??''};
  set('name',a.name);set('description',a.description);set('vatRate',a.vat_rate);set('urssafRate',a.urssaf_rate);set('quoteValidityDays',a.quote_validity_days??30);set('paymentTerms',a.payment_terms);set('insuranceInfo',a.insurance_info);set('mediatorInfo',a.mediator_info);set('legalNotes',a.legal_notes);set('defaultPartCoefficientPercent',a.default_part_coefficient_percent);set('defaultLaborCoefficientPercent',a.default_labor_coefficient_percent);set('marginMinPercent',a.margin_min_percent);
};

const activityBody=(m,a={})=>{
  const value=id=>m.querySelector('#'+id)?.value.trim()??'';
  const numOrUndefined=id=>{const raw=value(id);return raw===''?undefined:Number(raw)};
  const vat=m.querySelector('#vatRate'),social=m.querySelector('#urssafRate');
  return {
    profileCode:m.querySelector('#profileCode')?.value||a.profile_code||'',
    name:value('name')||a.name||'',
    description:value('description')||a.description||null,
    legalForm:S.company?.legal_form||a.legal_form||null,
    vatRate:numOrUndefined('vatRate')??(a.vat_rate==null?undefined:Number(a.vat_rate)),
    urssafRate:value('urssafRate')||(a.urssaf_rate==null?undefined:String(a.urssaf_rate)),
    marginMinPercent:numOrUndefined('marginMinPercent')??(a.margin_min_percent==null?undefined:Number(a.margin_min_percent)),
    defaultPartCoefficientPercent:numOrUndefined('defaultPartCoefficientPercent')??(a.default_part_coefficient_percent==null?undefined:Number(a.default_part_coefficient_percent)),
    defaultLaborCoefficientPercent:numOrUndefined('defaultLaborCoefficientPercent')??(a.default_labor_coefficient_percent==null?undefined:Number(a.default_labor_coefficient_percent)),
    quoteValidityDays:numOrUndefined('quoteValidityDays')??30,
    paymentTerms:value('paymentTerms')||null,
    insuranceInfo:value('insuranceInfo')||null,
    mediatorInfo:value('mediatorInfo')||null,
    legalNotes:value('legalNotes')||null,
    autoFiscalDetect:!((vat?.dataset.manualEdited==='true')||(social?.dataset.manualEdited==='true')),
  };
};

export const view=()=>{
  const completeness=settingsCompleteness(S.company||{});
  return `<div class="page-head"><div><span class="eyebrow">ENTREPRISE & ACTIVITÉS</span><h1>Paramètres</h1><p>Une information est saisie une seule fois, détectée quand elle est disponible, puis réutilisée partout dans Aurion.</p></div></div>
  <section class="panel settings-toolbar"><div class="grid-2"><label class="field"><span>Rechercher dans les paramètres</span><input id="settings-search" type="search" placeholder="Entreprise, fiscalité, facturation, tarification…"></label><div class="notice"><b>Profil complété à ${completeness} %</b><small>Les données manquantes restent à renseigner par l’utilisateur.</small></div></div>
    <nav class="settings-nav" aria-label="Navigation des paramètres"><button type="button" data-target="settings-company">Entreprise</button><button type="button" data-target="settings-configuration">Configuration</button><button type="button" data-target="settings-data-import">Import de données</button><button type="button" data-target="settings-activities">Activités</button><button type="button" data-target="settings-mailbox">Messagerie & agenda</button><button type="button" data-target="settings-signature">Signature e-mail</button><button type="button" data-target="settings-storage">Stockage</button><button type="button" data-target="settings-logo">Logo</button><button type="button" data-target="settings-account">Compte & sécurité</button><button type="button" data-target="settings-subscription">Abonnement</button></nav>
  </section>
  <section class="panel stack settings-section" id="settings-company" data-settings-text="entreprise informations siren siret adresse code postal ville site web forme juridique naf registre">
    <div class="section-title"><div><h2>1 · Entreprise</h2><small>Identité juridique et siège : source unique pour les devis, factures et activités.</small></div><span class="pill" id="company-completeness">Détection active</span></div>
    <div class="settings-company-grid">
      <form id="settings">
        <div class="grid-2">${F('sname','Raison sociale',S.company.name,'required')}${F('ssiret','SIRET',S.company.siret||'')}</div>
        <div class="grid-2">${F('ssiren','SIREN',S.company.siren||'')}<label class="field"><span>Forme juridique</span><select id="slegal"><option value="">Votre choix</option>${S.company.legal_form?`<option value="${e(S.company.legal_form)}" selected>${e(S.company.legal_form)}</option>`:''}</select></label></div>
        <div class="button-row"><button type="button" class="btn secondary" id="lookup-company-siret">Détecter mon entreprise (SIRET / SIREN)</button></div><p id="company-registry-status" class="help" role="status" aria-live="polite"></p>
        <div id="company-registry-preview" class="notice" hidden></div>
        <div class="grid-2">${F('saddress','Adresse du siège',S.company.address||'')}<div>${F('swebsite','Site web',S.company.website||'')}</div></div>
        <div class="grid-2">${F('spostal','Code postal',S.company.postal_code||'')}${F('scity','Ville',S.company.city||'')}</div>
        <div class="grid-2">${F('sactivity','Activité / métier',S.company.activity||'')} ${F('snaf','Code NAF',S.company.configuration_data?.naf_code||'')}</div><div class="grid-2">${F('svat','N° de TVA intracommunautaire',S.company.configuration_data?.vat_number||'')}<div></div></div><div>${F('scustom','Activité précise',S.company.custom_activity||'')}</div>
        <div class="settings-savebar"><span class="settings-state" id="company-state">Aucune modification</span><div class="button-row"><button class="btn secondary" type="button" id="company-reset">Annuler</button><button class="btn primary" type="submit">Enregistrer l’entreprise</button></div></div>
      </form>

    </div>
  </section>
  <section class="panel stack settings-section" id="settings-data-import" data-settings-text="import données entreprise existante ancien logiciel clients fournisseurs produits services devis factures">
    <div class="section-title"><div><h2>Import de données d’une entreprise existante</h2><small>Prévisualisez les exports de vos anciens outils, corrigez les rapprochements, puis choisissez ce qui sera importé.</small></div></div>
    <div id="data-import-slot"></div>
  </section>
  <section class="panel stack settings-section" id="settings-mailbox" data-settings-text="messagerie agenda compte connexion">
    <div class="section-title"><div><h2>2 · Messagerie & agenda</h2><small>Les intégrations existantes restent au même endroit, sans recopier l’identité de l’entreprise.</small></div></div>
    <div id="mailbox-slot"></div>
  </section>
  ${configurationSection()}
  <section class="panel stack settings-section" id="settings-activities" data-settings-text="activités métiers fiscalité facturation tarification coefficients">
    <div class="section-title"><div><h2>4 · Activités et calculs métier</h2><small>Chaque activité conserve ses paramètres propres ; les informations juridiques de l’entreprise ne sont jamais dupliquées.</small></div><button class="btn secondary" id="add-activity">+ Ajouter une activité</button></div>
    ${S.activities.map(a=>`<div class="activity-row"><div><b>${e(a.name)}</b><small>${e(a.description||'')} · TVA ${a.vat_rate??'—'} % · Cotisations ${a.urssaf_rate==null?'à configurer':a.urssaf_rate+' %'}</small></div><div class="button-row"><button class="btn ${a.id===getActiveActivity()?'primary':'secondary'} small switch-activity" data-id="${a.id}">${a.id===getActiveActivity()?'Active':'Activer'}</button><button class="btn secondary small edit-activity" data-id="${a.id}">${a.configuration_defined?'Modifier':'Définir'}</button><button class="btn danger small del-activity" data-id="${a.id}">Supprimer</button></div></div>`).join('')||'<div class="empty">Aucune activité configurée.</div>'}
  </section>
  <section class="panel stack settings-section" id="settings-signature" data-settings-text="signature e-mail courriel identité envoi devis factures professionnel">
    <div class="section-title"><div><h2>5 · Signature d’e-mail professionnelle</h2><small>Signature de message, sans valeur de signature électronique juridique. Elle n’est pas ajoutée aux messages de sécurité.</small></div></div>
    <form id="email-signature-form" class="stack">
      <label class="check"><input id="signature-enabled" type="checkbox" checked> Ajouter la signature aux e-mails concernés</label>
      <div class="grid-2">${F('signature-first','Prénom','')}${F('signature-last','Nom','')}</div>
      <div class="grid-2">${F('signature-role','Fonction','')}${F('signature-company','Entreprise',S.company?.name||'')}</div>
      <div class="grid-2">${F('signature-email-phone','Téléphone','')}${F('signature-website','Site web','https://exemple.fr')}</div>
      ${F('signature-address','Adresse','')}
      <label class="field"><span>Mentions complémentaires (une par ligne)</span><textarea id="signature-extra" rows="3" maxlength="600" placeholder="Mentions ou liens complémentaires"></textarea></label>
      <div class="grid-2"><label class="check"><input id="signature-quotes" type="checkbox" checked> Sur les e-mails de devis</label><label class="check"><input id="signature-invoices" type="checkbox" checked> Sur les e-mails de factures et relances</label><label class="check"><input id="signature-professional" type="checkbox" checked> Sur les e-mails professionnels</label></div>
      <div class="button-row"><button type="submit" class="btn primary">Enregistrer la signature</button><button type="button" class="btn secondary" id="signature-disable">Désactiver la signature</button></div>
      <p id="signature-state" class="help" role="status" aria-live="polite">Chargement de la signature…</p>
      <div class="notice"><b>Aperçu texte</b><pre id="signature-preview" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><small>Les versions texte et HTML sont produites côté serveur à partir de champs échappés. Le logo n’est pas inséré dans les e-mails tant que la couche d’envoi ne prend pas en charge un CID public/embarqué sûr.</small></div>
    </form>
  </section>
  ${storageSection()}
  <section class="panel stack settings-section" id="settings-account" data-settings-text="compte sécurité connexion mot de passe biométrie"><div class="section-title"><div><h2>6 · Compte & sécurité</h2><small>Les informations personnelles restent gérées dans leur espace dédié ; aucun doublon n’est créé ici.</small></div></div><div class="button-row"><button type="button" class="btn secondary" data-go="account">Ouvrir Compte & sécurité</button></div></section>
  <section class="panel stack settings-section" id="settings-subscription" data-settings-text="abonnement paiement offre formule facturation compte"><div class="section-title"><div><h2>7 · Abonnement</h2><small>La gestion de l’offre et des paiements reste centralisée dans Compte.</small></div></div><div class="button-row"><button type="button" class="btn secondary" data-go="account">Ouvrir l’abonnement</button></div></section>`;
};

export function bind(){
  const $=s=>document.querySelector(s),all=s=>document.querySelectorAll(s);
  const initialCompany={...S.company};

  const populateLegalForms=async()=>{
    const select=$('#slegal');if(!select)return;
    try{const options=await api.legalForms();const current=S.company?.legal_form||select.value||'';select.innerHTML='<option value="">Votre choix</option>'+(options||[]).map(x=>`<option value="${e(x.label)}" ${current===x.label||current===x.code?'selected':''}>${e(x.label)}</option>`).join('')+(current&&!((options||[]).some(x=>x.label===current||x.code===current))?`<option value="${e(current)}" selected>${e(current)}</option>`:'');}catch{}
  };
  populateLegalForms();
  renderMailbox($('#mailbox-slot'),{companyName:S.company?.name||'',onChange:async()=>{S.mail=await api.mailStatus().catch(()=>S.mail)}});
  renderDataImport($('#data-import-slot'));
  bindStorage();
  const signatureFields=['signature-first','signature-last','signature-role','signature-company','signature-email-phone','signature-website','signature-address','signature-extra'];
  const setSignatureFields=signature=>{const s=signature||{};const pairs={'signature-first':'firstName','signature-last':'lastName','signature-role':'jobTitle','signature-company':'company','signature-email-phone':'phone','signature-website':'website','signature-address':'address','signature-extra':'extra'};for(const [id,key] of Object.entries(pairs)){const el=$('#'+id);if(el)el.value=s[key]||'';}$('#signature-enabled').checked=s.enabled!==false;$('#signature-quotes').checked=s.includeQuotes!==false;$('#signature-invoices').checked=s.includeInvoices!==false;$('#signature-professional').checked=s.includeProfessional!==false;};
  const signaturePayload=()=>({enabled:$('#signature-enabled').checked,firstName:$('#signature-first').value.trim(),lastName:$('#signature-last').value.trim(),jobTitle:$('#signature-role').value.trim(),company:$('#signature-company').value.trim(),phone:$('#signature-email-phone').value.trim(),website:$('#signature-website').value.trim(),address:$('#signature-address').value.trim(),extra:$('#signature-extra').value,includeQuotes:$('#signature-quotes').checked,includeInvoices:$('#signature-invoices').checked,includeProfessional:$('#signature-professional').checked});
  Promise.all([api.getEmailSignature(),api.account().catch(()=>({user:{}}))]).then(([result,account])=>{const user=account?.user||{},name=String(user.fullName||'').trim().split(/\s+/),sig=result.signature||{};setSignatureFields({...sig,firstName:sig.firstName||name.shift()||'',lastName:sig.lastName||name.join(' '),phone:sig.phone||user.mobilePhone||user.fixedPhone||'',company:sig.company||S.company?.name||'',website:sig.website||S.company?.website||'',address:sig.address||S.company?.address||''});$('#signature-preview').textContent=result.preview||'';$('#signature-state').textContent='Signature chargée ; les coordonnées enregistrées dans votre profil sont préremplies.';}).catch(x=>{if($('#signature-state'))$('#signature-state').textContent='Signature indisponible : '+(x.message||'erreur serveur');});
  $('#email-signature-form')?.addEventListener('submit',async ev=>{ev.preventDefault();const btn=$('#email-signature-form button[type="submit"]');btn.disabled=true;$('#signature-state').textContent='Enregistrement en cours…';try{const result=await api.saveEmailSignature(signaturePayload());$('#signature-preview').textContent=result.preview||'';$('#signature-state').textContent='Le serveur a confirmé l’enregistrement de la signature.';toast('Signature enregistrée.','success');}catch(x){$('#signature-state').textContent='Échec récupérable : '+(x.message||'erreur serveur');toast(x.message||'Signature non enregistrée.','error')}finally{btn.disabled=false;}});
  $('#signature-disable')?.addEventListener('click',async()=>{const payload=signaturePayload();payload.enabled=false;try{const result=await api.saveEmailSignature(payload);setSignatureFields(result.signature||payload);$('#signature-preview').textContent=result.preview||'';$('#signature-state').textContent='Signature désactivée côté serveur.';toast('Signature désactivée.','success')}catch(x){$('#signature-state').textContent='Échec : '+(x.message||'erreur serveur');toast(x.message||'Impossible de désactiver la signature.','error')}});

  // Détection SIRET/SIREN (D4) : implémentation partagée avec le parcours, au clic uniquement, propositions champ par champ.
  let registryCandidate=null;
  const markCompanyDirty=(dirty=true)=>{const el=$('#company-state');if(el)el.textContent=dirty?'Modifications non enregistrées':'Aucune modification'};
  const registryFieldMap={name:'#sname',siret:'#ssiret',siren:'#ssiren',legal_form:'#slegal',address:'#saddress',postal_code:'#spostal',city:'#scity',activity:'#sactivity',naf_code:'#snaf',website:'#swebsite',vat_number:'#svat'};
  const currentCompanyValues=()=>Object.fromEntries(Object.entries(registryFieldMap).map(([k,sel])=>[k,$(sel)?.value.trim()||'']));
  const applyFiscalFromLegalForm=async legalForm=>{
    const currentActivity=S.activities.find(activity=>activity.id===getActiveActivity())||S.activities[0];
    if(!legalForm||!currentActivity)return;
    try{
      const fiscal=await api.detectFiscal({legalForm,name:currentActivity.name||'',description:currentActivity.description||'',profileCode:currentActivity.profile_code});
      const updated=await api.updateActivity(currentActivity.id,{name:currentActivity.name,description:currentActivity.description||'',legalForm,urssafRate:String(fiscal.socialRate??currentActivity.urssaf_rate??0),vatRate:Number(fiscal.vatRate??currentActivity.vat_rate??20),autoFiscalDetect:true,profileCode:currentActivity.profile_code});
      S.activities=S.activities.map(activity=>activity.id===currentActivity.id?{...activity,...updated}:activity);
    }catch(error){toast('La mise à jour fiscale automatique a échoué : '+(error?.message||error),'error')}
  };
  const applyRegistryField=(key,value)=>{
    const el=$(registryFieldMap[key]);if(!el)return;
    if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===value))el.add(new Option(value,value));
    el.value=value;markCompanyDirty(true);
    if(key==='legal_form')applyFiscalFromLegalForm(value);
  };
  $('#lookup-company-siret')?.addEventListener('click',async()=>{
    const identifier=$('#ssiret').value.trim()||$('#ssiren').value.trim();
    const result=await detectCompany(identifier,{button:$('#lookup-company-siret'),status:$('#company-registry-status')});
    registryCandidate=result.company||null;
    const box=$('#company-registry-preview');
    if(registryCandidate)renderProposals(box,buildProposals(currentCompanyValues(),registryCandidate),applyRegistryField);else if(box){box.hidden=true;box.innerHTML=''}
  });
  ['#ssiret','#ssiren'].forEach(sel=>$(sel)?.addEventListener('input',()=>markCompanyDirty()));
  $('#settings')?.addEventListener('input',()=>markCompanyDirty());
  $('#settings')?.addEventListener('change',()=>markCompanyDirty());
  $('#settings')?.addEventListener('submit',async ev=>{
    ev.preventDefault();
    try{
      await api.updateOrganization({name:$('#sname').value.trim(),activity:$('#sactivity').value.trim(),customActivity:$('#scustom').value.trim(),siret:$('#ssiret').value.replace(/\D/g,''),siren:$('#ssiren').value.replace(/\D/g,''),legalForm:$('#slegal').value.trim(),address:$('#saddress').value.trim(),postalCode:$('#spostal').value.trim(),city:$('#scity').value.trim(),website:$('#swebsite').value.trim(),configurationData:{...(S.company?.configuration_data||{}),naf_code:$('#snaf').value.trim(),vat_number:$('#svat')?.value.trim()||''}});
      toast('Entreprise enregistrée.','success');registryCandidate=null;markCompanyDirty(false);await hooks.refresh('settings');
    }catch(x){toast(x.message,'error')}
  });
  $('#company-reset')?.addEventListener('click',()=>{Object.entries(initialCompany).forEach(([k,val])=>{const map={name:'#sname',siret:'#ssiret',siren:'#ssiren',legal_form:'#slegal',address:'#saddress',postal_code:'#spostal',city:'#scity',website:'#swebsite',activity:'#sactivity',custom_activity:'#scustom'};const el=map[k]?$(map[k]):null;if(el)el.value=val??''});$('#snaf').value=initialCompany.configuration_data?.naf_code||'';registryCandidate=null;const preview=$('#company-registry-preview');if(preview){preview.hidden=true;preview.innerHTML=''}markCompanyDirty(false)});

  const configurationForm=$('#configuration-form');
  if(configurationForm){
    const initial=new FormData(configurationForm);
    const syncState=()=>{const out=$('#configuration-state');if(!out)return;const now=new FormData(configurationForm);let dirty=false;for(const [k,v] of initial.entries())if(now.get(k)!==v)dirty=true;out.textContent=dirty?'Modifications non enregistrées':'Aucune modification'};
    configurationForm.addEventListener('change',syncState);
    $('#configuration-reset')?.addEventListener('click',()=>{for(const [k,v] of initial.entries()){const el=configurationForm.querySelector(`[name="${k}"]`);if(el)el.value=v}syncState()});
    configurationForm.addEventListener('submit',async ev=>{
      ev.preventDefault();const q={};CONFIGURATION_QUESTIONS.forEach(([key])=>{q[key]=configurationForm.querySelector(`select[name="q-${key}"]`)?.value||''});
      const configurationData={...(S.company?.configuration_data||{}),questionnaire:q,completed:true};
      try{const updated=await api.updateOrganization({name:S.company.name||'Mon entreprise',activity:S.company.activity||'À configurer',customActivity:S.company.custom_activity||'',siret:String(S.company.siret||'').replace(/\D/g,''),siren:String(S.company.siren||'').replace(/\D/g,''),legalForm:S.company.legal_form||'',address:S.company.address||'',postalCode:S.company.postal_code||'',city:S.company.city||'',website:S.company.website||'',configurationData,configurationIncomplete:false});S.company=updated;toast('Configuration enregistrée dans Paramètres.','success');await hooks.refresh('settings')}catch(x){toast(x.message,'error')}
    });
  }

  $('#settings-search')?.addEventListener('input',ev=>{
    const term=String(ev.target.value||'').trim().toLowerCase();
    all('.settings-section').forEach(section=>{const hay=(section.dataset.settingsText||'')+' '+section.textContent;section.hidden=!!term&&!hay.toLowerCase().includes(term)});
  });
  all('.settings-nav [data-target]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.target)?.scrollIntoView({behavior:'smooth',block:'start'})));

  const wireFiscal=(form,legalForms=[])=>{
    if(!form)return;
    const legalInput=form.querySelector('#legalForm'),vatInput=form.querySelector('#vatRate'),socialInput=form.querySelector('#urssafRate');let timer=0;const orgLegal=S.company?.legal_form||'';
    if(legalInput&&!legalInput.value&&orgLegal)legalInput.value=orgLegal;
    const markAuto=(el,value)=>{if(!el||value===null||value===undefined)return;el.value=value;el.dataset.autoValue=String(value);el.dataset.manualEdited='false'};
    const update=async()=>{
      const lf=(legalInput?.value||orgLegal).trim();if(!lf)return;
      try{const r=await api.detectFiscal({legalForm:lf,name:v(form,'name'),description:v(form,'description'),profileCode:form.querySelector('#profileCode')?.value||''});if(vatInput&&r.vatRate!==null&&r.vatRate!==undefined&&(!vatInput.value||vatInput.dataset.autoValue===vatInput.value))markAuto(vatInput,r.vatRate);if(socialInput&&(!socialInput.value||socialInput.dataset.autoValue===socialInput.value))markAuto(socialInput,r.socialRate??'');const d=form.querySelector('#fiscal-detection');if(d)d.textContent=`${r.socialRegime} · ${r.vatRegime}`;const c=form.querySelector('#fiscal-contributions');if(c)c.innerHTML=renderContributions(r.contributions||[]);form.dataset.autoCgv=r.cgvText||'';}catch(x){toast(x.message,'error')}
    };
    form.querySelector('#name')?.addEventListener('input',()=>{clearTimeout(timer);timer=window.setTimeout(update,200)});
    form.querySelector('#description')?.addEventListener('input',()=>{clearTimeout(timer);timer=window.setTimeout(update,250)});
    form.querySelector('#profileCode')?.addEventListener('change',update);
    vatInput?.addEventListener('input',()=>{delete vatInput.dataset.autoValue;vatInput.dataset.manualEdited='true'});socialInput?.addEventListener('input',()=>{delete socialInput.dataset.autoValue;socialInput.dataset.manualEdited='true'});
    setTimeout(update,0);
  };

  const wireActivityDetection=(form,a={})=>{
    if(!form)return;
    const profileSelect=form.querySelector('#profileCode');
    const legalNotice=form.querySelector('.fiscal-detection')?.previousElementSibling?.previousElementSibling;
    const detectProfile=async()=>{
      if(!profileSelect)return;
      const name=v(form,'name')||a.name||S.company?.custom_activity||S.company?.activity||S.company?.name||'';
      const description=v(form,'description')||a.description||S.company?.custom_activity||S.company?.activity||'';
      if(!name&&!description)return;
      try{
        const r=await api.detectProfile({name,description});
        if(profileSelect&&!profileSelect.value&&r?.code)profileSelect.value=r.code;
        const status=form.querySelector('#fiscal-detection');
        if(status&&r?.title)status.textContent=`Profil détecté : ${r.title}.`;
      }catch{}
    };
    const detectLegal=async()=>{
      const display=form.querySelector('.settings-subsection .notice');
      if(!display)return;
      const current=S.company?.legal_form||a.legal_form||'';
      let legal=current;
      if(!legal){try{const r=await api.detectLegalForm({name:v(form,'name')||a.name||'',description:v(form,'description')||a.description||''});legal=r?.legalForm||''}catch{}}
      if(legal)display.innerHTML=`<b>Identité juridique : ${e(legal)}</b><small>Renseignée une seule fois dans « Entreprise » et réutilisée automatiquement ici.</small>`;
    };
    setTimeout(detectProfile,0);
    setTimeout(detectLegal,0);
  };

  $('#add-activity')?.addEventListener('click',async()=>{
    const pf=await api.profiles().catch(()=>[]);
    const m=modalForm('Nouvelle activité',activityForm({},pf),async modal=>{const r=await api.createActivity(activityBody(modal));setActiveActivity(r.id);await hooks.refresh('settings')});
    wireFiscal(m,[]);
    wireActivityDetection(m,{});
  });
  all('.switch-activity').forEach(b=>b.onclick=async()=>{setActiveActivity(b.dataset.id);await hooks.refresh('settings')});
  all('.edit-activity').forEach(b=>b.onclick=async()=>{
    const a=S.activities.find(x=>x.id===b.dataset.id);const pf=await api.profiles().catch(()=>[]);
    const m=modalForm('Modifier l’activité',activityForm(a,pf),async modal=>{await api.updateActivity(a.id,activityBody(modal));await hooks.refresh('settings')});
    fillActivityValues(m,a);wireFiscal(m,[]);wireActivityDetection(m,a);
  });
  all('.del-activity').forEach(b=>b.onclick=()=>confirmDelete('Supprimer cette activité et son catalogue (prestations, pièces, fournisseurs, garanties) ? Impossible si elle contient encore des clients, devis ou rendez-vous.',()=>api.deleteActivity(b.dataset.id),'Activité supprimée'));
}
