// File d'attente locale persistante (IndexedDB) et moteur de synchronisation vers le cloud personnel.
// - Le fichier est enregistré durablement sur l'appareil AVANT tout envoi ;
// - les transferts reprennent après reconnexion, fermeture ou redémarrage (au chargement, à « online », toutes les 60 s) ;
// - chaque élément porte un identifiant unique (clientRef) : une répétition de requête ne crée jamais de doublon ;
// - un élément n'est marqué « Synchronisé » qu'après confirmation du serveur, qui lui-même attend la confirmation du fournisseur ;
// - la copie locale n'est effacée qu'après cette confirmation ; les éléments en erreur sont conservés jusqu'à décision explicite.
import{api}from'./api.js';

const DB_NAME='aurion-cloud-queue',STORE='items',VERSION=1;
export const STATUS_LABELS={pending:'En attente',syncing:'Synchronisation en cours',synced:'Synchronisé',error:'Erreur',conflict:'Conflit (versions conservées)'};
let owner='';let running=false;let started=false;let dbPromise=null;

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    if(!('indexedDB' in window))return reject(Object.assign(new Error('Ce navigateur ne permet pas d’enregistrer des documents hors connexion.'),{code:'NO_INDEXEDDB'}));
    const req=indexedDB.open(DB_NAME,VERSION);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){const s=db.createObjectStore(STORE,{keyPath:'clientRef'});s.createIndex('owner','owner')}};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Stockage local indisponible.'));
  });
  dbPromise.catch(()=>{dbPromise=null});
  return dbPromise;
}
async function tx(mode,fn){const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode);const store=t.objectStore(STORE);let out;Promise.resolve(fn(store)).then(v=>{out=v}).catch(reject);t.oncomplete=()=>resolve(out);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Écriture locale interrompue (espace insuffisant ?).'))})}
const reqP=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function put(item){return tx('readwrite',s=>reqP(s.put(item)))}
async function get(ref){return tx('readonly',s=>reqP(s.get(ref)))}
async function del(ref){return tx('readwrite',s=>reqP(s.delete(ref)))}
async function all(){return tx('readonly',s=>reqP(s.getAll()))}
const notify=()=>window.dispatchEvent(new CustomEvent('aurion:cloud-queue-changed'));

/** Associe la file au compte connecté : les éléments d'un autre compte présent sur l'appareil ne sont jamais envoyés. */
export function setCloudOwner(id){owner=String(id||'');if(owner)startCloudSync()}

async function sha256Hex(blob){
  if(!window.crypto?.subtle)return'';
  const buf=await blob.arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',buf);
  return[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const newRef=()=>(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/[^A-Za-z0-9]/g,'').slice(0,40);

/** Vérifie l'espace local et demande un stockage durable. Renvoie un avertissement lisible ou ''. */
export async function localStorageWarning(extraBytes=0){
  try{
    const persisted=navigator.storage?.persisted?await navigator.storage.persisted():true;
    if(!persisted&&navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);
    const est=navigator.storage?.estimate?await navigator.storage.estimate():null;
    if(est&&est.quota&&est.usage!==undefined&&est.quota-est.usage<extraBytes*1.2)return'Espace local insuffisant sur cet appareil pour conserver ce document en attente.';
    const nowPersisted=navigator.storage?.persisted?await navigator.storage.persisted():true;
    if(!nowPersisted)return'Le navigateur peut effacer les documents en attente s’il manque d’espace : synchronisez-les dès que possible.';
  }catch{}
  return'';
}

/**
 * Place un fichier dans la file locale puis lance l'envoi.
 * meta : {sourceKind, sourceId, businessRef, fileName, baseVersion}
 */
export async function enqueueFile(file,meta={}){
  if(!owner)throw new Error('Session non initialisée : rechargez Aurion.');
  if(!(file instanceof Blob))throw new Error('Fichier invalide.');
  if(file.size>25*1024*1024)throw new Error('Le fichier dépasse 25 Mo.');
  const warning=await localStorageWarning(file.size);
  if(warning.startsWith('Espace local insuffisant'))throw new Error(warning);
  const item={clientRef:meta.clientRef||newRef(),owner,createdAt:new Date().toISOString(),fileName:String(meta.fileName||file.name||'document').slice(0,200),mime:file.type||'application/octet-stream',size:file.size,
    sha256:await sha256Hex(file),blob:file,sourceKind:meta.sourceKind||'file',sourceId:meta.sourceId||'',businessRef:meta.businessRef||'',baseVersion:meta.baseVersion??'',
    status:'pending',attempts:0,nextAttemptAt:0,lastError:'',syncedAt:'',remoteDocumentId:''};
  try{await put(item)}catch(error){throw new Error('Le navigateur a refusé d’enregistrer le document sur cet appareil (espace ou mode privé).')}
  notify();processCloudQueue();
  return{clientRef:item.clientRef,sha256:item.sha256,warning};
}

/** Relie un élément de la file à un objet métier créé après coup (ex. note de frais enregistrée). */
export async function attachQueueItem(clientRef,patch){const item=await get(clientRef);if(!item)return;await put({...item,...patch,nextAttemptAt:0});notify();processCloudQueue()}

const backoff=attempts=>Math.min(30*60_000,5000*2**Math.min(attempts,9))*(0.8+Math.random()*0.4);

async function sendOne(item){
  await put({...item,status:'syncing'});notify();
  const form=new FormData();
  for(const [k,v] of Object.entries({clientRef:item.clientRef,sourceKind:item.sourceKind,sourceId:item.sourceId,businessRef:item.businessRef,sha256:item.sha256,baseVersion:item.baseVersion,deviceLabel:navigator.userAgentData?.platform||navigator.platform||''}))if(v!==''&&v!==undefined&&v!==null)form.append(k,String(v));
  form.append('file',item.blob,item.fileName);
  try{
    const r=await api.cloudUpload(form);
    // Confirmation reçue : la copie locale peut être libérée, les métadonnées restent consultables.
    await put({...item,status:r.status==='conflict'?'conflict':'synced',blob:null,syncedAt:r.document?.syncedAt||new Date().toISOString(),remoteDocumentId:r.document?.id||'',lastError:''});
  }catch(error){
    const code=error?.data?.error||'';
    if(error?.status===409&&error?.data?.status==='conflict'){await put({...item,status:'conflict',blob:null,remoteDocumentId:error.data.document?.id||'',syncedAt:error.data.document?.syncedAt||'',lastError:'Conflit détecté : les deux versions sont conservées dans le cloud.'});}
    else{
      const attempts=item.attempts+1;
      const waitLong=['CLOUD_NOT_CONNECTED','CLOUD_REVOKED','CLOUD_NOT_CONFIGURED','CLOUD_QUOTA_EXCEEDED'].includes(code);
      const permanent=['UNSUPPORTED_FILE','FILE_TOO_LARGE','ISSUED_DOCUMENT_LOCKED','CLOUD_CLIENT_REF_REUSED','INVALID_INPUT','NOT_FOUND'].includes(code);
      const message=code==='CLOUD_NOT_CONNECTED'?'Aucun cloud connecté : connectez Google Drive dans Paramètres → Stockage.':error?.message||'Transfert impossible pour le moment.';
      await put({...item,status:waitLong?'pending':'error',attempts,lastError:message,errorCode:code||'NETWORK',nextAttemptAt:permanent?Number.MAX_SAFE_INTEGER:Date.now()+(waitLong?15*60_000:backoff(attempts))});
    }
  }
  notify();
}

/** Traite la file (un seul onglet à la fois grâce à navigator.locks quand il est disponible). */
export async function processCloudQueue({force=false}={}){
  if(running||!owner||!navigator.onLine)return;
  running=true;
  const work=async()=>{
    try{
      const items=(await all()).filter(x=>x.owner===owner&&x.blob&&['pending','error','syncing'].includes(x.status)&&(force||x.status==='syncing'||(x.nextAttemptAt||0)<=Date.now())).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
      for(const item of items){if(!navigator.onLine)break;await sendOne(item)}
    }catch{}
  };
  try{if(navigator.locks?.request)await navigator.locks.request('aurion-cloud-sync',{ifAvailable:true},lock=>lock?work():null);else await work()}
  finally{running=false}
}

export async function retryQueueItem(clientRef){const item=await get(clientRef);if(!item)return;await put({...item,status:'pending',nextAttemptAt:0,lastError:''});notify();await processCloudQueue({force:true})}
/** Abandon explicite par l'utilisateur d'un élément non synchronisé. */
export async function discardQueueItem(clientRef){await del(clientRef);notify()}
export async function queueItems(){if(!owner)return[];try{return(await all()).filter(x=>x.owner===owner).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}catch{return[]}}
export async function queueItem(clientRef){try{const x=await get(clientRef);return x&&x.owner===owner?x:null}catch{return null}}
export async function queueCounts(){
  const items=await queueItems();
  return{pending:items.filter(x=>['pending','syncing'].includes(x.status)).length,errors:items.filter(x=>x.status==='error').length,conflicts:items.filter(x=>x.status==='conflict').length,synced:items.filter(x=>x.status==='synced').length,localBytes:items.reduce((t,x)=>t+(x.blob?Number(x.size||0):0),0)};
}
/** Nettoyage des métadonnées synchronisées depuis plus de 30 jours (les fichiers sont dans le cloud). */
async function prune(){try{const limit=Date.now()-30*86400_000;for(const x of await all())if(x.status==='synced'&&!x.blob&&x.syncedAt&&new Date(x.syncedAt).getTime()<limit)await del(x.clientRef)}catch{}}

export function startCloudSync(){
  if(started)return;started=true;
  window.addEventListener('online',()=>processCloudQueue({force:true}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')processCloudQueue()});
  setInterval(()=>processCloudQueue(),60_000);
  prune();processCloudQueue();
}
