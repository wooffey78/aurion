// Bloc 2 — Interface de persistance locale structurée, versionnée et indépendante du moteur.
// Rôle : base unique pour la réplication métier hors connexion (Blocs 3-5) et la file des
// documents récents (Bloc 6). Règles du prompt maître respectées :
//   - la file de fichiers existante (assets/js/core/cloud-sync.js) est INTACTE : base séparée,
//     schéma séparé, aucune migration de ses données ;
//   - aucune donnée métier complète dans localStorage/sessionStorage ;
//   - données strictement séparées par compte/organisation/appareil (espace de noms) ;
//   - schéma versionné avec migrations locales additives ; jamais de perte au changement de version ;
//   - pas de secret serveur dans le stockage local (aucune API pour en stocker : les clés serveur
//     ne quittent jamais le serveur — cf. Bloc 0 §6).
// Adaptateurs : IndexedDB (navigateur/PWA), SQLite natif chiffré (Capacitor, driver injecté),
// mémoire (tests, mode privé strict). Le moteur est choisi à l'ouverture, les modules métier
// ne dépendent d'aucun moteur.
export const LOCAL_STORE_NAME = 'aurion-local-store';
export const LOCAL_STORE_SCHEMA_VERSION = 1;

// Schéma déclaré : chaque magasin avec ses index. Une évolution future = nouvelle version
// dans SCHEMA_MIGRATIONS (additive) — jamais de recréation destructive.
export const SCHEMA = {
  1: [
    { store: 'replicas', keyPath: 'nsKey', indexes: [['entity', 'entity'], ['updatedAt', 'updatedAt']] },
    { store: 'outbox', keyPath: 'opId', indexes: [['ns', 'ns'], ['depKey', 'depKey'], ['status', 'status']] },
    { store: 'meta', keyPath: 'nsKey', indexes: [] },
    { store: 'downloads', keyPath: 'nsKey', indexes: [['entity', 'entity'], ['downloadedAt', 'downloadedAt']] },
  ],
};
export const SCHEMA_MIGRATIONS = [];

const nsOf = ({ organizationId, userId, deviceId }) => `${organizationId||'unknown-org'}\u0000${userId||'unknown-user'}\u0000${deviceId||'unknown-device'}`;
const nsKey = (ns, store, key) => `${ns}\u0000${store}\u0000${key}`;

/** Interface commune — chaque adaptateur implémente exactement ces méthodes. */
export class MemoryAdapter {
  constructor() { this.kind = 'memory'; this.data = new Map(); this._version = null; }
  async open(_schema, _migrations, currentVersion) { this._version = currentVersion; return { fromVersion: 0, toVersion: currentVersion }; }
  async get(store, key) { return this.data.get(nsKey(this._ns, store, String(key)))?.value ?? null; }
  async getAll(store) { return [...this.data.values()].filter(r => r.ns === this._ns && r.store === store).sort((a, b) => String(a.value?.sortKey ?? '').localeCompare(String(b.value?.sortKey ?? ''))).map(r => r.value); }
  async put(store, key, value) { this.data.set(nsKey(this._ns, store, String(key)), { ns: this._ns, store, key: String(key), value, sortKey: value?.sortKey ?? '', updatedAt: value?.updatedAt ?? '' }); }
  async delete(store, key) { this.data.delete(nsKey(this._ns, store, String(key))); }
  async clearStore(store) { for (const k of [...this.data.keys()]) if (this.data.get(k).ns === this._ns && this.data.get(k).store === store) this.data.delete(k); }
  async close() {}
}

/** Adaptateur IndexedDB : nouvelle base `aurion-local-store`, migrations locales additives. */
export class IndexedDbAdapter {
  constructor(indexedDb) { this.kind = 'indexeddb'; this._idb = indexedDb; this._db = null; this._keyPaths = {}; }
  async open(schema, migrations, currentVersion) {
    for (const def of schema[currentVersion] || []) this._keyPaths[def.store] = def.keyPath || 'nsKey';
    const req = this._idb.open(LOCAL_STORE_NAME, currentVersion);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      const from = event.oldVersion, to = event.newVersion;
      if (from === 0) {
        for (const def of schema[to] || []) {
          const s = db.createObjectStore(def.store, { keyPath: def.keyPath });
          for (const [name, path] of def.indexes || []) s.createIndex(name, path);
        }
      } else {
        for (const m of migrations || []) if (m.to > from && m.to <= to) m.apply(db, event.target.transaction);
      }
      event.target.upgradeMeta = { fromVersion: from, toVersion: to };
    };
    this._db = await new Promise((resolve, reject) => {
      req.onsuccess = () => { resolve(req.result); };
      req.onerror = () => reject(req.error || new Error('Stockage local indisponible.'));
      req.onblocked = () => reject(new Error('Stockage local bloqué par un autre onglet : fermez les autres onglets Aurion puis rechargez.'));
    });
    return { fromVersion: 0, toVersion: currentVersion };
  }
  async _tx(store, mode, fn) {
    const t = this._db.transaction([store], mode);
    return new Promise((resolve, reject) => {
      let out;
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Écriture locale interrompue (espace insuffisant ?).'));
      Promise.resolve(fn(t.objectStore(store))).then(v => { out = v; }).catch(e => { try { t.abort(); } catch {} reject(e); });
    });
  }
  // Les magasins à clé primaire `nsKey` portent la clé sur l'enregistrement ; les magasins à
  // clé naturelle (ex. `outbox` sur `opId`) portent la clé sous LEUR keyPath propre — sinon
  // IndexedDB rejette l'écriture (DataError) et les lectures ne retrouvent jamais les lignes.
  _rec(store, key, value) {
    const kp = this._keyPaths[store] || 'nsKey';
    const rec = { ns: this._ns, store, key: String(key), value, sortKey: value?.sortKey ?? '', updatedAt: value?.updatedAt ?? '' };
    if (kp === 'nsKey') rec.nsKey = nsKey(this._ns, store, String(key)); else rec[kp] = String(key);
    return rec;
  }
  async get(store, key) { const kp = this._keyPaths[store] || 'nsKey'; return this._tx(store, 'readonly', s => new Promise((res, rej) => { const r = kp === 'nsKey' ? s.get(nsKey(this._ns, store, String(key))) : s.get(String(key)); r.onsuccess = () => res(r.result?.value ?? null); r.onerror = () => rej(r.error); })); }
  async getAll(store) { return this._tx(store, 'readonly', s => new Promise((res, rej) => { const r = s.getAll(); r.onsuccess = () => res((r.result || []).filter(x => x.ns === this._ns && x.store === store).map(x => x.value)); r.onerror = () => rej(r.error); })); }
  async put(store, key, value) { return this._tx(store, 'readwrite', s => new Promise((res, rej) => {
    // La clé primaire du magasin DOIT figurer sur l'enregistrement (nsKey isolé par
    // compte/organisation/appareil, opId pour la file) — sinon IndexedDB rejette l'écriture.
    const r = s.put(this._rec(store, key, value));
    r.onsuccess = () => res(true); r.onerror = () => rej(r.error);
  })); }
  async delete(store, key) { const kp = this._keyPaths[store] || 'nsKey'; return this._tx(store, 'readwrite', s => new Promise((res, rej) => { const r = kp === 'nsKey' ? s.delete(nsKey(this._ns, store, String(key))) : s.delete(String(key)); r.onsuccess = () => res(true); r.onerror = () => rej(r.error); })); }
  async clearStore(store) { return this._tx(store, 'readwrite', s => new Promise((res, rej) => { const r = s.getAll(); r.onsuccess = async () => { for (const x of r.result || []) if (x.ns === this._ns && x.store === store) s.delete(nsKey(this._ns, store, x.key)); res(true); }; r.onerror = () => rej(r.error); })); }
  async close() { this._db?.close(); }
}

/**
 * Adaptateur SQLite natif (Capacitor). Le driver est INJECTÉ (window.AURION_SQLITE_DRIVER) :
 * objet exposant exec(sql, params?) et query(sql, params?) conformes au plugin CapacitorSQLite.
 * Chiffrement : le driver doit être configuré avec SQLCipher et une clé protégée par
 * Android Keystore / iOS Keychain (décision d'implémentation native du Bloc 8) — cette
 * interface n'expose jamais de clé et n'en génère pas.
 */
export class SqliteAdapter {
  constructor(driver) { this.kind = 'sqlite'; this._d = driver; }
  async open(schema, migrations, currentVersion) {
    const from = await this._version();
    for (let v = (from || 0) + 1; v <= currentVersion; v++) {
      for (const def of schema[v] || []) {
        const cols = ['ns TEXT NOT NULL', 'store TEXT NOT NULL', 'key TEXT NOT NULL', 'sortKey TEXT NOT NULL DEFAULT \'\'', 'updatedAt TEXT NOT NULL DEFAULT \'\'', 'value TEXT NOT NULL'];
        await this._d.exec(`CREATE TABLE IF NOT EXISTS "${def.store}" (${cols.join(', ')}, PRIMARY KEY (ns, store, key));`);
        for (const [name, path] of def.indexes || []) await this._d.exec(`CREATE INDEX IF NOT EXISTS "idx_${def.store}_${name}" ON "${def.store}" ("${path}");`);
      }
      for (const m of migrations || []) if (m.to === v) await m.apply(this._d);
    }
    return { fromVersion: from || 0, toVersion: currentVersion };
  }
  async _version() { try { const r = await this._d.query(`SELECT value FROM "meta" WHERE ns=? AND store=? AND key='__schema_version' LIMIT 1`, ['__global__', '__global__', '__global__']); return r?.values?.[0] ? Number(JSON.parse(r.values[0].value).version) || 0 : 0; } catch { return 0; } }
  async _setVersion(v) { await this._d.exec(`INSERT INTO "meta" (ns, store, key, value) VALUES ('__global__','__global__','__global__', ?) ON CONFLICT(ns, store, key) DO UPDATE SET value=excluded.value`, [JSON.stringify({ version: v })]); }
  async get(store, key) { const r = await this._d.query(`SELECT value FROM "${store}" WHERE ns=? AND store=? AND key=? LIMIT 1`, [this._ns, store, String(key)]); return r?.values?.[0] ? JSON.parse(r.values[0].value) : null; }
  async getAll(store) { const r = await this._d.query(`SELECT value FROM "${store}" WHERE ns=? ORDER BY sortKey ASC`, [this._ns]); return (r?.values || []).map(x => JSON.parse(x.value)); }
  async put(store, key, value) { await this._d.exec(`INSERT INTO "${store}" (ns, store, key, sortKey, updatedAt, value) VALUES (?,?,?,?,?,?) ON CONFLICT(ns, store, key) DO UPDATE SET sortKey=excluded.sortKey, updatedAt=excluded.updatedAt, value=excluded.value`, [this._ns, store, String(key), value?.sortKey ?? '', value?.updatedAt ?? '', JSON.stringify(value)]); }
  async delete(store, key) { await this._d.exec(`DELETE FROM "${store}" WHERE ns=? AND store=? AND key=?`, [this._ns, store, String(key)]); }
  async clearStore(store) { await this._d.exec(`DELETE FROM "${store}" WHERE ns=?`, [this._ns]); }
  async close() { try { await this._d.exec?.('COMMIT;'); } catch {} }
}

/** Ouvre le magasin local pour un espace de noms compte/organisation/appareil. */
export async function openLocalStore({ organizationId, userId, deviceId, driver } = {}) {
  const ns = nsOf({ organizationId, userId, deviceId });
  let adapter;
  if (driver) adapter = new SqliteAdapter(driver);
  else if (typeof indexedDB !== 'undefined') adapter = new IndexedDbAdapter(indexedDB);
  else adapter = new MemoryAdapter();
  adapter._ns = ns;
  const result = await adapter.open(SCHEMA, SCHEMA_MIGRATIONS, LOCAL_STORE_SCHEMA_VERSION);
  if (adapter.kind === 'sqlite') await adapter._setVersion(LOCAL_STORE_SCHEMA_VERSION);
  const store = {
    kind: adapter.kind,
    namespace: ns,
    schemaVersion: LOCAL_STORE_SCHEMA_VERSION,
    migrated: result,
    get: (storeName, key) => adapter.get(storeName, key),
    getAll: storeName => adapter.getAll(storeName),
    put: (storeName, key, value) => adapter.put(storeName, key, value),
    delete: (storeName, key) => adapter.delete(storeName, key),
    clearStore: storeName => adapter.clearStore(storeName),
    close: () => adapter.close(),
    /** Espace durable : demande de persistance + avertissement quota lisible (comme la file de fichiers). */
    storageWarning: async () => {
      try {
        if (navigator.storage?.persisted && !(await navigator.storage.persisted()) && navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
        const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
        if (est?.quota && est.usage !== undefined && est.quota - est.usage < 5 * 1024 * 1024) return 'Espace local insuffisant sur cet appareil : la réplication hors connexion est limitée.';
        const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : true;
        if (!persisted) return 'Le navigateur peut effacer les données hors connexion s’il manque d’espace : synchronisez dès que possible.';
      } catch {}
      return '';
    },
  };
  return store;
}

/** Effacement contrôlé de TOUT l'espace de noms de l'appareil (déconnexion, révocation). */
export async function wipeLocalStore(store) { for (const name of Object.values(SCHEMA).flat().map(d => d.store)) await store.clearStore(name); }
