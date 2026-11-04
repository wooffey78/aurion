import { api } from "../core/api.js";
import { toast, askConfirm, hooks } from "./dash/core.js";

const esc = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\"","&quot;").replaceAll("'","&#39;");
const entities = ["company", "client", "supplier", "product", "service", "quote", "invoice"];
const labels = { company:"Entreprise", client:"Client", supplier:"Fournisseur", product:"Produit / pièce", service:"Service / catalogue", quote:"Devis", invoice:"Facture" };

export async function renderDataImport(root) {
  if (!root) return;
  let preview = null, busy = false;
  root.innerHTML = `<div class="data-import">
    <label class="field" for="data-import-files"><span>Fichiers à analyser</span><input id="data-import-files" type="file" multiple accept=".csv,.tsv,.xlsx,.json,.xml,.zip,.sql,.pdf,.docx,.odt,.txt,.png,.jpg,.jpeg,.webp"><small class="help">CSV, TSV, XLSX, JSON, XML, ZIP, SQL (texte non exécuté), PDF, DOCX, ODT, TXT et images. Jusqu’à 30 fichiers et 80 Mo au total. Convertissez les anciens fichiers XLS en XLSX ou CSV.</small></label>
    <label class="check data-import-consent"><input id="data-import-ai-consent" type="checkbox"> J’autorise l’analyse des documents compatibles par le fournisseur IA distant configuré par Aurion. Sans cette autorisation, le préclassement reste local.</label>
    <div class="button-row"><button type="button" class="btn secondary" id="data-import-preview">Analyser les fichiers</button><button type="button" class="btn primary" id="data-import-commit" disabled>Importer les éléments sélectionnés</button></div>
    <p class="help" id="data-import-status" role="status" aria-live="polite">Aucune donnée n’a été importée. L’analyse ne modifie pas vos fiches.</p>
    <div id="data-import-results" class="data-import-results" aria-live="polite"></div>
  </div>`;
  const $ = selector => root.querySelector(selector);
  const setStatus = message => { const node=$("#data-import-status"); if(node) node.textContent=message; };
  const renderPreview = () => {
    const target=$("#data-import-results"),commit=$("#data-import-commit");
    if(!preview){target.innerHTML="";commit.disabled=true;return;}
    const records=Array.isArray(preview.records)?preview.records:[];
    setStatus(`${records.length} proposition(s) reconnue(s) dans ${preview.filesSeen||0} fichier(s). ${preview.aiApplied?"Analyse IA effectuée.":"Préclassement local."} ${preview.warning||""} ${(preview.warnings||[]).slice(0,6).join(" · ")}`);
    target.innerHTML=`<div class="data-import-summary"><strong>Prévisualisation — ${records.length} proposition(s)</strong><p>Contrôlez le type, les données et l’action de chaque fiche. Les doublons potentiels ne sont pas sélectionnés automatiquement.</p></div>${records.map(record=>{
      const entity=entities.includes(record.entity)?record.entity:"client";
      const defaultAction=entity==="company"?"update":(record.defaultAction||(record.duplicate?"skip":"create"));
      const actionOptions=entity==="company"?[["update","Actualiser la fiche entreprise"],["skip","Ignorer"]]:[["create","Créer une fiche"],["update","Mettre à jour une fiche"],["skip","Ignorer"]];
      const options=actionOptions.map(([value,label])=>`<option value="${value}" ${defaultAction===value?"selected":""}>${label}</option>`).join("");
      return `<article class="data-import-record" data-import-card="${esc(record.id)}">
        <header><label class="check"><input type="checkbox" data-import-include="${esc(record.id)}" ${record.duplicate?"":"checked"}><span>${esc(labels[entity])} · ${esc(record.sourceFile||"Import")} · confiance indicative ${Math.round(Math.max(0,Math.min(1,Number(record.confidence)||0))*100)} %</span></label></header>
        <p class="data-import-meta">${esc(record.reason||"Données à vérifier")}${record.duplicate?` · Correspondance possible : ${esc(record.duplicateLabel||"fiche existante")}`:""}</p>
        <div class="grid-2"><label class="field"><span>Type de fiche</span><select data-import-entity="${esc(record.id)}">${entities.map(value=>`<option value="${value}" ${entity===value?"selected":""}>${esc(labels[value])}</option>`).join("")}</select></label><label class="field"><span>Action</span><select data-import-action="${esc(record.id)}">${options}</select></label></div>
        <label class="field"><span>Données reconnues — JSON modifiable</span><textarea rows="7" spellcheck="false" data-import-data="${esc(record.id)}">${esc(JSON.stringify(record.data||{},null,2))}</textarea></label>
        <p class="help">L’import ne remplace jamais une vérification métier. Une mise à jour peut modifier une fiche existante : relisez chaque champ avant de confirmer.</p>
      </article>`;
    }).join("")||`<p class="empty">Aucune donnée métier reconnue. Essayez un export CSV, XLSX ou JSON, ou autorisez explicitement l’analyse IA.</p>`}`;
    commit.disabled=!records.length;
    target.querySelectorAll("[data-import-data]").forEach(area=>area.addEventListener("change",()=>{try{const value=JSON.parse(area.value);if(!value||Array.isArray(value)||typeof value!=="object")throw new Error("Objet attendu");area.classList.remove("is-invalid");}catch{area.classList.add("is-invalid");toast("Le JSON de cette fiche doit être corrigé avant l’import.","error");}}));
    target.querySelectorAll("[data-import-entity]").forEach(select=>select.addEventListener("change",()=>{const action=target.querySelector(`[data-import-action="${CSS.escape(select.dataset.importEntity)}"]`);if(action&&select.value==="company")action.value="update";}));
  };
  $("#data-import-preview").addEventListener("click",async()=>{
    const files=Array.from($("#data-import-files").files||[]);
    if(!files.length){toast("Sélectionnez un ou plusieurs exports à analyser.","info");return;}
    const size=files.reduce((sum,file)=>sum+file.size,0);
    if(files.length>30||size>80*1024*1024){toast("La limite est de 30 fichiers et 80 Mo au total.","error");return;}
    if(busy)return;busy=true;$("#data-import-preview").disabled=true;setStatus("Lecture locale et analyse des fichiers…");
    try{preview=await api.previewDataAbsorption(files,$("#data-import-ai-consent").checked);renderPreview();if(!preview.records?.length)toast("Aucune fiche exploitable n’a été reconnue. Aucun changement n’a été effectué.","info");else toast("Prévisualisation prête. Rien n’a encore été écrit.","success");}
    catch(error){preview=null;renderPreview();setStatus(error.message||"Analyse impossible.");toast(error.message||"Analyse impossible.","error");}
    finally{busy=false;$("#data-import-preview").disabled=false;}
  });
  $("#data-import-commit").addEventListener("click",async()=>{
    if(!preview?.records?.length||busy)return;
    const records=[];
    for(const item of preview.records){
      const include=$(`[data-import-include="${CSS.escape(item.id)}"]`);if(!include?.checked)continue;
      const dataField=$(`[data-import-data="${CSS.escape(item.id)}"]`);let data;
      try{data=JSON.parse(dataField?.value||"{}");if(!data||Array.isArray(data)||typeof data!=="object")throw new Error("Objet attendu");dataField.classList.remove("is-invalid");}
      catch{dataField?.classList.add("is-invalid");toast("Corrigez le JSON de chaque fiche sélectionnée.","error");dataField?.focus();return;}
      records.push({...item,entity:$(`[data-import-entity="${CSS.escape(item.id)}"]`)?.value||item.entity,action:$(`[data-import-action="${CSS.escape(item.id)}"]`)?.value||"skip",data});
    }
    const actionable=records.filter(record=>record.action!=="skip");
    if(!actionable.length){toast("Sélectionnez au moins une action de création ou de mise à jour.","info");return;}
    const confirmed=await askConfirm({title:"Confirmer l’import des données ?",message:`${actionable.length} élément(s) vont être créés ou mis à jour dans cette entreprise. Les mises à jour peuvent modifier des fiches existantes. Vérifiez vos choix avant de continuer.`,confirmLabel:"Importer les données"});
    if(!confirmed)return;
    busy=true;$("#data-import-commit").disabled=true;setStatus("Import des données confirmé en cours…");
    try{const outcome=await api.commitDataAbsorption(records);setStatus(`Import terminé : ${outcome.created||0} créé(s), ${outcome.updated||0} mis à jour, ${outcome.skipped||0} ignoré(s), ${outcome.failed||0} échec(s).`);
      const failed=new Set((outcome.results||[]).filter(item=>item.status==="failed").map(item=>item.id));
      if(failed.size){preview.records=preview.records.filter(item=>failed.has(item.id));renderPreview();}else{preview=null;renderPreview();}
      toast(`Import traité : ${outcome.created||0} création(s), ${outcome.updated||0} mise(s) à jour, ${outcome.failed||0} échec(s).`,outcome.failed?"info":"success");
      if(!outcome.failed)await hooks.refresh("settings");
    }catch(error){setStatus(error.message||"Import impossible.");toast(error.message||"Import impossible.","error");}
    finally{busy=false;if($("#data-import-commit"))$("#data-import-commit").disabled=!preview?.records?.length;}
  });
  renderPreview();
}