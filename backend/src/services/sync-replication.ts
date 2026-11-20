import { query } from '../db.js';

// Bloc 3 — registre des entités répliquées hors connexion (prompt maître §4.2-4.3, Bloc 0 §4).
// Chaque entrée déclare une table tenant répliquée pour consultation hors connexion et création/
// modification locales (Bloc 4). Règles :
//   - SECRET EXCLU : mail_accounts (password_enc) n'est PAS répliqué ; aucune clé serveur,
//     jeton Google, secret fournisseur ni donnée de paiement plateforme ne figure dans ce
//     registre — ils ne quittent jamais le serveur ;
//   - les tables internes d'administration plateforme, de sécurité (sessions, jetons), de
//     facturation Aurion et les flux réglementaires PA restent serveur ;
//   - les statuts/fonctions réglementaires (émission électronique, e-reporting) sont validés
//     par le backend au rejeu : le client n'a jamais d'état réglementaire autorisé localement ;
//   - toute requête passe par le contexte tenant (RLS 074, échec fermé) ; la projection est
//     en lecture seule (to_jsonb), jamais d'écriture directe sur ces tables depuis l'API.
export const SYNC_SCHEMA_VERSION = 3; // v3 : complétude Bloc 2 (086) // v2 : quote_items, journal, e-reporting ajoutés au registre (085)

// Bloc 2 — keyColumn : clé naturelle quand la table n'a pas de colonne `id` (ex. activity_id).
// Les exclusions restent justifiées ici : secrets/sessions/tokens (mail_accounts, google_oauth_states,
// webauthn_*, password_reset_tokens, email_verification_tokens, native_sessions, admin_*), domaine
// abonnement/compte (plans, subscriptions*, billing_*, vip_guest_accounts — géré par account-sync),
// numérotation réglementaire serveur (document_number_sequences — JAMAIS répliquée), tables sans
// organization_id (activity_contributions, supplier_parts, support_messages), fonctions retirées du
// produit (administrative_*), tables techniques (sync_*, schema_migrations, users, organizations).
export const SYNC_ENTITIES: Record<string, { table: string; orderColumn?: string; joinTable?: string; joinKey?: string; keyColumn?: string; label: string }> = {
  activities: { table: 'activities', label: 'Activités' },
  accounting_entries: { table: 'accounting_entries', label: 'Écritures comptables' },
  appointments: { table: 'appointments', label: 'Rendez-vous' },
  bank_transactions: { table: 'bank_transactions', label: 'Opérations bancaires' },
  client_intervention_addresses: { table: 'client_intervention_addresses', label: 'Adresses d\'intervention' },
  client_time_sessions: { table: 'client_time_sessions', label: 'Sessions de temps' },
  clients: { table: 'clients', label: 'Clients' },
  devices: { table: 'devices', label: 'Appareils' },
  document_price_memory: { table: 'document_price_memory', label: 'Mémoire de prix' },
  document_templates: { table: 'document_templates', label: 'Modèles de documents' },
  documents: { table: 'documents', label: 'Justificatifs (métadonnées)' },
  expense_reports: { table: 'expense_reports', label: 'Notes de frais' },
  fiscal_options_history: { table: 'fiscal_options_history', label: 'Historique des options fiscales' },
  generated_documents: { table: 'generated_documents', label: 'Documents générés' },
  interventions: { table: 'interventions', label: 'Interventions' },
  invoice_installments: { table: 'invoice_installments', label: 'Échéances' },
  invoice_payments: { table: 'invoice_payments', label: 'Paiements de factures' },
  invoice_reminders: { table: 'invoice_reminders', label: 'Relances' },
  ereporting_declarations: { table: 'ereporting_declarations', label: 'Déclarations de facturation électronique' },
  ereporting_events: { table: 'ereporting_events', label: 'Événements de facturation électronique' },
  ereporting_lines: { table: 'ereporting_lines', label: 'Lignes d\'e-reporting' },
  quote_items: { table: 'quote_items', joinTable: 'quotes', joinKey: 'quote_id', label: 'Lignes de documents (devis/factures)' }, // tenant via quotes (pas de organization_id propre)
  dashboard_journal_events: { table: 'dashboard_journal_events', label: 'Journal du tableau de bord' },
  organization_members: { table: 'organization_members', orderColumn: 'user_id', label: 'Membres de l\'organisation' },
  parts: { table: 'parts', label: 'Pièces' },
  quotes: { table: 'quotes', label: 'Devis et factures' },
  sav_cases: { table: 'sav_cases', label: 'Dossiers SAV' },
  suppliers: { table: 'suppliers', label: 'Fournisseurs' },
  supplies: { table: 'supplies', label: 'Consommables' },
  support_tickets: { table: 'support_tickets', label: 'Tickets de support' },
  user_drafts: { table: 'user_drafts', orderColumn: 'draft_key', label: 'Brouillons synchronisés' },
  warranties: { table: 'warranties', label: 'Garanties' },
  warranty_policies: { table: 'warranty_policies', label: 'Polices de garantie' },
  // Bloc 2 — complétude : données métier et configuration utile hors connexion (086).
  cloud_documents: { table: 'cloud_documents', label: 'Archivage cloud (métadonnées)' },
  document_themes: { table: 'document_themes', keyColumn: 'organization_id', orderColumn: 'organization_id', label: 'Thèmes de documents' }, // 1:1 par organisation (PK = organization_id)
  email_signatures: { table: 'email_signatures', keyColumn: 'organization_id', orderColumn: 'organization_id', label: 'Signatures d\'e-mail' }, // 1:1 par organisation
  electronic_invoice_profiles: { table: 'electronic_invoice_profiles', keyColumn: 'organization_id', orderColumn: 'organization_id', label: 'Profils de facturation électronique' }, // 1:1 par organisation
  notification_jobs: { table: 'notification_jobs', label: 'Rappels programmés' },
  payment_links: { table: 'payment_links', label: 'Liens de paiement des factures' },
  supplier_electronic_invoices: { table: 'supplier_electronic_invoices', label: 'Factures électroniques fournisseurs' },
  outgoing_electronic_invoices: { table: 'outgoing_electronic_invoices', label: 'Factures électroniques émises' },
  outgoing_transmission_events: { table: 'outgoing_transmission_events', label: 'Événements de transmission électronique' },
  bank_import_configs: { table: 'bank_import_configs', label: 'Configurations d\'import bancaire' },
  activity_profile_overrides: { table: 'activity_profile_overrides', joinTable: 'activities', joinKey: 'activity_id', keyColumn: 'activity_id', orderColumn: 'activity_id', label: 'Ajustements de profil d\'activité' }, // tenant via activities, clé naturelle activity_id
  activity_forecast_assumptions: { table: 'activity_forecast_assumptions', keyColumn: 'activity_id', orderColumn: 'activity_id', label: 'Hypothèses de prévision' },
  template_versions: { table: 'template_versions', joinTable: 'document_templates', joinKey: 'template_id', label: 'Versions de modèles' },
  support_status_events: { table: 'support_status_events', joinTable: 'support_tickets', joinKey: 'ticket_id', label: 'Événements de statut des tickets' },
};

/** Liste triée des entités répliquées (ordre stable pour les snapshots). */
export function syncEntityNames(): string[] { return Object.keys(SYNC_ENTITIES).sort(); }

/** Élagage borné du journal : le delta reste léger et la base maîtrisée. */
export async function pruneSyncJournal(orgId: string, keep = 200_000): Promise<void> {
  await query(
    `delete from sync_entity_changes where organization_id=$1 and id < (select min(id) from (select id from sync_entity_changes where organization_id=$1 order by id desc limit $2) s)`,
    [orgId, keep]
  );
}
