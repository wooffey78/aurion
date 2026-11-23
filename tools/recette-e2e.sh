#!/usr/bin/env bash
# Recette E2E Aurion 15.4.45 — infrastructure + fumée API (voir docs/RECETTE-NAVIGATEUR-15.4.45.md).
# Prérequis : node ≥ 20, dépendances installées, backend construit (cd backend && npm run build).
# Sans DATABASE_URL : télécharge des binaires PostgreSQL embarqués (aucun root requis)
# dans un répertoire isolé et démarre un cluster dédié sur le port 55432.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGPORT="${PGPORT:-55432}" APPPORT="${APPPORT:-4000}"
E2E="${E2E_DIR:-$(mktemp -d /tmp/aurion-recette.XXXXXX)}"
BIN="$E2E/pg/node_modules/@embedded-postgres/linux-x64/native/bin"

if [ -z "${DATABASE_URL:-}" ]; then
  mkdir -p "$E2E/pg"
  if [ ! -x "$BIN/postgres" ]; then
    (cd "$E2E/pg" && npm init -y >/dev/null && npm i @embedded-postgres/linux-x64@17.4.0-beta.15 >/dev/null 2>&1)
  fi
  if [ ! -f "$E2E/data/PG_VERSION" ]; then
    "$BIN/initdb" -D "$E2E/data" -U aurion --auth=trust -E UTF8 >/dev/null
  fi
  "$BIN/pg_ctl" -D "$E2E/data" -l "$E2E/pg.log" -o "-p $PGPORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp" start >/dev/null
  node -e "const {Client}=require('$BIN/../../..'.replace('/native/bin/../../..','/native/../../../node_modules/pg'));(async()=>{const c=new Client({host:'127.0.0.1',port:$PGPORT,user:'aurion',database:'postgres'});await c.connect();const r=await c.query(\"select 1 from pg_database where datname='aurion_recette'\");if(!r.rowCount)await c.query('create database aurion_recette');await c.end()})()"
  export DATABASE_URL="postgres://aurion@127.0.0.1:$PGPORT/aurion_recette"
  echo "PostgreSQL embarqué : $E2E/data (arrêt : $BIN/pg_ctl -D $E2E/data stop)"
fi

export JWT_SECRET="${JWT_SECRET:-recette-e2e-jwt-secret-0123456789abcdef}"
export AURION_SUPPORT_EMAIL="${AURION_SUPPORT_EMAIL:-support@example.invalid}"
export AURION_STORAGE_BACKEND="${AURION_STORAGE_BACKEND:-local}"
export APP_BASE_URL="http://127.0.0.1:$APPPORT" PORT="$APPPORT"

echo "[1/4] Migrations (mode provisionné : rôles séparés, RLS 074 effective)…"
# Rôles séparés comme en production : aurion_runtime sert l'application (RLS réelle),
# un login membre de aurion_admin franchit l'isolation explicitement (pool journalisé).
export AURION_RUNTIME_DB_ROLE="${AURION_RUNTIME_DB_ROLE:-aurion_runtime}"
(cd "$ROOT/backend" && node -e "const {Client}=require('pg');const u=new URL(process.env.DATABASE_URL);(async()=>{const c=new Client({host:u.hostname,port:u.port||5432,user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:'postgres'});await c.connect();for(const r of ['aurion_runtime','recette_admin'])await c.query(\`alter role \${r} login\`).catch(async()=>{if(r==='aurion_runtime')await c.query('create role aurion_runtime login');else await c.query('create role recette_admin login')});await c.query('grant aurion_admin to recette_admin').catch(()=>{});await c.end();console.log('rôles recette prêts (runtime + admin membre)')})().catch(e=>{console.error(e.message);process.exit(1)})")
(cd "$ROOT/backend" && node dist/migrate.js)
export AURION_ADMIN_DATABASE_URL="${AURION_ADMIN_DATABASE_URL:-postgres://recette_admin@127.0.0.1:${PGPORT}/$(basename "${DATABASE_URL%%\?*}")}"
if ! curl -s -o /dev/null "http://127.0.0.1:$APPPORT/index.html"; then
  echo "[2/4] Démarrage du serveur (rôle applicatif, RLS réelle)…"
  RUNTIME_URL="postgres://aurion_runtime@$(node -e "const u=new URL(process.env.DATABASE_URL);console.log(u.host+u.pathname)")"
  (cd "$ROOT/backend" && DATABASE_URL="$RUNTIME_URL" nohup node dist/server.js > "$E2E/server.log" 2>&1 &)
  for i in $(seq 1 30); do sleep 1; curl -s -o /dev/null "http://127.0.0.1:$APPPORT/index.html" && break; done
fi
echo "[3/4] Compte de recette…"
curl -s -o "$E2E/register.json" -w 'register: HTTP %{http_code}\n' -X POST "http://127.0.0.1:$APPPORT/auth/register" \
  -H 'content-type: application/json' \
  -d '{"email":"recette@example.test","password":"Recette-2026-Aurion!","acceptLegal":true,"fullName":"Recette Aurion"}' || true

echo "[4/4] Fumée API (moteur de propositions + traçabilité)…"
node "$ROOT/tools/recette-smoke.mjs"
echo "Recette API terminée. Serveur : http://127.0.0.1:$APPPORT — logs : $E2E/server.log"
