// Pré-vol intégrations — vérifie, SANS envoyer de message ni créer d'objet, chaque
// intégration dont la configuration réelle doit être testée avant ouverture commerciale
// (évaluation 15.4.22, priorité P1 « Paiement et messagerie »). Chaque contrôle est
// NO-OP tant que sa configuration est absente : le script ne décide de rien et ne
// connecte aucun service ; il teste ce que l'opérateur a déjà configuré.
//   SMTP  : connexion + STARTTLS + AUTH (si identifiants) — aucun e-mail envoyé
//   Stripe : GET /v1/balance (lecture seule) avec la clé configurée
//   Google : configuration OAuth, refresh token réel, scopes, calendriers et quota Drive
//   PA (plateforme agréée) et paiement client : état déclaratif (aucun appel réseau —
//     la validation opérationnelle exige le contrat réel et la recette sandbox)
//
// Usage :
//   node scripts/check-integrations.mjs [--strict] [--google-live]
//        [--env-file <fichier>] [--environment <label>]
//        [--local <fichier>] [--staging <fichier>] [--production <fichier>]
//   --strict        code de sortie 1 si une configuration est incomplète ou un contrôle échoue
//   --google-live   exige le contrôle réel Google (refresh + calendriers + quota Drive)
//   --env-file      charge un fichier .env sans écraser les variables déjà définies
//   --local/...     diagnostic Google lisible par environnement, sans exécuter l'application
//
// Le contrôle réel n'est exécuté que si GOOGLE_PREFLIGHT_REFRESH_TOKEN est fourni. Il ne
// journalise jamais le jeton, le secret client ni le contenu des réponses Google.
import net from 'node:net';
import tls from 'node:tls';
import { existsSync, readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import {
  DEFAULT_GOOGLE_ENDPOINTS,
  diagnoseGoogleConfiguration,
  formatGoogleConfiguration,
  runGoogleLivePreflight,
} from './lib/google-preflight.mjs';

const USAGE = `Usage : node scripts/check-integrations.mjs [--strict] [--google-live]
       [--env-file <fichier>] [--environment <label>]
       [--local <fichier>] [--staging <fichier>] [--production <fichier>]

  --strict        sort 1 si une configuration est incomplète ou un contrôle échoue
  --google-live   exige le contrôle réel Google (refresh, scopes, calendriers, quota Drive)
  --env-file      charge un .env sans écraser les variables déjà définies
  --environment   libellé du diagnostic courant (local, staging, production…)
  --local, --staging, --production  fichiers .env à diagnostiquer côte à côte

Google réel : GOOGLE_PREFLIGHT_REFRESH_TOKEN (et éventuellement
GOOGLE_PREFLIGHT_DRIVE_REFRESH_TOKEN) doit être fourni dans l'environnement.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const strict = args.includes('--strict');
const googleLiveRequired = args.includes('--google-live');
const environment = option('--environment') || process.env.NODE_ENV || 'local';
const envFile = option('--env-file');
const environmentFiles = [
  ['local', option('--local')],
  ['staging', option('--staging')],
  ['production', option('--production')],
].filter(([, file]) => Boolean(file));

if (envFile) {
  if (!existsSync(envFile)) {
    console.error(`ERREUR : fichier d'environnement introuvable : ${envFile}`);
    process.exit(2);
  }
  const loaded = dotenv.parse(readFileSync(envFile, 'utf8'));
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
for (const [label, file] of environmentFiles) {
  if (!existsSync(file)) {
    console.error(`ERREUR : fichier ${label} introuvable : ${file}`);
    process.exit(2);
  }
}

const results = [];
const report = (name, state, detail) => {
  results.push({ name, state, detail });
  const icon = state === 'OK' ? '✔' : state === 'ATTENTION' ? '!' : state === 'NON CONFIGURÉ' || state === 'NON TESTÉ' ? '—' : '✖';
  console.log(`${icon} ${name} : ${state}${detail ? ` — ${detail}` : ''}`);
};
const clean = (value, max = 160) => String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

// ---- SMTP plateforme (Brevo ou autre) : accusés de réception, réinitialisation, confirmations
const smtpHost = String(process.env.PLATFORM_SMTP_HOST || '').trim();
const smtpPort = Number(process.env.PLATFORM_SMTP_PORT || 587);
const smtpUser = String(process.env.PLATFORM_SMTP_USER || '').trim();
const smtpPass = String(process.env.PLATFORM_SMTP_PASS || '').trim();
const smtpSecurity = String(process.env.PLATFORM_SMTP_SECURITY || '').trim().toLowerCase();
if (!smtpHost) {
  report('SMTP plateforme', 'NON CONFIGURÉ', 'PLATFORM_SMTP_HOST vide — les accusés de réception et e-mails de sécurité ne fonctionneront pas tant qu\'il est vide (rappel : décision opérateur).');
} else {
  try {
    const convo = await new Promise((resolve, reject) => {
      const socket = net.connect({ host: smtpHost, port: smtpPort, timeout: 8000 });
      let buffer = ''; let step = 0;
      const cleanup = (err, data) => { socket.destroy(); err ? reject(err) : resolve(data); };
      socket.on('timeout', () => cleanup(new Error('connexion SMTP: délai dépassé')));
      socket.on('error', (e) => cleanup(e));
      socket.on('data', (d) => {
        buffer += d.toString('utf8');
        const last = buffer.trimEnd().split('\n').pop() || '';
        if (!/^\d{3} /.test(last)) return; // attendre la dernière ligne de réponse
        step++;
        if (step === 1) {
          if (last.startsWith('4') || last.startsWith('5')) return cleanup(new Error(`réponse refusée: ${last}`));
          socket.write('EHLO aurion-preflight\r\n');
        } else if (step === 2) {
          const caps = buffer.toUpperCase();
          if (smtpSecurity === 'starttls' && !caps.includes('STARTTLS')) return cleanup(new Error('STARTTLS requis par la configuration mais non annoncé par le serveur'));
          const tlsSocket = tls.connect({ socket, servername: smtpHost, rejectUnauthorized: true }, () => {
            buffer = ''; tlsSocket.write('EHLO aurion-preflight\r\n');
          });
          tlsSocket.on('error', (e) => cleanup(e));
          tlsSocket.on('data', (d2) => {
            buffer += d2.toString('utf8');
            const last2 = buffer.trimEnd().split('\n').pop() || '';
            if (!/^\d{3} /.test(last2)) return;
            if (buffer.toUpperCase().includes(' AUTH')) {
              if (smtpUser && smtpPass) {
                buffer = ''; tlsSocket.write('AUTH LOGIN\r\n');
                tlsSocket.once('data', (a) => {
                  if (!String(a).trim().startsWith('334')) return cleanup(new Error(`AUTH refusé: ${String(a).trim()}`));
                  tlsSocket.write(Buffer.from(smtpUser).toString('base64') + '\r\n');
                  tlsSocket.once('data', (b) => {
                    if (!String(b).trim().startsWith('334')) return cleanup(new Error(`AUTH utilisateur refusé: ${String(b).trim()}`));
                    tlsSocket.write(Buffer.from(smtpPass).toString('base64') + '\r\n');
                    tlsSocket.once('data', (c) => {
                      if (!String(c).trim().startsWith('235')) return cleanup(new Error(`AUTH mot de passe refusé: ${String(c).trim()}`));
                      tlsSocket.write('QUIT\r\n');
                      cleanup(null, `authentification réussie (STARTTLS)`);
                    });
                  });
                });
              } else {
                tlsSocket.write('QUIT\r\n');
                cleanup(null, 'STARTTLS annoncé et négocié (authentification non testée : identifiants absents)');
              }
            } else cleanup(null, 'STARTTLS négocié (aucune annonce AUTH)');
          });
        }
      });
    });
    report('SMTP plateforme', 'OK', convo);
  } catch (e) {
    report('SMTP plateforme', 'ÉCHEC', e.message);
  }
}

// ---- Stripe (abonnement Aurion) : clé configurée + lecture seule /v1/balance
const stripeKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
if (!stripeKey) {
  report('Stripe (abonnement)', 'NON CONFIGURÉ', 'STRIPE_SECRET_KEY vide — l\'abonnement Aurion ne peut pas être souscrit tant que la clé et le compte marchand ne sont pas configurés (décision opérateur).');
} else {
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${stripeKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 200) {
      const body = await res.json();
      report('Stripe (abonnement)', 'OK', `clé valide, livemode=${body.livemode === true ? 'true (production)' : 'false (test)'}`);
    } else if (res.status === 401) report('Stripe (abonnement)', 'ÉCHEC', 'clé refusée par Stripe (401) — vérifier la clé et le compte');
    else report('Stripe (abonnement)', 'ÉCHEC', `réponse HTTP ${res.status}`);
  } catch (e) {
    report('Stripe (abonnement)', 'ÉCHEC', e.message);
  }
}

// ---- Google OAuth (facultatif : agenda, messagerie, Drive personnel)
// Diagnostic par environnement : noms de variables manquantes uniquement, jamais de valeur.
for (const [label, file] of environmentFiles) {
  try {
    const env = new Map(Object.entries(dotenv.parse(readFileSync(file, 'utf8'))));
    const diagnostic = diagnoseGoogleConfiguration(env, { environment: label });
    const state = diagnostic.state === 'configured' ? 'OK' : diagnostic.state === 'disabled' ? 'NON CONFIGURÉ' : 'ÉCHEC';
    report(`Google configuration (${label})`, state, formatGoogleConfiguration(diagnostic));
  } catch {
    report(`Google configuration (${label})`, 'ÉCHEC', 'fichier d’environnement illisible');
  }
}

const googleConfig = diagnoseGoogleConfiguration(process.env, { environment });
if (googleConfig.state === 'disabled') {
  report('Google OAuth', 'NON CONFIGURÉ', 'GOOGLE_CLIENT_ID vide — les connexions Google (facultatives) restent désactivées ; l\'application fonctionne sans.');
  if (googleLiveRequired) {
    report('Google — contrôle réel', 'ÉCHEC', '--google-live demandé mais Google n’est pas configuré dans cet environnement');
  }
} else if (googleConfig.state === 'incomplete') {
  report('Google OAuth', 'ÉCHEC', `configuration incomplète : ${googleConfig.missing.join(' ; ')}`);
  if (googleLiveRequired) {
    report('Google — contrôle réel', 'ÉCHEC', 'configuration incomplète : le contrôle réel ne peut pas démarrer');
  }
} else {
  try {
    const res = await fetch(DEFAULT_GOOGLE_ENDPOINTS.openid, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 200) report('Google OAuth', 'OK', 'points de terminaison joignables, configuration complète');
    else report('Google OAuth', 'ÉCHEC', `réponse HTTP ${res.status} des points de terminaison Google`);
  } catch {
    report('Google OAuth', 'ÉCHEC', 'points de terminaison Google injoignables (réseau ou délai dépassé)');
  }

  if (!googleConfig.liveReady) {
    report('Google — contrôle réel', googleLiveRequired ? 'ÉCHEC' : 'NON TESTÉ',
      `${googleConfig.liveMissing.join(' ; ') || 'jeton de pré-vol'} absent — refresh token, calendriers et quota Drive non testés`);
  } else {
    const live = await runGoogleLivePreflight(process.env, {
      fetchImpl: fetch,
      endpoints: DEFAULT_GOOGLE_ENDPOINTS,
      environment,
      requireDrive: googleLiveRequired,
    });
    for (const check of live.checks) report(check.label, check.state, check.detail);
    if (Array.isArray(live.calendars) && live.calendars.length) {
      console.log(`  Calendriers accessibles (${live.calendars.length}) :`);
      live.calendars.forEach((calendar, index) => {
        const flags = [];
        if (calendar.primary) flags.push('principal');
        if (calendar.accessRole) flags.push(calendar.accessRole);
        console.log(`    ${index + 1}. ${clean(calendar.summary)}${flags.length ? ` (${flags.join(', ')})` : ''}`);
      });
    }
  }
}

// ---- Plateforme agréée (facturation électronique) : déclaratif, AUCUN appel réseau
const pa = String(process.env.AURION_PA_PROVIDER || '').trim();
report(pa ? 'Plateforme agréée (PA)' : 'Plateforme agréée (PA)',
  pa ? 'CONFIGURÉ — validation opérationnelle restante' : 'NON CONFIGURÉ',
  pa ? `AURION_PA_PROVIDER='${pa}' — le contrat réel et la recette sandbox restent à exécuter ; sans eux, aucune réception ni transmission n'est déclarée opérationnelle (aucun changement du côté de cet outil).`
     : 'réception refusée (503) tant que le contrat avec une PA immatriculée n\'est pas configuré — décision éditeur, non traitée ici.');

// ---- Prestataire de paiement client : déclaratif, décision D3
const pay = String(process.env.AURION_PAY_PROVIDER || '').trim();
report('Paiement client (D3)', pay ? 'CONFIGURÉ — validation opérationnelle restante' : 'NON CONFIGURÉ',
  pay ? `AURION_PAY_PROVIDER='${pay}' — le prestataire est déclaré ; sa validation réelle reste à exécuter.`
      : 'décision D3 non tranchée — l\'outil ne tranche pas à votre place ; le service reste non opérationnel tant que le prestataire n\'est pas choisi et validé.');

const failures = results.filter(r => r.state === 'ÉCHEC').length;
const warnings = results.filter(r => r.state === 'ATTENTION').length;
const notTested = results.filter(r => r.state === 'NON TESTÉ').length;
const unconfigured = results.filter(r => r.state === 'NON CONFIGURÉ').length;
console.log(`\n== Bilan : ${results.filter(r => r.state === 'OK').length} OK · ${failures} échec(s) · ${warnings} attention(s) · ${notTested} non testé(s) · ${unconfigured} non configuré(s) ==`);
console.log('Un contrôle « NON CONFIGURÉ » est normal avant configuration : il rappelle l\'effet réel (fonction désactivée) sans rien activer.');
if (strict && failures > 0) process.exit(1);
if (googleLiveRequired && (failures > 0 || notTested > 0)) process.exit(1);
