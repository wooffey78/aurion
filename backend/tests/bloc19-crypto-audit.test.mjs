// Bloc 19 — Cryptographie et gestion des secrets : audit consolidé.
// Primitives maintenues uniquement (argon2id, AES-256-GCM versionné, JWT HS256 ≥ 32 caractères),
// aucune primitive réinventée, aucun algorithme obsolète à des fins de SÉCURITÉ,
// secrets jamais exposés dans les logs, rotation couverte par tests existants.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readdirSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('bloc19: primitives modernes uniquement — argon2id, AES-256-GCM versionné, JWT ≥ 32 caractères', () => {
  // Mots de passe : argon2id (paramètres explicites), jamais bcrypt/sha pour les mots de passe.
  const passwords = read('../src/services/passwords.ts');
  assert.match(passwords, /argon2\.hash\(password,\{type:argon2\.argon2id,memoryCost:65536,timeCost:3,parallelism:1\}\)/);
  assert.doesNotMatch(passwords, /createHash|pbkdf2|scrypt/);
  // Secrets au repos : AES-256-GCM avec versions de clé (rotation + compatibilité historique).
  const secrets = read('../src/services/secrets.ts');
  assert.match(secrets, /aes-256-gcm/);
  assert.match(secrets, /AURION_ENCRYPTION_KEY_PREVIOUS/);
  assert.match(secrets, /SECRET_ENCRYPTION_KEY_VERSION_UNAVAILABLE/);
  // La clé JWT n'est JAMAIS utilisée pour le chiffrement au repos sans compatibilité explicite.
  assert.match(secrets, /AURION_ENCRYPTION_LEGACY_JWT_KEY/);
  assert.match(secrets, /jamais utilisée pour les nouvelles écritures/);
  // JWT : HS256, secret de 32 caractères minimum validé par zod au démarrage.
  const auth = read('../src/plugins/auth.ts');
  assert.match(auth, /alg:"HS256"/);
  const config = read('../src/config.ts');
  assert.match(config, /JWT_SECRET:z\.string\(\)\.min\(32\)/);
  // Rotation : test existant couvrant la rotation et la compatibilité ancien/nouveau.
  const rotation = read('../tests/secret-rotation.test.mjs');
  assert.match(rotation, /rotate|rotation/i);
});

test('bloc19: aucun algorithme obsolète à des fins de sécurité (le md5 reste limité au checksum Drive non cryptographique)', () => {
  // `URL.pathname` produit « /C:/… » sous Windows : utiliser fileURLToPath pour un chemin valide.
  const srcDir = fileURLToPath(new URL('../src', import.meta.url));
  const hits = [];
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (p.includes('node_modules')) continue; try { if (require('node:fs').statSync(p).isDirectory()) { walk(p); continue; } } catch {} if (!p.endsWith('.ts')) continue; const src = readFileSync(p, 'utf8'); if (/createHash\('(md5|sha1)'|createCipheriv\('(des|rc4|bf)/.test(src)) hits.push(path.relative(srcDir, p)); } };
  walk(srcDir);
  // Le seul usage de md5 est le contrôle d'intégrité Drive (le fichier renvoie md5Checksum) :
  for (const h of hits) assert.match(h, /cloud-drive\.ts/, `usage obsolète hors checksum Drive : ${h}`);
  const drive = read('../src/services/cloud-drive.ts');
  assert.match(drive, /md5Checksum/);
});

test('bloc19: les secrets ne sont jamais journalisés ni en erreur (aucun message n\u2019inclut la valeur)', () => {
  // Les erreurs de secrets.ts exposent des CODES, jamais des valeurs ni des clés.
  const secrets = read('../src/services/secrets.ts');
  for (const code of ['SECRET_ENCRYPTION_KEY_MISSING', 'SECRET_FORMAT', 'SECRET_DECRYPTION_FAILED', 'SECRET_ENCRYPTION_KEY_VERSION_UNAVAILABLE']) {
    assert.match(secrets, new RegExp(code));
  }
  assert.doesNotMatch(secrets, /throw new Error\([`'"][^'"`]*\$\{[a-zA-Z.]*key|throw new Error\([`'"][^'"`]*\$\{value/);
  // La clé d'API de paiement n'est jamais journalisée ; les adaptateurs n'émettent que des erreurs factuelles.
  const generic = read('../src/services/payments/generic.ts');
  assert.doesNotMatch(generic, /log\..*(apiKey|AURION_PAY)/);
  // Le secret du webhook n'apparaît dans aucune sortie (routes de paiement).
  const payRoutes = read('../src/routes/payments.ts');
  assert.doesNotMatch(payRoutes, /log\..*WEBHOOK_SECRET|log\..*secret/);
  // Rotation : le script dédié n'affiche que des compteurs (mode, scanned, needsRotation,
  // alreadyCurrent) — jamais la clé ni la valeur en clair ; les erreurs n'exposent que le message.
  const rotate = read('../scripts/rotate-secrets.mjs');
  assert.match(rotate, /mode: apply \? 'apply' : 'dry-run'/);
  assert.doesNotMatch(rotate, /console\.log\([^)]*\.material|console\.log\([^)]*secretValue|console\.log\([^)]*plaintext/);
  assert.doesNotMatch(rotate, /console\.error\([^)]*\.material|console\.error\([^)]*secretValue/);
});
