// Bloc 20 — Transparence : sous-traitants réels (calculés depuis la configuration EFFECTIVE),
// matrice « Sécurité et contrôles » alimentée par la documentation du bloc 6, procédures de
// réversibilité (export complet sans frais, rétractation, suppression de compte et durées de
// conservation). La cohérence page ↔ matrice est VÉRIFIÉE PAR TEST : chaque contrôle cite son
// emplacement dans le code et son état (implémenté et testé / partiel / absent / non vérifié).
import { config } from '../config.js';

export interface SubProcessor { name: string; role: string; region: string; active: boolean; source: string }

/** Sous-traitants réellement utilisés : déduits de la configuration effective, jamais inventés. */
export function subProcessors(): SubProcessor[] {
  const payProvider = config.AURION_PAY_PROVIDER;
  const paProvider = config.AURION_PA_PROVIDER;
  return [
    { name: 'Render', role: 'Hébergement du service applicatif (blueprint render.yaml : service unique `aurion`)', region: 'Francfort (UE) — région unique du blueprint ; instance historique Oregon hors blueprint, à supprimer après bascule DNS et fenêtre de retour arrière (docs/RUNBOOK-PRODUCTION.md)', active: true, source: 'render.yaml · docs/RUNBOOK-PRODUCTION.md' },
    { name: 'PostgreSQL (Render)', role: 'Base de données gérée', region: 'région des services — cible Francfort (UE), à confirmer au contrat', active: true, source: 'render.yaml (DATABASE_URL) · docs/RUNBOOK-PRODUCTION.md' },
    {
      name: 'Google Drive', role: 'Archivage cloud personnel du document (l\'utilisateur connecte son propre Drive ; Aurion n\'y accède qu\'avec son consentement révocable)', region: 'région du compte Drive de l\'utilisateur',
      active: Boolean(config.GOOGLE_CLIENT_ID), source: 'integrations/google (configuration OAuth)',
    },
    {
      name: 'Messagerie SMTP', role: 'Envoi des documents et relances depuis la messagerie fournie par l\'entrepreneur (identifiants chiffrés AES-256-GCM)', region: 'serveur SMTP choisi par l\'utilisateur',
      active: true, source: 'integrations/mail (configuration par l\'utilisateur)',
    },
    {
      name: `Prestataire de paiement (${payProvider})`, role: 'Lien de paiement et confirmation signée des règlements — NON OPÉRATIONNEL tant que la décision D3 n\'est pas tranchée', region: 'à définir à la décision D3',
      active: Boolean(payProvider), source: 'AURION_PAY_PROVIDER',
    },
    {
      name: `Plateforme agréée (${paProvider})`, role: 'Facturation électronique (réception/émission) — NON OPÉRATIONNELLE tant qu\'aucune PA contractuelle n\'est connectée', region: 'à définir au contrat',
      active: Boolean(paProvider), source: 'AURION_PA_PROVIDER',
    },
    { name: 'Stripe (abonnement Aurion)', role: 'Souscription à l\'abonnement de la plateforme elle-même (jamais les factures clients de l\'entrepreneur)', region: 'Stripe (UE possible)', active: Boolean(config.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY), source: 'billing/subscription (Stripe connecté côté abonnement)' },
  ];
}

export interface Control { id: string; label: string; state: 'implémentée et testée' | 'partielle' | 'absente' | 'non vérifiée'; proof: string; location: string }

/** Matrice « Sécurité et contrôles » — chaque entrée cite son emplacement réel (testé par cohérence). */
export const CONTROLS: Control[] = [
  { id: 'rls', label: 'Isolation multi-tenant PostgreSQL (RLS, 61+ politiques, échec fermé sans contexte)', state: 'implémentée et testée', proof: 'tenant-isolation.rls.test.mjs (A/B sur PostgreSQL réel)', location: 'backend/migrations/074_multi_tenant_rls.sql · backend/src/db.ts (AsyncLocalStorage) · backend/src/app.ts' },
  { id: 'ci', label: 'CI stricte (build, typecheck, smoke, lint, navigateur, audit npm)', state: 'implémentée et testée', proof: '.github/workflows/aurion-ci.yml · suite complète locale 430+ tests', location: '.github/workflows/aurion-ci.yml' },
  { id: 'passwords', label: 'Mots de passe argon2id (64 Mo, t=3)', state: 'implémentée et testée', proof: 'bloc19-crypto-audit.test.mjs', location: 'backend/src/services/passwords.ts' },
  { id: 'secrets', label: 'Secrets au repos AES-256-GCM versionné + rotation', state: 'implémentée et testée', proof: 'secret-rotation.test.mjs · bloc19-crypto-audit.test.mjs', location: 'backend/src/services/secrets.ts · backend/scripts/rotate-secrets.mjs' },
  { id: 'rate-limit', label: 'Limitation de débit sur les routes sensibles (auth, registre, webhooks, exports)', state: 'implémentée et testée', proof: 'routes.contract.test.mjs', location: 'backend/src/app.ts' },
  { id: 'sw-privacy', label: 'Service worker limité au shell public (aucune donnée privée en cache)', state: 'implémentée et testée', proof: 'service-worker-privacy.test.mjs', location: 'sw.js' },
  { id: 'webhook-signature', label: 'Webhooks signés (PA et paiement) : HMAC, anti-rejeu, idempotence', state: 'implémentée et testée', proof: 'pa-adapter.contract.test.mjs · bloc13-payments.test.mjs', location: 'backend/src/routes/pa.ts · backend/src/services/payments/webhook.ts' },
  { id: 'observability', label: 'Suivi d\'erreurs externe, métriques, surveillance de disponibilité', state: 'absente', proof: 'aucune intégration connectée : décision D6 (choix du prestataire de suivi d\'erreurs) non tranchée (bloc 24 du plan)', location: '—' },
  { id: 'einvoice-live', label: 'Transmission réelle des factures électroniques via une plateforme agréée', state: 'non vérifiée', proof: 'aucune PA contractuelle connectée (blocs 3-5 : socle + contrat générique testés)', location: 'backend/src/services/pa/ · backend/src/services/electronic-outgoing.ts' },
  { id: 'payments-live', label: 'Paiement client en ligne avec un prestataire contractuel', state: 'non vérifiée', proof: 'décision D3 en attente ; adaptateur + webhook testés de bout en bout', location: 'backend/src/services/payments/' },
];

export function transparencySnapshot() {
  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    subprocessors: subProcessors(),
    controls: CONTROLS.map(({ id, label, state, proof, location }) => ({ id, label, state, proof, location })),
    reversibility: {
      export: 'Export complet de l\'organisation (clients, devis, factures, justificatifs d\'origine, journal, paramètres non secrets) en ZIP téléchargeable sans frais ni démarche : Paramètres → Export / GET /documents/export-all.zip — inclut l\'index des justificatifs avec empreintes SHA-256 (bloc 14).',
      withdrawal: 'Rétractation : formulaire dédié (/retractation) avec vérification d\'identité et référence de contrat.',
      deletion: 'Suppression de compte et durées : fin de période → statut « expired » ; à +60 jours les données passent en lecture seule (data_read_only_until) ; la suppression définitive intervient à l\'échéance de conservation des documents (les durées définitives sont à confirmer juridiquement — obligation de conservation des pièces comptables).',
      noSecrets: 'Aucun secret (clés, tokens, mots de passe) n\'est inclus dans l\'export ni dans la page publique.',
    },
    disclaimer: 'Les modèles de contrats de sous-traitance ne sont PAS présentés comme conformes RGPD : une revue juridique est requise avant publication (voir docs/SOUS-TRAITANTS.md).',
  };
}
