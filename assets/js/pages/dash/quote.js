/**
 * Éditeur de devis et de factures.
 *
 * Flux : lignes de pièces (quantité + coût) → inputs() (unités et arrondis au centime) →
 * computePricing (moteur pur, sans cache) → rendu du panneau de calcul et du brouillon.
 * Le prix TTC saisi pilote la marge ; en mode « marge nette visée », c'est le prix qui est
 * retrouvé. Aucune valeur calculée n'est conservée entre deux saisies.
 */
import{api}from'../../core/api.js';
import{computePricing}from'../../core/pricing.js';
import{S,e,money,toast,prof,active,hooks,emailToast,askConfirm}from'./core.js';
import{attachSuggest}from'../../core/suggest.js?v=mobile-scroll-2';import{detectService,rankRelevantParts}from'../../core/recommendations.js';

let lines=[],driver='ttc',catalogPricing=true;
// 15.4.67 (consigne éditeur) : le champ « Prix TTC facturé au client » affiche le TOTAL cumulé
// (prestation principale + toutes les prestations complémentaires), recalculé en temps réel à
// chaque ajout/retrait ; baseTtcMain conserve la base (prestation principale seule) pour ce
// recalcul. Remise TTC : configurée en € ou en %, appliquée via bouton dédié — le moteur la
// déduit du TTC cible (règle comptable : HT = TTC ÷ (1 + taux), aucun arrondi intermédiaire).
let baseTtcMain=null,discountTtc=0;
// V2 — dernière main-d’œuvre facturée intégrée au TTC (TVA comprise). Le champ « Main-d’œuvre
// facturée HT » n'est plus décoratif : toute modification ajuste le TTC client du delta exact,
// sans jamais compter deux fois le montant lors d'un rechargement ou d'une édition.
let lastLabourTtc=0;
// Bloc 8 — référentiel des catégories d'activité micro (chargé une fois par vue, repli local si indisponible).
let microRef={version:null,rates:[],categories:[]};
const FALLBACK_CATEGORIES=[['vente_bic','Vente de marchandises (BIC)'],['services_bic','Prestations de services BIC'],['services_bnc','Autres prestations de services (BNC)'],['services_bnc_cipav','Professions libérales réglementées CIPAV'],['specific','Activité à règles spécifiques']];
const catOptions=sel=>(microRef.rates.length?microRef.rates.map(r=>[r.category,r.label]):FALLBACK_CATEGORIES).map(([code,label])=>`<option value="${e(code)}" ${sel===code?'selected':''}>${e(label)}</option>`).join('');
const rateOf=cat=>microRef.rates.find(r=>r.category===cat)||null;
// Bloc 8 — référentiel chargé au PREMIER RENDU de la vue (jamais au boot : avant login, la
// requête partirait sans session et le navigateur journaliserait un 401 inutile).
let microRefFetchStarted=false;
const ensureMicroRef=()=>{if(microRefFetchStarted)return;microRefFetchStarted=true;api.microReferential().then(x=>{microRef=x||microRef;const sel=document.getElementById('activityCategory');if(sel){const cur=sel.value;sel.innerHTML='<option value="">Non renseigné (activité unique ou à préciser)</option>'+catOptions(cur);sel.value=cur||''}}).catch(()=>{})};
let draftTimer=null,draftSequence=0;
// Bloc 11 — champ simple pour la saisie d'un nouveau client sans fiche préexistante.
const F=(id,label,val='',extra='')=>`<label class="field"><span>${e(label)}</span><input id="${id}" value="${e(val)}" ${extra}${/placeholder=/.test(extra)?'':` placeholder="Saisissez ${e(String(label).toLowerCase())}…"`}></label>`;
const blank=()=>({label:'',quantity:'',unitCost:'',unitPrice:'',partId:null,saleCoefficientPercent:null,activityCategory:null,categoryAuto:false});
// 15.4.55 — report des valeurs au centime : les sommes flottantes (quantités × coûts, champs
// saisis) partaient avec des résidus binaires (ex. 89.90000000000001) dans le brouillon et les
// instantanés. Tout montant euro transmis au serveur ou stocké est arrondi au centime ici ; le
// moteur (arithmétique exacte côté serveur) reçoit des valeurs propres et reproductibles.
const r2=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?Math.round(n*100)/100:0};
const cheapest=p=>{const c=(p?.suppliers||[]).map(s=>Number(s.purchasePrice)).filter(n=>n>0);return c.length?Math.min(...c):0};
const finiteNumber=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
const savedBaseTtc=q=>{
  if(!q)return '';
  const snapshotBase=finiteNumber(q?.calculation_snapshot?.baseTtc??q?.calculation_snapshot?.result?.baseTtc??q?.calculation_snapshot?.baseTargetTtc??q?.calculation_snapshot?.result?.baseTargetTtc);
  const total=finiteNumber(q?.total_ttc),final=finiteNumber(q?.final_price_ttc),mileage=finiteNumber(q?.mileage_total)??0,vat=finiteNumber(q?.vat_rate)??0;
  const mileageTtc=q?.mileage_mode==='client_price'?mileage*(1+vat/100):0;
  // En édition, le total enregistré peut provenir d'un ancien instantané qui incluait déjà les km.
  // Le prix piloté par le formulaire doit toujours rester le prix de base hors km facturés.
  if(q?.mileage_mode==='client_price'&&total!==null&&mileageTtc>0)return Math.max(0,total-mileageTtc);
  if(snapshotBase!==null)return snapshotBase;
  if(final!==null){
    // Les anciens documents stockaient parfois le total TTC dans final_price_ttc.
    if(q?.mileage_mode==='client_price'&&mileageTtc>0&&total!==null&&Math.abs(final-total)<0.005)return Math.max(0,total-mileageTtc);
    return final;
  }
  if(q?.mileage_mode==='client_price'&&total!==null)return Math.max(0,total-mileageTtc);
  return total??'';
};

export const view=()=>{
  ensureMicroRef();
  const p=prof(),c=p.calc||{},deviceFieldsEnabled=['smartphone-repair','computer-repair'].includes(String(p.code||p.profile_code||'')),configQ=S.company?.configuration_data?.questionnaire||{},orgPricing=S.company?.configuration_data?.pricing||{},orgFiscal=S.company?.configuration_data?.fiscal||{},orgBilling=S.company?.configuration_data?.billing||{},itemsEnabled=c.items!==false&&configQ.parts!=='Non',a=active()||{},editing=S.editing,q=S.editing||S.quoteDraft,documentKind=editing?(q?.document_type==='invoice'?'invoice':'quote'):(S.documentType==='invoice'?'invoice':(q?.documentType==='invoice'?'invoice':'quote')),doc=p.doc||{},coefficientBasis='purchase',coefficientUnit=(q?.coefficient_unit||q?.coefficientUnit)==='euro'?'euro':'percent',coefficientValue=q?.coefficient_basis!=='margin'?(q?.coefficient_value!=null?q.coefficient_value:(q?.coefficientValue!=null?q.coefficientValue:(q?.part_coefficient_percent??a.default_part_coefficient_percent??0))):(q?.part_coefficient_percent??a.default_part_coefficient_percent??0),mileageMode=q?.mileage_mode?(q.mileage_mode==='client_price'?'client_price':'margin'):(orgPricing.default_mileage_mode==='client_price'?'client_price':'margin'),mileageInternalRate=q?.mileage_internal_rate??q?.mileageInternalRate??q?.mileage_rate??orgPricing.internal_mileage_rate??0,mileageClientRate=q?.mileage_client_rate??q?.mileageClientRate??q?.mileage_rate??orgPricing.client_mileage_rate??0,invoiceAddressSource=q?.invoice_address_source==='intervention'?'intervention':q?.invoice_address_source==='free'?'free':'client',billingAddress=q?.billing_address_snapshot||'',targetTtcValue=savedBaseTtc(q);
  return`<div class="page-head"><div><span class="eyebrow">${e(editing?'MODIFIER':(documentKind==='invoice'?'FACTURE':(p.quoteLabel||'DEVIS')).toUpperCase())} · ${e(a.name||'')}</span><h1>${editing?`${documentKind==='invoice'?'Modifier la facture':'Modifier le devis'} ${e(q.number)}`:(documentKind==='invoice'?'Nouvelle facture':'Nouveau devis')}</h1><p>${deviceFieldsEnabled?'Le client verra la prestation, les pièces avec leur quantité, les références d’appareil renseignées et le total TTC.':'Le client verra uniquement : '+e((doc.interventionLabel||'la prestation').toLowerCase())+', '+e((doc.itemsLabel||'les pièces').toLowerCase())+' avec leur quantité, et le total TTC. Le reste est interne.'}</p></div></div>
  ${editing?'':'<p id="draft-sync-status" class="help" role="status" aria-live="polite">Le brouillon sera synchronisé à votre compte automatiquement.</p>'}
  <form id="quote-form" class="quote-layout"><section class="panel stack">
   <h2>1 · Client et ${e((doc.interventionLabel||'prestation').toLowerCase())}</h2>
   <label class="field"><span>Client</span><select id="qclient"><option value="">Votre choix</option>${S.clients.map(x=>`<option value="${x.id}" ${q&&q.client_id===x.id?'selected':''}>${e(x.name)}</option>`).join('')}<option value="__new__">Nouveau client (saisie directe)</option></select></label><section id="new-client-fields" hidden class="stack"><p class="help" id="nc-help">Création directe sans fiche préexistante : la fiche client sera créée avec le document dans la même opération (annulation = rien n'est créé). Avant validation, Aurion recherche les doublons et vous propose de réutiliser un client existant — jamais de fusion automatique.</p><div class="grid-2">${F('nc-name','Nom / raison sociale','','required')}${F('nc-email','E-mail','','type="email"')}</div><div class="grid-2">${F('nc-phone','Téléphone','')}${F('nc-siret','SIRET (facultatif)','','inputmode="numeric" maxlength="14"')}</div>${F('nc-address','Adresse','')}<div class="grid-2">${F('nc-postal','Code postal','')}${F('nc-city','Ville','')}</div></section><div id="qclient-summary" class="client-summary" hidden></div>
   <label class="field"><span>Adresse d’intervention enregistrée sur le document</span><select id="interventionAddressId"><option value="">Adresse par défaut / aucune adresse</option></select><small class="help">L’adresse choisie est figée dans le devis ou la facture émis ; les modifications ultérieures du carnet d’adresses ne changent pas les documents historiques.</small></label>
   <label class="field"><span>Adresse de facturation</span><select id="invoiceAddressSource"><option value="client" ${invoiceAddressSource==='client'?'selected':''}>Adresse postale</option><option value="intervention" ${invoiceAddressSource==='intervention'?'selected':''}>Adresse d’intervention</option><option value="free" ${invoiceAddressSource==='free'?'selected':''}>Adresse libre</option></select></label>
   <label class="field"><span>Adresse utilisée pour la facturation</span><textarea id="billingAddress" rows="4" placeholder="Saisissez ou modifiez l’adresse de facturation…">${e(billingAddress)}</textarea><small class="help">Cette adresse est préremplie selon votre choix et reste toujours modifiable manuellement.</small></label>
   
   <label class="field"><span>${e(doc.interventionLabel||'Prestation')} <em class="tag">visible client</em></span><input id="intervention" required autocomplete="off" value="${e(q?.intervention||'')}" placeholder="Choisissez dans le catalogue ou saisissez librement"></label>
   <div id="service-detected" class="help" aria-live="polite"></div>
   <div class="stack" id="service-extras-block"><div class="section-title"><h2>Prestations complémentaires</h2><button type="button" class="btn secondary small" id="add-service">Ajouter une prestation</button></div><p class="help">Réparations supplémentaires : ajoutez ou retirez librement — le prix TTC saisi s'ajoute au total du document et la ligne figure sur le PDF (HT recalculé avec la TVA du document).</p><div id="service-extras" class="stack"></div></div><div class="stack" ${itemsEnabled?'':'hidden'}>   <h2>2 · ${e(c.itemsTitle||'Pièces')}</h2><p class="help">${e(c.hint||'')}</p>
   <div class="lines-scroll"><div class="lines-head"><span>Désignation <em class="tag">visible client</em></span><span>Qté <em class="tag">visible client</em></span><span>Prix d’achat unitaire HT <em class="tag internal">interne</em></span><span>Prix de vente unitaire HT <em class="tag">visible client</em></span><span>Type de prestation</span><span></span></div>
   <div id="lines"></div></div>
   <p class="help">Type de prestation par pièce : rattachez chaque ligne à une catégorie (format Aurion — « Votre choix »). Sans choix, la ligne hérite de la catégorie du document renseignée dans les paramètres fiscaux.</p>
   <button type="button" class="btn secondary" id="add-line">+ Ajouter ${e((doc.itemsLabel||'une ligne').toLowerCase()==='pièces'?'une pièce':'une ligne')}</button>
</div>
   ${c.shipping?`<label class="field"><span>${e(c.shippingLabel||'Frais annexes (HT)')} <em class="tag internal">interne</em></span><input id="shipping" type="number" min="0" step="0.01" value="${q&&q.shipping_cost!=null?e(q.shipping_cost):''}" placeholder="Coût livraison (€ HT)"></label>`:''}
   <label class="field"><span>Frais kilométriques <em class="tag">visible client</em></span><select id="mileageMode"><option value="margin" ${mileageMode==='margin'?'selected':''}>Déduire de la marge</option><option value="client_price" ${mileageMode==='client_price'?'selected':''}>Ajouter au prix client TTC</option></select><input id="mileageKm" type="number" min="0" step="0.1" inputmode="decimal" value="${Number(q?.mileage_km||0)>0?e(q.mileage_km):''}" placeholder="Kilomètres à parcourir (ex. 12)"><div class="grid-2"><input id="mileageInternalRate" type="number" min="0" step="0.001" value="${mileageInternalRate?e(mileageInternalRate):''}" placeholder="Coût interne €/km"><input id="mileageClientRate" type="number" min="0" step="0.001" value="${mileageClientRate?e(mileageClientRate):''}" placeholder="Tarif client €/km"></div><small class="help">Aurion distingue le coût interne et le tarif facturé. Montant appliqué : <strong id="mileageTotal">${Number(q?.mileage_total||0)>0?money(Number(q.mileage_total)):'à renseigner'}</strong>.</small></label>
   <div class="field"><span>Coefficient Aurion · appliqué au coût des pièces</span><input id="coefficientBasis" type="hidden" value="purchase"><div class="grid-2"><label class="field"><span>Unité</span><select id="coefficientUnit"><option value="percent" ${coefficientUnit==='percent'?'selected':''}>%</option><option value="euro" ${coefficientUnit==='euro'?'selected':''}>€</option></select></label></div><label class="field"><span>Coefficient</span><input id="coefficientValue" type="number" min="0" step="0.01" value="${coefficientValue?e(coefficientValue):''}" placeholder="Coefficient"></label><small class="help">Le coefficient reste modifiable pour chaque devis. En €, le montant est ajouté à chaque unité de pièce ; en %, il majore le coût d’achat des pièces.</small></div>
   <h2>${c.items===false?'2':'3'} · Prix client</h2>
   <label class="field"><span>Main-d’œuvre facturée HT <em class="tag">intégrée au TTC</em></span><input id="laborSellingHt" type="number" min="0" step="0.01" value="${q?.labor_selling_ht!=null&&q?.driver!=='net'?e(q.labor_selling_ht):''}" placeholder="Prix HT"><small class="help">Ce montant est ajouté au TTC facturé au client (TVA comprise) : le modifier ajuste le total du même écart. Le coût interne reste séparé et ne change jamais le prix client.</small></label>
   <details class="advanced"><summary>Coûts internes (facultatif)</summary><label class="field"><span>Coût interne main-d’œuvre HT <em class="tag internal">interne</em></span><input id="laborInternalCostHt" type="number" min="0" step="0.01" value="${q?.labor_internal_cost_ht!=null?e(q.labor_internal_cost_ht):''}" placeholder="Coût réel HT"><small class="help">Coût réel de la main-d’œuvre pour votre entreprise. Il réduit la marge et n’est jamais ajouté au prix client.</small></label></details>
   <label class="field"><span>Prix TTC facturé au client</span><input id="targetTtc" type="number" min="0" step="0.01" value="${q?e(targetTtcValue):''}" class="big-input" placeholder="Prix TTC voulu"><small class="help">Le champ affiche le TOTAL : prestation principale + prestations complémentaires + matériel vendu, cumulés automatiquement en temps réel.</small></label>
   <div class="field discount-row"><span>Remise sur le TTC facturé au client</span><div class="grid-2"><input id="discountValue" type="number" min="0" step="0.01" placeholder="Montant de la remise"><select id="discountUnit" aria-label="Unité de la remise"><option value="eur">€ (montant)</option><option value="pct">% (pourcentage)</option></select></div><div class="button-row"><button type="button" class="btn secondary small" id="apply-discount">Appliquer la remise</button><button type="button" class="link-btn" id="clear-discount" hidden>Retirer la remise</button></div><small class="help" id="discount-status" role="status"></small></div>
   <details class="advanced"><summary>Calcul inverse : bénéfice minimum indicatif</summary><label class="field"><span>Bénéfice minimum indicatif (€)</span><input id="minimumProfit" type="number" min="0" step="0.01" value="${q?.targetNet??''}" placeholder="0"><small class="help">Aurion calcule immédiatement le TTC nécessaire pour atteindre ce bénéfice minimum. Vous pouvez définir librement cette valeur.</small></label></details>
   <details class="advanced"><summary>Paramètres fiscaux : TVA ${Number(q?.vat_rate??a.vat_rate??20)} % · règles détectées</summary><div class="grid-2"><label class="field"><span>TVA %</span><input id="vat" type="number" min="0" max="100" step="0.01" value="${q?.vat_rate!=null?e(q.vat_rate):(a.vat_rate!=null?e(a.vat_rate):(orgFiscal.vat_rate!=null?e(orgFiscal.vat_rate):''))}"></label><label class="field"><span>TVA achats</span><select id="purchaseVatMode"><option value="auto" ${(q?.purchase_vat_mode||'auto')==='auto'?'selected':''}>Détectée automatiquement</option><option value="manual" ${q?.purchase_vat_mode==='manual'?'selected':''}>Taux personnalisé</option><option value="exempt" ${q?.purchase_vat_mode==='exempt'?'selected':''}>Exonéré</option></select></label></div><label class="field"><span>Taux TVA achats (%)</span><input id="purchaseVatRate" type="number" min="0" max="100" step="0.01" value="${q?.purchase_vat_rate??orgPricing.purchase_vat_rate??''}"></label><label class="field"><span>Catégorie d’activité par défaut du document (bloc 8 · activité mixte)</span><select id="activityCategory"><option value="">Non renseigné (activité unique ou à préciser)</option>${catOptions(q?.activity_category||q?.activityCategory||'')}</select><small class="help">Ventilation du chiffre d’affaires par catégorie (vente, services BIC, BNC, CIPAV) avec les taux officiels datés de l’URSSAF. Chaque ligne peut redéfinir cette catégorie ; la proposition issue de l’APE détecté n’est jamais appliquée sans votre accord.</small></label><div class="stack"><span class="help">Cotisations détectées selon la forme juridique — modifiables pour ce document.</span>${(a.contributions||[]).map((c,i)=>`<label class="field"><span>${e(c.name||'Cotisation')} (${e(c.basis||'CA HT')})</span><input class="contrib-rate" data-name="${e(c.name||'Cotisation')}" data-basis="${e(c.basis||'ca_ht')}" data-mandatory="${c.mandatory===false?'false':'true'}" type="number" min="0" max="99.99" step="0.001" value="${q?.contribution_snapshot?.[i]?.rate??c.rate??''}"></label>`).join('')}</div></details>

   ${deviceFieldsEnabled?`<section class="stack device-identity-fields" aria-labelledby="device-identity-heading"><div><h3 id="device-identity-heading">Identification de l’appareil</h3><p class="help">Champs facultatifs, visibles sur le devis ou la facture. Laissez-les vides si non applicables.</p></div><div class="grid-2"><label class="field"><span>Numéro de série (facultatif)</span><input id="deviceSerialNumber" type="text" maxlength="160" autocomplete="off" value="${e(q?.serial_number??q?.serialNumber??'')}" placeholder="Numéro de série"></label><label class="field"><span>IMEI (facultatif)</span><input id="deviceImei" type="text" maxlength="80" autocomplete="off" value="${e(q?.imei??'')}" placeholder="IMEI de l’appareil"></label></div></section>`:''}
   <label class="field"><span>Garantie affichée <em class="tag">visible client</em></span><input id="warrantyText" value="${e(q?.warranty_text||'')}" placeholder="Ex. Garantie 6 mois"></label>
   ${documentKind==='invoice'?`<section class="stack einvoice-mentions" aria-labelledby="einvoice-heading"><div><h3 id="einvoice-heading">Facturation électronique</h3><p class="help">Mentions obligatoires depuis le 1er septembre 2026 pour la facturation électronique (plateforme agréée) : catégorie de l’opération, SIREN du client, option TVA sur les débits le cas échéant, adresse de livraison si différente de la facturation.</p></div><div class="grid-2"><label class="field"><span>Catégorie de l’opération</span><select id="einvoiceOperationCategory"><option value="" ${!q?.einvoice_operation_category?'selected':''}>À compléter</option><option value="LB" ${q?.einvoice_operation_category==='LB'?'selected':''}>Livraison de biens (LB)</option><option value="PS" ${q?.einvoice_operation_category==='PS'?'selected':''}>Prestation de services (PS)</option><option value="LBPS" ${q?.einvoice_operation_category==='LBPS'?'selected':''}>Vente et prestation distinctes (LBPS)</option></select></label><label class="field"><span>SIREN du client</span><input id="einvoiceBuyerSiren" inputmode="numeric" maxlength="20" autocomplete="off" value="${e(q?.einvoice_buyer_siren??'')}" placeholder="9 chiffres"></label></div><label class="field"><span>Option pour le paiement de la TVA sur les débits</span><label class="check"><input id="einvoiceVatOnPayment" type="checkbox" ${q?.einvoice_vat_on_payment?'checked':''}><span> Cochez si vous avez exercé cette option (mention « le cas échéant »)</span></label></label><label class="field"><span>Adresse de livraison <em class="tag">si différente de la facturation</em></span><textarea id="einvoiceDeliveryAddress" rows="3" placeholder="Laissez vide si identique à l’adresse de facturation…">${e(q?.einvoice_delivery_address??'')}</textarea></label></section>`:''}
   <div class="button-row"><button class="btn primary" type="submit">${editing?'Enregistrer les modifications':(documentKind==='invoice'?'Enregistrer la facture':'Enregistrer le devis')} →</button>${editing?'<button class="btn secondary" type="button" id="cancel-edit">Annuler</button>':''}</div></section>
  <aside class="panel calculation"><span class="eyebrow">CALCULATEUR</span><h2>Résultat</h2><div id="calc"></div></aside></form>`;
};

/** Point d'entrée de la vue : rend l'éditeur, branche la saisie, le brouillon et l'enregistrement. */
export async function bind(){
  const $=s=>document.querySelector(s),num=s=>{const raw=String($(s)?.value??'').trim();if(!raw)return 0;const n=Number(raw.replace(',','.'));if(!Number.isFinite(n))throw new Error(`Valeur invalide : ${s.replace(/^#/,'')}`);return n};
  const editing=S.editing;
  const q=editing||S.quoteDraft;
  const orgBilling=S.company?.configuration_data?.billing||{};
  const documentType=editing?(q?.document_type==='invoice'?'invoice':'quote'):(S.documentType==='invoice'?'invoice':(q?.documentType==='invoice'?'invoice':'quote'));
  S.documentType=documentType;
  if(q?.documentType&&!editing)S.documentType=q.documentType==='invoice'?'invoice':'quote';
  driver=q?(q.driver==='net'?'net':'ttc'):'net';catalogPricing=q?((q.catalogPricing??q.catalog_pricing)!==false):true;
  if(!q&&S.prefillClient){$('#qclient').value=S.prefillClient;S.prefillClient=null}
    // 15.4.63 — multi-prestations : les lignes « service » (prestations complémentaires) sont
    // séparées des pièces ; leur prix TTC est reconstitué depuis le HT stocké et la TVA du document.
    // 15.4.65 — CORRECTIF : la déclaration est remontée AVANT la restauration du brouillon
    // (elle se trouvait plus bas dans le bind : « Cannot access 'serviceExtras' before
    // initialization » tuait tout le bind — calculateur, suggestions, boutons, enregistrement).
    let serviceExtras=[];
    const vatReload=Number(q?.vat_rate??active()?.vat_rate??0)||0;
    lines=q?(q.items||[]).filter(i=>i.kind!=='service').map(i=>({label:i.label,quantity:Number(i.quantity),unitCost:Number(i.unitCost),unitPrice:i.unitPrice==null?'':Number(i.unitPrice),partId:i.partId,saleCoefficientPercent:Number(i.saleCoefficientPercent??0),activityCategory:i.activityCategory||null})):[];
    serviceExtras=q?(q.items||[]).filter(i=>i.kind==='service').map(i=>({label:String(i.label||''),price:Number(((Number(i.unitPrice)||0)*(1+vatReload/100)).toFixed(2))})):[];
    // 15.4.67 — cumul temps réel : le champ affiche le TOTAL (base + prestations complémentaires).
    // baseTtcMain = prestation principale seule ; la remise TTC enregistrée est restaurée depuis
    // l'instantané du document (listPriceTtc = TTC avant remise, discountTtc = remise).
    const extrasTotal=()=>serviceExtras.reduce((t,x)=>t+(Number(x.price)||0),0);
    // 15.4.70 — le matériel vendu entre dans le TTC cumulé : chaque ligne de pièce dont le prix
    // de vente HT est renseigné ajoute quantité × prix × (1 + TVA). Les lignes sans prix de
    // vente restent des coûts internes et ne changent pas le total client.
    const partsSaleTtc=()=>lines.reduce((t,l)=>{const sale=Number(l.unitPrice);return t+(Number.isFinite(sale)&&sale>0?(Number(l.quantity)||0)*sale*(1+Number(document.querySelector('#vat')?.value||0)/100):0)},0);
    // Main-d’œuvre facturée : HT saisi × (1 + TVA). Elle fait partie du TTC client.
    const labourTtc=()=>Math.round((Number(document.querySelector('#laborSellingHt')?.value||0)*(1+Number(document.querySelector('#vat')?.value||0)/100))*100)/100;
    const applyTargetTtc=()=>{if(baseTtcMain==null)return;const el=document.querySelector('#targetTtc');if(el)el.value=(baseTtcMain+extrasTotal()+partsSaleTtc()+labourTtc()).toFixed(2);lastLabourTtc=labourTtc()};
    if(q){
      const snap=q?.calculation_snapshot?.result||{};
      const listPrice=Number(snap.listPriceTtc||0);
      // Brouillon local : son total_ttc est déjà base + prestations (jamais les km) ;
      // document enregistré : savedBaseTtc déduit les km facturés au client le cas échéant.
      const isDraft=!editing&&q===S.quoteDraft;
      const rb=isDraft?Number(q.total_ttc||0):savedBaseTtc(q);
      const ttcInput=document.querySelector('#targetTtc');
      const baseFrom=total=>Math.max(0,Number(total)-extrasTotal()-partsSaleTtc());
      if(listPrice>0){baseTtcMain=baseFrom(listPrice);discountTtc=r2(Number(snap.discountTtc||0));if(ttcInput)ttcInput.value=listPrice.toFixed(2)}
      else if(rb!==''&&Number(rb)>0){baseTtcMain=baseFrom(rb);discountTtc=r2(Number(q.discountTtc||0));if(ttcInput)ttcInput.value=(baseTtcMain+extrasTotal()+partsSaleTtc()).toFixed(2)}
      else baseTtcMain=null;
    }else{baseTtcMain=null;discountTtc=0}
    // Le TTC enregistré contient déjà la main-d’œuvre : on mémorise sa part pour que la
    // prochaine modification du champ n'ajoute que l'écart, jamais le montant complet.
    lastLabourTtc=q?Math.round((Number(q.labor_selling_ht||0)*(1+vatReload/100))*100)/100:0;
  if(q&&!lines.length&&q.product)lines=[{label:q.product,quantity:1,unitCost:Number(q.part_cost)||0,unitPrice:'',partId:null}];
  if(!lines.length&&!serviceExtras.length)lines=[blank()];

  const selectedClient=()=>S.clients.find(x=>x.id===$('#qclient').value);
  const interventionAddress=async()=>{const c=selectedClient();return c?.intervention_address||''};
  const loadInterventionAddresses=async()=>{const select=$('#interventionAddressId');if(!select)return;const c=selectedClient(),previous=select.value||q?.intervention_address_id||S.quoteDraft?.intervention_address_id||'';if(!c){select.innerHTML='<option value="">Aucun client sélectionné</option>';return}select.innerHTML='<option value="">Chargement…</option>';try{const result=await api.interventionAddresses(c.id),rows=result.addresses||[];select.innerHTML='<option value="">Aucune adresse d’intervention</option>'+rows.map(a=>`<option value="${e(a.id||'')}" ${String(a.id||'')===String(previous)?'selected':''}>${e(a.label||'Adresse')}${a.isDefault?' · Par défaut':''} — ${e(a.address)}</option>`).join('');if(previous&&!rows.some(a=>String(a.id)===String(previous))&&q?.client_id===c.id&&q?.intervention_address_snapshot){select.insertAdjacentHTML('beforeend',`<option value="${e(previous)}" selected>Adresse historique utilisée sur ce document</option>`)}else if(!previous){const d=rows.find(a=>a.isDefault)||rows[0];if(d)select.value=String(d.id||'')}if(!select.value&&rows.length){const d=rows.find(a=>a.isDefault)||rows[0];if(d)select.value=String(d.id||'')}}catch(x){select.innerHTML='<option value="">Adresses indisponibles — la saisie manuelle reste possible</option>';}};
  const refreshBillingAddress=async(preserveSnapshot=false)=>{const source=$('#invoiceAddressSource').value;if(source==='free')return;if(preserveSnapshot&&q?.billing_address_snapshot){$('#billingAddress').value=q.billing_address_snapshot;return}const c=selectedClient();if(!c){$('#billingAddress').value='';return}
  // Bloc 6 — une correction manuelle n'est jamais écrasée : le champ porte data-autofilled
  // tant que sa valeur vient d'un remplissage automatique ; la saisie utilisateur le retire.
  const field=$('#billingAddress');const manual=field.dataset.autofilled!=='1'&&field.value.trim()!=='';
  if(manual)return;
  if(source==='client'){field.value=c.address||'';field.dataset.autofilled='1';return}
  field.value=await interventionAddress();field.dataset.autofilled='1'};
  const updateClientSummary=()=>{const box=$('#qclient-summary');if(!box)return;const c=selectedClient();if(!c){box.hidden=true;box.innerHTML='';return}box.hidden=false;box.innerHTML=`<small><b>${e(c.name)}</b>${c.email?` · ${e(c.email)}`:''}${c.phone?` · ${e(c.phone)}`:''}${c.siret?` · SIRET ${e(c.siret)}`:''}${(!c.email&&!c.phone&&!c.siret)?' · Aucune coordonnée supplémentaire renseignée sur la fiche':''}</small>`};
  const inputs=()=>({partCost:lines.reduce((t,l)=>t+(Number(l.quantity)||0)*(Number(l.unitCost)||0),0),partQuantity:Math.max(1,lines.reduce((t,l)=>t+(Number(l.quantity)||0),0)),shippingCost:num('#shipping'),mileageKm:num('#mileageKm'),mileageRate:r2(num('#mileageClientRate')),mileageInternalRate:r2(num('#mileageInternalRate')),mileageClientRate:r2(num('#mileageClientRate')),mileageMode:$('#mileageMode').value,laborSellingHt:$('#laborSellingHt').value===''?undefined:r2(num('#laborSellingHt')),laborInternalCostHt:r2(num('#laborInternalCostHt')),vatRate:num('#vat'),urssafRate:Number(active()?.urssaf_rate||0),contributions:Array.from(document.querySelectorAll('.contrib-rate')).map(x=>({name:x.dataset.name,rate:Number(x.value||0),basis:x.dataset.basis,mandatory:x.dataset.mandatory!=='false'})),coefficientBasis:$('#coefficientBasis').value,coefficientUnit:$('#coefficientUnit').value,coefficientValue:num('#coefficientValue'),targetTtc:num('#targetTtc'),targetNet:num('#minimumProfit'),discountTtc:r2(discountTtc),driver,targetIncludesMileage:true});
  const mileageModeForCatalog=()=>$('#mileageMode')?.value==='client_price'?'client_price':'margin';
  const syncCatalogTarget=()=>{
    if(!catalogPricing)return;
    const iv=S.interventions.find(x=>x.name.trim().toLowerCase()===$('#intervention').value.trim().toLowerCase());
    const service=Number(iv?.default_price||0);
    // 15.4.67 — la base catalogue pilote la prestation principale ; le champ affiche base +
    // prestations complémentaires (cumul temps réel).
    if(service>0){baseTtcMain=service;driver='ttc';applyTargetTtc();}
  };
  // Bloc 8 — ventilation du CA par catégorie d'activité (calculateur, activité mixte).
  // Chaque ligne est comptée une seule fois : catégorie de la ligne, sinon catégorie du
  // document, sinon « à affecter » (jamais de doublon, impôt et cotisations distincts).
  const categoryBreakdownHtml=()=>{
    const docCat=$('#activityCategory')?.value||null;
    const rows=new Map();let unassigned=0;
    for(const l of lines){
      if(!String(l.label||'').trim())continue;
      const amount=(Number(l.quantity)||0)*(l.unitPrice===''||l.unitPrice==null?Number(l.unitCost||0):Number(l.unitPrice));
      if(!(amount>0))continue;
      const cat=l.activityCategory||docCat||'unassigned';
      rows.set(cat,(rows.get(cat)||0)+amount);
    }
    if(!rows.size)return '';
    const labelOf=cat=>cat==='unassigned'?'À affecter':(microRef.rates.find(r=>r.category===cat)?.label||FALLBACK_CATEGORIES.find(([c])=>c===cat)?.[1]||cat);
    let html='<h3 class="calc-sub">Ventilation par catégorie (URSSAF · référentiel daté'+(microRef.version?` · ${e(microRef.version)}`:'')+')</h3>';
    let totalSocial=0,totalTax=0,totalCa=0;
    for(const [cat,ca] of rows){
      const rate=rateOf(cat);totalCa+=ca;
      const social=rate?ca*(rate.socialRate+rate.cfpRate)/100:0;
      const tax=rate&&rate.taxRate?ca*rate.taxRate/100:0;
      totalSocial+=social;totalTax+=tax;
      html+=`<div class="calc-line"><span>${e(labelOf(cat))} · CA ${money(ca)}${rate?` · cotisations ${rate.socialRate+rate.cfpRate} %`:' · taux à confirmer'}</span><b>${money(social)}${rate&&rate.taxRate?` + VL ${money(tax)}`:''}</b></div>`;
    }
    html+=`<div class="calc-line"><span>Cotisations estimées par catégories</span><b>${money(totalSocial)}</b></div>`;
    if(totalTax>0)html+=`<div class="calc-line"><span>Versement libératoire estimé (impôt)</span><b>${money(totalTax)}</b></div>`;
    if(rows.has('unassigned'))html+='<div class="calc-line"><span>CA non affecté : renseignez la catégorie</span><b>'+money(rows.get('unassigned'))+'</b></div>';
    return html;
  };
  const recalc=()=>{
    let r;try{r=computePricing(inputs())}catch(x){$('#calc').innerHTML=`<p class="error">${e(x.message)}</p>`;return null}
    if(driver==='ttc'){$('#minimumProfit').value=r.netMargin.toFixed(2);baseTtcMain=Math.max(0,num('#targetTtc')-extrasTotal()-partsSaleTtc())}else {$('#targetTtc').value=(r.baseTtc+extrasTotal()+partsSaleTtc()).toFixed(2);baseTtcMain=r.baseTtc}
    const mileageRateEl=$('#mileageMode')?.value==='client_price'?$('#mileageClientRate'):$('#mileageInternalRate');const mt=Number($('#mileageKm')?.value||0)*Number(mileageRateEl?.value||0);if($('#mileageTotal')){const kmKnown=String($('#mileageKm')?.value??'').trim()!=='',rateKnown=String(mileageRateEl?.value??'').trim()!=='';
      // Aucune donnée saisie ⇒ placeholder explicite, jamais un faux « 0,00 € ».
      $('#mileageTotal').textContent=kmKnown&&rateKnown?money(mt):'à renseigner';}
    // 15.4.67 — le moteur reçoit le TOTAL facturé au client (prestations cumulées) moins la
    // remise : r.totalTtc / r.totalHt englobent déjà tout — HT = TTC ÷ (1 + TVA), règle du
    // classeur de référence, aucun arrondi intermédiaire (arithmétique exacte BigInt côté
    // moteur, présentation à deux décimales).
    const extras=extrasTotal();const partsSale=partsSaleTtc();const totalTtcAll=r.totalTtc;const totalHtAll=r.totalHt;
    $('#calc').classList.toggle('quote-loss',!!r.loss);$('#calc').classList.toggle('quote-profit',!r.loss);$('#calc').innerHTML=`<div class="calc-total"><span>Total TTC ${[extras>0?'prestations':null,partsSale>0?'matériel':null,'frais km'].filter(Boolean).join(' + ')}</span><strong>${money(totalTtcAll)}</strong></div>
      ${extras>0?`<div class="calc-line"><span>Prestations complémentaires (TTC)</span><b>${money(extras)}</b></div>`:''}
      ${Number($('#laborSellingHt')?.value||0)>0?`<div class="calc-line"><span>dont main-d’œuvre facturée (TTC)</span><b>${money(Number($('#laborSellingHt').value)*(1+num('#vat')/100))}</b></div>`:''}
      ${partsSale>0?`<div class="calc-line"><span>Matériel vendu (TTC)</span><b>${money(partsSale)}</b></div>`:''}
      ${discountTtc>0?`<div class="calc-line calc-discount"><span>Remise appliquée sur le TTC</span><b>−${money(discountTtc)}</b></div>`:''}
      ${r.loss?'<div class="alert-loss">⚠ Vente à perte : le prix ne couvre pas les coûts directs.</div>':(r.belowMinimumPrice?'<div class="alert-loss">⚠ Le prix est inférieur au minimum calculé avec le coefficient.</div>':'')}
      <div class="calc-net ${r.loss?'neg':''}"><span>Résultat net</span><strong>${money(r.netResult)}</strong><small>${r.netResultRate.toLocaleString('fr-FR')} % du HT</small></div>
      <h3 class="calc-sub">Détail interne</h3>
      <div class="calc-line"><span>Achats HT</span><b>${money(r.purchaseHt)}</b></div><div class="calc-line"><span>Coefficient pièces HT</span><b>${money(r.coefficientMarkupHt)}</b></div><div class="calc-line"><span>Livraison HT</span><b>${money(r.shippingHt)}</b></div><div class="calc-line"><span>Minimum HT avec coefficient</span><b>${money(r.minimumSellingHt)}</b></div><div class="calc-line"><span>Marge brute HT</span><b>${money(r.grossMargin)}</b></div>
      ${r.mileageTotal>0?`<div class="calc-line"><span>Frais kilométriques ${r.mileageMode==='client_price'?'facturés en plus':'absorbés par la marge'}</span><b>${money(r.mileageTotal)}</b></div>`:''}
      <div class="calc-line"><span>Main-d’œuvre vendue HT</span><b>${money(r.laborSellingHt)}</b></div><div class="calc-line"><span>Cotisations</span><b>${money(r.contributionsTotal)}</b></div>
      <div class="calc-line"><span>Total HT</span><b>${money(totalHtAll)}</b></div>
      <div class="calc-line"><span>TVA</span><b>${money(totalTtcAll-totalHtAll)}</b></div>${categoryBreakdownHtml()}`;
    return r;
  };
  const persistDraft=()=>{
    if(editing)return;
    const basis='purchase',unit=$('#coefficientUnit')?.value||'percent',value=num('#coefficientValue');
    // 15.4.67 — le champ #targetTtc porte déjà le TOTAL (prestations cumulées) : la remise est
    // tracée à part dans le brouillon et restaurée à la reprise.
    S.quoteDraft={documentType:S.documentType,mileage_mode:$('#mileageMode')?.value||'margin',client_id:$('#qclient').value||null,intervention_address_id:$('#interventionAddressId')?.value||null,intervention:$('#intervention').value.trim(),shipping_cost:r2(num('#shipping')),mileage_km:num('#mileageKm'),mileage_rate:r2(num('#mileageClientRate')),mileage_internal_rate:r2(num('#mileageInternalRate')),mileage_client_rate:r2(num('#mileageClientRate')),mileage_total:Math.round(num('#mileageKm')*(($('#mileageMode').value==='client_price'?num('#mileageClientRate'):num('#mileageInternalRate')))*100)/100,margin_coefficient_percent:unit==='percent'?value:0,coefficient_basis:basis,coefficientUnit:unit,coefficientValue:value,invoice_address_source:$('#invoiceAddressSource')?.value||'client',billing_address_snapshot:$('#billingAddress')?.value||'',part_coefficient_percent:basis==='purchase'&&unit==='percent'?value:0,labor_coefficient_percent:basis==='margin'&&unit==='percent'?value:0,catalogPricing:catalogPricing,discountTtc:r2(discountTtc),total_ttc:r2(num('#targetTtc')),final_price_ttc:r2(num('#targetTtc')),targetNet:r2(num('#minimumProfit')),driver,labor_selling_ht:r2(num('#laborSellingHt')),labor_internal_cost_ht:r2(num('#laborInternalCostHt')),vat_rate:num('#vat'),urssaf_rate:num('#urssaf'),purchase_vat_mode:$('#purchaseVatMode')?.value||'auto',purchase_vat_rate:$('#purchaseVatRate')?.value||null,contribution_snapshot:Array.from(document.querySelectorAll('.contrib-rate')).map(x=>({name:x.dataset.name,rate:Number(x.value||0),basis:x.dataset.basis,mandatory:x.dataset.mandatory!=='false'})),serial_number:$('#deviceSerialNumber')?$('#deviceSerialNumber').value.trim():q?.serial_number||'',imei:$('#deviceImei')?$('#deviceImei').value.trim():q?.imei||'',warranty_text:$('#warrantyText').value.trim(),items:[...lines.map(l=>({label:l.label,quantity:Number(l.quantity)||1,unitCost:Number(l.unitCost)||0,unitPrice:l.unitPrice===''||l.unitPrice==null?null:Number(l.unitPrice),partId:l.partId,saleCoefficientPercent:l.saleCoefficientPercent==null?null:Number(l.saleCoefficientPercent),activityCategory:l.activityCategory||null})),...serviceExtras.filter(x=>String(x.label||'').trim()).map(x=>({label:String(x.label).trim(),quantity:1,unitCost:0,unitPrice:Number(((Number(x.price)||0)/(1+num('#vat')/100)).toFixed(2)),partId:null,saleCoefficientPercent:null,activityCategory:$('#activityCategory')?($('#activityCategory').value||null):null,kind:'service'}))]};
    const seq=++draftSequence;
    clearTimeout(draftTimer);
    const status=$('#draft-sync-status');
    if(status)status.textContent='Synchronisation du brouillon…';
    const snapshot=JSON.parse(JSON.stringify(S.quoteDraft));
    draftTimer=setTimeout(async()=>{
      try{
        await api.saveDraft(snapshot);
        if(seq===draftSequence&&document.querySelector('#quote-form')){const label=$('#draft-sync-status');if(label)label.textContent='Brouillon synchronisé à votre compte — reprenez-le sur votre téléphone ou votre ordinateur.';}
      }catch{
        if(seq===draftSequence&&document.querySelector('#quote-form')){const label=$('#draft-sync-status');if(label)label.textContent='Brouillon non synchronisé : gardez cette page ouverte et vérifiez votre connexion avant de la quitter.';}
        window.addEventListener('online',()=>{if(seq===draftSequence)persistDraft()},{once:true});
      }
    },650);
  };

  const draw=()=>{
    $('#lines').innerHTML=lines.map((l,i)=>`<div class="line-row" data-i="${i}"><input class="ln-label" placeholder="${e(prof().calc?.itemPlaceholder||'Désignation')}" value="${e(l.label)}"><input class="ln-qty" type="number" min="0.01" step="any" value="${l.quantity??''}"><input class="ln-cost" type="number" min="0" step="0.01" value="${l.unitCost??''}"><input class="ln-sale" type="number" min="0" step="0.01" value="${l.unitPrice??''}"><select class="ln-cat" aria-label="Type de prestation de la ligne"><option value="">Votre choix</option>${catOptions(l.activityCategory||'')}</select><button type="button" class="btn danger small ln-del">Retirer</button></div>`).join('');
  };
  let learnedParts=[];
  let detectedService=null;
  // 15.4.63 — prestations complémentaires : ajout et retrait libres ; le total s'ajoute au TTC
  // du document et figure sur le PDF comme ligne « service » (déclaration plus haut : TDZ corrigé).
  // Les redraws périodiques (détection de prestation, 350 ms après la saisie) préservent
  // toujours les valeurs tapées non encore validées.
  const syncLinesFromDom=()=>{document.querySelectorAll('.line-row').forEach(row=>{const l=lines[Number(row.dataset.i)];if(!l)return;const g=s=>row.querySelector(s)?.value;const label=g('.ln-label');if(label!=null)l.label=label;const qty=g('.ln-qty');if(qty!=null)l.quantity=qty;const cost=g('.ln-cost');if(cost!=null)l.unitCost=cost;const sale=g('.ln-sale');if(sale!=null)l.unitPrice=sale;const cat=g('.ln-cat');if(cat!=null)l.activityCategory=cat||null})};
  // 15.4.62 — toutes les pièces du catalogue sont proposées : les pièces pertinentes pour la
  // prestation détectée d'abord, puis TOUTES les autres — on peut choisir n'importe quelle
  // pièce, pas seulement celle configurée pour la prestation.
  const partItems=()=>{const ranked=rankRelevantParts(detectedService,S.parts,learnedParts);const rest=S.parts.filter(x=>!ranked.includes(x));const list=[...ranked,...rest];return list.map(x=>({value:x.name,hint:`Achat ${money(cheapest(x))} HT · Vente ${money(Number(x.selling_price||0))} HT`,partId:x.id}))};
  const drawExtras=()=>{
    const box=document.querySelector('#service-extras');if(!box)return;
    // 15.4.70 — chaque prestation ajoutée reprend la présentation de l'encart de la première
    // prestation (champ libellé pleine largeur + champ prix TTC), au lieu d'une ligne compacte.
    box.innerHTML=serviceExtras.map((x,i)=>`<div class="service-extra-card" data-xi="${i}"><label class="field"><span>Prestation complémentaire</span><input class="sx-label" placeholder="Prestation complémentaire (ex. réparation supplémentaire)" value="${e(x.label)}"></label><label class="field"><span>Prix TTC</span><input class="sx-price" type="number" min="0" step="0.01" placeholder="Prix TTC" value="${x.price??''}"></label><button type="button" class="btn danger small sx-del">Retirer</button></div>`).join('')||'<p class="help">Aucune prestation complémentaire — ajoutez-en une si la réparation le nécessite.</p>';
    box.querySelectorAll('.service-extra-card').forEach(row=>{
      const xi=Number(row.dataset.xi);
      row.querySelector('.sx-label').addEventListener('input',ev=>{serviceExtras[xi].label=ev.target.value;persistDraft()});
      row.querySelector('.sx-price').addEventListener('input',ev=>{serviceExtras[xi].price=ev.target.value;applyTargetTtc();recalc();persistDraft()});
      row.querySelector('.sx-del').addEventListener('click',()=>{serviceExtras.splice(xi,1);drawExtras();applyTargetTtc();recalc();persistDraft()});
      attachSuggest(row.querySelector('.sx-label'),()=>S.interventions.map(iv=>({value:iv.name,hint:Number(iv.default_price)?money(iv.default_price)+' TTC':''})),{title:'Suggestions · prestations',onPick:item=>{const iv2=S.interventions.find(z=>z.name===item.value);serviceExtras[xi].label=item.value;if(iv2&&Number(iv2.default_price)>0&&!Number(serviceExtras[xi].price))serviceExtras[xi].price=Number(iv2.default_price);drawExtras();applyTargetTtc();recalc();persistDraft()}});
    });
  };
  const addServiceExtra=()=>{serviceExtras.push({label:'',price:''});drawExtras();applyTargetTtc();const rows=document.querySelectorAll('#service-extras .service-extra-card');rows[rows.length-1]?.querySelector('.sx-label')?.focus()};
  const suggestLines=()=>document.querySelectorAll('.ln-label').forEach(i=>attachSuggest(i,partItems,{title:`Suggestions · ${prof().itemLabel||'catalogue'}`,onPick:item=>{const row=i.closest('.line-row');if(!row)return;const l=lines[Number(row.dataset.i)];const part=S.parts.find(x=>x.id===item.partId)||S.parts.find(x=>x.name.toLowerCase()===String(item.value).trim().toLowerCase());if(!l||!part)return;l.label=part.name;l.partId=part.id;l.unitCost=cheapest(part);l.unitPrice=Number(part.selling_price||0)>0?Number(part.selling_price):'';l.saleCoefficientPercent=null;catalogPricing=true;row.querySelector('.ln-cost').value=String(l.unitCost);row.querySelector('.ln-sale').value=l.unitPrice===''?'':Number(l.unitPrice).toFixed(2);syncCatalogTarget();applyTargetTtc();recalc();persistDraft();}}));
  attachSuggest($('#intervention'),()=>S.interventions.map(i=>({value:i.name,hint:Number(i.default_price)?money(i.default_price)+' TTC':(i.default_duration_minutes?i.default_duration_minutes+' min':'')})),{title:`Suggestions · ${prof().serviceLabel||'prestations'}`});
  const warrantyScopeLabel=g=>g.scope_type==='parts'?'Pièces uniquement':g.scope_type==='labor'?'Main-d’œuvre uniquement':g.scope_type==='both'?'Pièces et main-d’œuvre':'';
  attachSuggest($('#warrantyText'),()=>[...S.policies.map(g=>({value:g.name,scopeType:g.scope_type,hint:warrantyScopeLabel(g)})),...(prof().warranty||[]).map(v=>({value:v}))],{title:'Suggestions · garanties',onPick:item=>{const scope=warrantyScopeLabel(item);if(scope&&!/pi[eè]ces?|main.?d.?oeuvre/i.test(item.value))$('#warrantyText').value=`${item.value} · ${scope}`;}});
  const drawAll=()=>{syncLinesFromDom();draw();suggestLines()};
  const refreshServiceDetection=async()=>{detectedService=detectService($('#intervention').value,S.interventions);suggestLines();if(!detectedService)return;const label=document.querySelector('#service-detected');if(label)label.textContent=`Prestation détectée : ${detectedService.name}`;try{const r=await api.priceSuggestions({service:detectedService.name,parts:S.parts.map(x=>({id:x.id,name:x.name,model:x.model,variant:x.variant,color:x.color,quality:x.quality,reference:x.reference}))});learnedParts=r.recommendedPartSignatures||[];const iv=S.interventions.find(i=>i.name.trim().toLowerCase()===detectedService.name.trim().toLowerCase());if(r.servicePrice!=null&&!Number(iv?.default_price||0)&&!num('#targetTtc')){baseTtcMain=Number(r.servicePrice);applyTargetTtc();driver='ttc';recalc();persistDraft()}}catch{}};
  drawAll();
  const updateLine=ev=>{
    const row=ev.target.closest('.line-row');if(!row)return;const l=lines[Number(row.dataset.i)];
    if(ev.target.classList.contains('ln-label')){
      l.label=ev.target.value;
      const part=S.parts.find(x=>x.name.toLowerCase()===l.label.trim().toLowerCase());
      if(part){const changedPart=l.partId!==part.id;l.partId=part.id;l.saleCoefficientPercent=null;catalogPricing=true;if(changedPart||l.unitCost===''||l.unitCost==null){l.unitCost=cheapest(part);row.querySelector('.ln-cost').value=String(l.unitCost)}if(changedPart||l.unitPrice===''||l.unitPrice==null){const sale=Number(part.selling_price||0);l.unitPrice=sale>0?sale:'';row.querySelector('.ln-sale').value=l.unitPrice===''?'':sale.toFixed(2)}
        // Une pièce du catalogue est un bien : sa nature (vente BIC) pilote la cotisation de la ligne.
        if(!l.activityCategory||l.categoryAuto){l.activityCategory='vente_bic';l.categoryAuto=true;const sel=row.querySelector('.ln-cat');if(sel)sel.value='vente_bic'}
      }else {l.partId=null;l.saleCoefficientPercent=null;
        // Ligne de prestation : la catégorie de service redevient celle du document/activité.
        if(l.categoryAuto){l.activityCategory=null;l.categoryAuto=false;const sel=row.querySelector('.ln-cat');if(sel)sel.value=''}
      }
    }
    if(ev.target.classList.contains('ln-qty'))l.quantity=ev.target.value;
    if(ev.target.classList.contains('ln-cost'))l.unitCost=ev.target.value;
    if(ev.target.classList.contains('ln-sale'))l.unitPrice=ev.target.value;
    if(ev.target.classList.contains('ln-cat')){l.activityCategory=ev.target.value||null;l.categoryAuto=false}
    syncCatalogTarget();applyTargetTtc();recalc();persistDraft();
  };
  $('#lines').addEventListener('input',updateLine);$('#lines').addEventListener('change',updateLine);
  $('#lines').addEventListener('click',ev=>{
    if(!ev.target.classList.contains('ln-del'))return;
    const idx=Number(ev.target.closest('.line-row').dataset.i);
    
    lines.splice(idx,1);if(!lines.length)lines=[blank()];drawAll();recalc();persistDraft();
  });
  $('#add-line').onclick=()=>{lines.push(blank());drawAll();syncCatalogTarget();applyTargetTtc();recalc();persistDraft();$('#lines').lastElementChild?.querySelector('input')?.focus()};
  // 15.4.63 — prestations complémentaires : ajout/retrait manuel, intégrés aux calculs et au document.
  const addServiceBtn=document.querySelector('#add-service');if(addServiceBtn)addServiceBtn.onclick=addServiceExtra;
  drawExtras();
  // 15.4.67 — remise TTC : configurée en € ou en %, appliquée via le bouton dédié ; elle ne
  // touche QUE le TTC facturé au client (le moteur la déduit du TTC cible avant calcul) — le
  // CA TTC et les cotisations s'ajustent, HT et TVA sont recalculés par la règle du classeur
  // (HT = TTC ÷ (1 + taux)), sans aucun arrondi intermédiaire.
  const syncDiscountUi=()=>{
    const status=document.querySelector('#discount-status'),clear=document.querySelector('#clear-discount');
    if(status)status.textContent=discountTtc>0?`Remise appliquée : −${money(discountTtc)} sur le TTC facturé au client. Le CA TTC et les cotisations s’ajustent ; HT et TVA recalculés.`:'La remise s’applique uniquement au TTC facturé au client : le CA TTC et les cotisations s’ajustent, HT et TVA recalculés (HT = TTC ÷ (1 + taux)).';
    if(clear)clear.hidden=discountTtc<=0;
  };
  const applyDiscount=()=>{
    const raw=String(document.querySelector('#discountValue')?.value??'').replace(',','.').trim();
    if(!raw)return toast('Indiquez un montant (€) ou un pourcentage (%) de remise.','error');
    const val=Number(raw);
    if(!Number.isFinite(val)||val<0)return toast('Remise invalide : indiquez une valeur positive.','error');
    const total=Number(document.querySelector('#targetTtc')?.value||0);
    if(!(total>0))return toast('Définissez d’abord le prix TTC facturé au client.','error');
    const unit=document.querySelector('#discountUnit')?.value||'eur';
    const disc=unit==='pct'?r2(total*val/100):r2(val);
    if(disc<=0)return toast('La remise doit être supérieure à 0.','error');
    if(disc>=total)return toast(`La remise (${money(disc)}) ne peut pas atteindre ou dépasser le TTC facturé au client (${money(total)}).`,'error');
    discountTtc=disc;driver='ttc';syncDiscountUi();recalc();persistDraft();
    toast(`Remise appliquée : −${money(disc)} sur le TTC facturé au client.`,'success');
  };
  document.querySelector('#apply-discount')?.addEventListener('click',applyDiscount);
  document.querySelector('#clear-discount')?.addEventListener('click',()=>{discountTtc=0;const v=document.querySelector('#discountValue');if(v)v.value='';syncDiscountUi();recalc();persistDraft();toast('Remise retirée.','success')});
  syncDiscountUi();
  $('#deviceSerialNumber')?.addEventListener('input',persistDraft);$('#deviceImei')?.addEventListener('input',persistDraft);$('#targetTtc').addEventListener('input',()=>{catalogPricing=false;driver='ttc';baseTtcMain=Math.max(0,num('#targetTtc')-extrasTotal()-partsSaleTtc());recalc();persistDraft()});$('#laborSellingHt').addEventListener('input',()=>{const next=Math.round((Number($('#laborSellingHt').value||0)*(1+num('#vat')/100))*100)/100;const target=num('#targetTtc');if(target>0){const adjusted=Math.max(0,target+next-lastLabourTtc);$('#targetTtc').value=adjusted.toFixed(2)}else{const base=lines.reduce((t,l)=>t+(Number(l.quantity)||0)*(Number(l.unitPrice)||0)*(1+num('#vat')/100),0);$('#targetTtc').value=(base+serviceExtras.reduce((t,x)=>t+(Number(x.price)||0),0)+next).toFixed(2)}lastLabourTtc=next;if($('#laborSellingHt').value!==''){catalogPricing=false;driver='ttc';}recalc();persistDraft()});$('#laborInternalCostHt').addEventListener('input',()=>{recalc();persistDraft()});
  ['#shipping','#mileageKm','#mileageInternalRate','#mileageClientRate','#mileageMode','#laborSellingHt','#vat','#urssaf','#purchaseVatMode','#purchaseVatRate','#coefficientValue','#qclient','#warrantyText','#billingAddress'].forEach(s=>{const el=$(s);if(!el)return;const update=()=>{if(s!=='#qclient'&&s!=='#warrantyText')syncCatalogTarget();recalc();persistDraft()};el.addEventListener('input',update);if(el.tagName==='SELECT')el.addEventListener('change',update)});
  $('#minimumProfit')?.addEventListener('input',()=>{driver='net';if(discountTtc>0){discountTtc=0;syncDiscountUi();toast('Remise retirée : le calcul inverse (bénéfice minimum) ne combine pas de remise TTC.','info')}recalc();persistDraft()});
  $('#billingAddress')?.addEventListener('input',()=>{const field=$('#billingAddress');if(field)delete field.dataset.autofilled});
  ['#qclient','#coefficientUnit'].forEach(s=>$(s)?.addEventListener('change',async()=>{if(s==='#qclient'){await loadInterventionAddresses();await refreshBillingAddress();updateClientSummary()}else if(s==='#coefficientUnit'){const a=active()||{};const configured=Number(a.default_part_coefficient_percent??0);if($('#coefficientUnit').value==='percent')$('#coefficientValue').value=String(configured)}syncCatalogTarget();recalc();persistDraft()}));
  document.querySelectorAll('.contrib-rate').forEach(x=>x.addEventListener('input',()=>{recalc();persistDraft()}));
  $('#activityCategory')?.addEventListener('change',()=>{recalc();persistDraft()});
  // Bloc 11 — saisie directe d'un client sans fiche préexistante.
  // Client existant : les coordonnées de la fiche remplissent automatiquement les champs du
  // document — aucune saisie à refaire ; la saisie directe reste réservée à un client sans fiche.
  const NC_FIELDS=['nc-name','nc-email','nc-phone','nc-siret','nc-address','nc-postal','nc-city'];
  const applyClientFields=()=>{const sec=$('#new-client-fields'),help=$('#nc-help');if(!sec)return;
    const isNew=$('#qclient').value==='__new__',c=selectedClient();
    if(isNew){sec.hidden=false;if(help)help.textContent='Création directe sans fiche préexistante : la fiche client sera créée avec le document dans la même opération (annulation = rien n’est créé). Avant validation, Aurion recherche les doublons et vous propose de réutiliser un client existant — jamais de fusion automatique.';
      NC_FIELDS.forEach(id=>{const el=document.getElementById(id);if(!el)return;el.disabled=false;if(el.dataset.autofilled==='1'){el.value='';delete el.dataset.autofilled}});
      return}
    if(!c){sec.hidden=true;return}
    sec.hidden=false;
    const map={'nc-name':c.name||'','nc-email':c.email||'','nc-phone':c.phone||'','nc-siret':c.siret||'','nc-address':c.address||'','nc-postal':'','nc-city':''};
    NC_FIELDS.forEach(id=>{const el=document.getElementById(id);if(!el)return;el.disabled=true;el.value=map[id]||'';el.dataset.autofilled='1'});
    if(help)help.textContent='Coordonnées remplies automatiquement depuis la fiche client — aucune saisie nécessaire. Ces champs ne servent qu’à créer un document pour un client qui n’existe pas encore.'};
  applyClientFields();
  $('#qclient')?.addEventListener('change',()=>{applyClientFields();persistDraft()});
  const readNewClient=()=>({name:$('#nc-name').value.trim(),email:$('#nc-email')?.value?.trim()||'',phone:$('#nc-phone')?.value?.trim()||'',address:$('#nc-address')?.value?.trim()||'',postalCode:$('#nc-postal')?.value?.trim()||'',city:$('#nc-city')?.value?.trim()||'',siret:$('#nc-siret')?.value?.replace(/\s/g,'')||''});
  $('#invoiceAddressSource').addEventListener('change',async()=>{await refreshBillingAddress();persistDraft()});
  $('#interventionAddressId')?.addEventListener('change',persistDraft);
  $('#billingAddress').addEventListener('input',persistDraft);
  await loadInterventionAddresses();
  await refreshBillingAddress(Boolean(q?.billing_address_snapshot));
  let detectionTimer=null;$('#intervention').addEventListener('input',()=>{detectedService=detectService($('#intervention').value,S.interventions);catalogPricing=Boolean(detectedService);const label=document.querySelector('#service-detected');if(label)label.textContent=detectedService?`Prestation détectée : ${detectedService.name}`:'';suggestLines();persistDraft();clearTimeout(detectionTimer);if(detectedService)detectionTimer=setTimeout(()=>refreshServiceDetection().catch(()=>{}),350);});
  $('#intervention').addEventListener('change',async()=>{
    catalogPricing=true;
    const iv=S.interventions.find(i=>i.name===$('#intervention').value);
    await refreshServiceDetection();
    if(iv&&Number(iv.default_price)&&!num('#targetTtc')){baseTtcMain=Number(iv.default_price);applyTargetTtc();driver='ttc';recalc()}
    if(!editing){syncCatalogTarget();if(!num('#targetTtc')){driver='net';recalc()}}
    if(!$('#warrantyText').value&&S.policies[0])$('#warrantyText').value=`Garantie ${S.policies[0].duration_months} mois`;
    // 15.4.63 — plus aucun ajout automatique de pièce : l'utilisateur choisit explicitement
    // ses pièces et prestations (les suggestions restent disponibles, jamais imposées).
    persistDraft();
  });
  if(!q&&S.policies[0])$('#warrantyText').value=`Garantie ${S.policies[0].duration_months} mois`;
  $('#cancel-edit')?.addEventListener('click',()=>{S.editing=null;hooks.show('invoices')});
  recalc();
  if(!editing)persistDraft();

  $('#quote-form').onsubmit=async ev=>{
    ev.preventDefault();clearTimeout(draftTimer);draftSequence++;
    const submitButton=ev.currentTarget?.querySelector('button[type=submit]');
    if(submitButton?.disabled)return;
    if(submitButton){submitButton.disabled=true;submitButton.dataset.originalLabel=submitButton.textContent||'';submitButton.textContent='Enregistrement…'}
    try{
      const r=recalc();if(!r)return;
      if(r.totalTtc<=0)throw new Error('Définissez un prix TTC pour le client.');
      let allowLoss=false;if(r.loss){if(!await askConfirm({title:'Vente à perte',message:'La marge de ce devis est négative : le prix ne couvre pas vos coûts et cotisations.\nL’enregistrer quand même ?',confirmLabel:'Enregistrer quand même',danger:true}))return;allowLoss=true;}
      // Bloc 11 — création directe : contrôle de doublons AVANT validation (proposition de
      // réutilisation, jamais de fusion automatique) ; la fiche est créée avec le document
      // dans la même transaction serveur (annulation = aucune création partielle).
      let submitClientId=$('#qclient').value, submitNewClient=null;
      if(submitClientId==='__new__'){
        const nc=readNewClient();
        if(!nc.name)throw new Error('Indiquez le nom du nouveau client.');
        let matches=[];
        try{matches=(await api.clientMatches(nc.name)).matches||[]}catch{}
        let reuse=false;
        if(matches.length){
          reuse=await askConfirm({title:'Client similaire existant',message:`« ${matches[0].name} » existe déjà dans vos clients. Réutiliser cette fiche pour ce document ? (Annuler = créer une nouvelle fiche avec les informations saisies.)`,confirmLabel:'Réutiliser cette fiche'});
          if(reuse)submitClientId=matches[0].id;
        }
        if(!reuse){submitClientId=null;submitNewClient=nc;}
      }
      // 15.4.63 — les prestations complémentaires sont enregistrées comme lignes « service » :
      // ajoutées/retirées manuellement, prix TTC converti en HT avec la TVA du document.
      // 15.4.67 — le champ #targetTtc porte le TOTAL cumulé : le serveur reçoit le TTC client
      // complet + la remise TTC (le moteur la déduit avant calcul, trace listPriceTtc).
      const items=[...lines.filter(l=>l.label.trim()).map(l=>({label:l.label.trim(),quantity:Number(l.quantity)||1,unitCost:Number(l.unitCost)||0,unitPrice:l.unitPrice===''||l.unitPrice==null?null:Number(l.unitPrice),partId:l.partId,saleCoefficientPercent:l.saleCoefficientPercent==null?null:Number(l.saleCoefficientPercent),activityCategory:l.activityCategory||null})),...serviceExtras.filter(x=>String(x.label||'').trim()).map(x=>({label:String(x.label).trim(),quantity:1,unitCost:0,unitPrice:Number(((Number(x.price)||0)/(1+Number($('#vat').value||0)/100)).toFixed(2)),partId:null,saleCoefficientPercent:null,activityCategory:$('#activityCategory')?($('#activityCategory').value||null):null,kind:'service'}))];
      const coefficientBasis=$('#coefficientBasis').value,coefficientUnit=$('#coefficientUnit').value,coefficientValue=num('#coefficientValue');const body={documentType,clientId:submitClientId||null,newClient:submitNewClient,interventionAddressId:submitNewClient?null:($('#interventionAddressId')?.value||null),catalogPricing,mileageKm:num('#mileageKm'),mileageRate:r2(num('#mileageClientRate')),mileageInternalRate:r2(num('#mileageInternalRate')),mileageClientRate:r2(num('#mileageClientRate')),coefficientBasis,coefficientUnit,coefficientValue,marginCoefficientPercent:coefficientUnit==='percent'?coefficientValue:0,partCoefficientPercent:coefficientBasis==='purchase'&&coefficientUnit==='percent'?coefficientValue:0,laborCoefficientPercent:coefficientBasis==='margin'&&coefficientUnit==='percent'?coefficientValue:0,intervention:$('#intervention').value.trim(),laborSellingHt:$('#laborSellingHt').value===''?undefined:r2(num('#laborSellingHt')),laborInternalCostHt:r2(num('#laborInternalCostHt')),purchaseVatMode:$('#purchaseVatMode')?.value||'auto',purchaseVatRate:$('#purchaseVatRate')?.value===''?null:num('#purchaseVatRate'),contributions:Array.from(document.querySelectorAll('.contrib-rate')).map(x=>({name:x.dataset.name,rate:Number(x.value||0),basis:x.dataset.basis,mandatory:x.dataset.mandatory!=='false'})),invoiceAddressSource:$('#invoiceAddressSource').value,billingAddress:$('#billingAddress').value.trim(),items,partCost:r2(lines.reduce((t,l)=>t+(Number(l.quantity)||0)*(Number(l.unitCost)||0),0)),partQuantity:Math.max(1,lines.reduce((t,l)=>t+(Number(l.quantity)||0),0)),shippingCost:r2(num('#shipping')),vatRate:num('#vat'),urssafRate:Number(active()?.urssaf_rate||0),reminderIntervalDays:orgBilling.reminder_interval_days!=null?Number(orgBilling.reminder_interval_days):undefined,latePenaltyMode:orgBilling.late_penalty_mode||undefined,latePenaltyValue:orgBilling.late_penalty_value!=null?Number(orgBilling.late_penalty_value):undefined,finalPriceTtc:r2(num('#targetTtc')),discountTtc:r2(discountTtc),mileageMode:$('#mileageMode').value,mileage_mode:$('#mileageMode').value,warrantyText:$('#warrantyText').value.trim(),serialNumber:$('#deviceSerialNumber')?$('#deviceSerialNumber').value.trim():undefined,imei:$('#deviceImei')?$('#deviceImei').value.trim():undefined,einvoiceOperationCategory:$('#einvoiceOperationCategory')?($('#einvoiceOperationCategory').value||null):undefined,einvoiceBuyerSiren:$('#einvoiceBuyerSiren')?$('#einvoiceBuyerSiren').value.trim():undefined,einvoiceVatOnPayment:$('#einvoiceVatOnPayment')?$('#einvoiceVatOnPayment').checked:undefined,einvoiceDeliveryAddress:$('#einvoiceDeliveryAddress')?($('#einvoiceDeliveryAddress').value.trim()||null):undefined,activityCategory:$('#activityCategory')?($('#activityCategory').value||null):undefined,allowLoss};
      // Validation de la création / modification par un dialogue Aurion (jamais alert() natif) :
      // le récapitulatif (client, HT, TVA, TTC) est confirmé avant l'enregistrement définitif.
      const clientLabel=submitNewClient?.name
        ?`${submitNewClient.name} (nouvelle fiche)`
        :(submitClientId&&S.clients.find(c=>c.id===submitClientId)?.name)||'client non nommé';
      const docLabel=body.documentType==='invoice'?'facture':'devis';
      if(!await askConfirm({title:`Valider ${editing?`les modifications de ce ${docLabel}`:`la création de ce ${docLabel}`} ?`,
        message:`Client : ${clientLabel}.
Total HT : ${money(r.totalHt)} · TVA : ${money(r.totalTtc-r.totalHt)} · Total TTC : ${money(r.totalTtc)}${discountTtc>0?` (dont remise : −${money(discountTtc)})`:''}.
${body.documentType==='invoice'?'La facture sera enregistrée comme émise et en attente de paiement.':'Le devis reste modifiable tant qu’il n’est pas converti en facture.'}`,
        confirmLabel:editing?'Valider les modifications':'Valider la création'}))return;
      if(editing){await api.updateQuote(q.id,body);S.editing=null}
      else {await api.createQuote({...body,sendEmail:false});S.quoteDraft=null}
      if(!editing){try{await api.deleteDraft()}catch{} }
      try{await api.recordQuotePattern({service:body.intervention,servicePrice:r.totalTtc,parts:items.map(x=>{const p=S.parts.find(z=>z.id===x.partId);return {name:x.label,model:p?.model,variant:p?.variant,color:p?.color,quality:p?.quality,reference:p?.reference,price:Number(x.unitCost||0)}})});}catch{}
      let refreshed=true;try{await hooks.refresh('invoices',{navigation:true})}catch{refreshed=false;hooks.show('invoices')}
      const noun=editing?'Modifications enregistrées.':(body.documentType==='invoice'?'Facture enregistrée.':'Devis enregistré. Vous pouvez maintenant choisir de l’envoyer ou de le modifier.');
      toast(refreshed?noun:`${noun} Actualisation de la liste impossible, mais l’enregistrement a été effectué.`,'success');
    }catch(x){toast(x.message,'error')}
    finally{if(submitButton&&document.body.contains(submitButton)){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.originalLabel||'Enregistrer'}}
  };
}
