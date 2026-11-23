# PROMPT 07 — Devis, factures et cycle commercial

Audite le cycle existant avant tout changement : numérotation, PDF, modèles, mentions, taxes, instantanés de taux, envoi, relances, avoirs, paiements partiels, acomptes, échéanciers et liens de paiement. Réutilise notamment les structures existantes `invoice_payments`, `invoice_installments`, `calculateInvoicePayment()` et `allocateInstallmentPayments()` lorsqu'elles sont présentes.

Unifier le cycle prospect/client→devis→acceptation/refus/expiration→préparation de prestation→facture→émission→paiements→relances→clôture/avoir. Les transitions sont explicites, auditées, autorisées et idempotentes. Un devis accepté ne crée pas silencieusement plusieurs interventions. La facturation d'une intervention reprend ses éléments validés.

Distinguer brouillon, document validé, émis, transmis, payé partiellement, payé, en retard, annulé/avoir selon les règles métier. Les montants payé et restant dû sont calculés depuis les paiements enregistrés, jamais depuis un champ libre indépendant. Aucun paiement partiel ne vaut paiement complet. Les relances cessent lorsque la situation est régularisée ; les pénalités et majorations suivent des règles configurées et validées.

Les données d'un document émis doivent rester historisées et immuables selon les obligations applicables. Le portail client, la comptabilité, le dashboard, les événements et le système documentaire utilisent les mêmes identifiants et statuts.

Tester numérotation concurrente, arrondis, TVA, remises, paiement multiple/partiel, remboursement, avoir, annulation, relance, envoi échoué, réédition PDF, historique et droits. Ne jamais afficher un envoi réussi sans confirmation réelle du service.
