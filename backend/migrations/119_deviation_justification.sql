-- 119 — 15.4.51 (PROMPT B2) — Garde-fou de dérive devis→facture : justification horodatée
-- de la dérive. Additive et idempotente. La justification est saisie par l'utilisateur dans la
-- fenêtre d'émission lorsque la facture s'écarte de plus du seuil (10 %) du devis source ; elle
-- est conservée avec les rubriques comparées pour l'audit. Aucune donnée historique modifiée.
alter table quotes add column if not exists deviation_justification text null;
alter table quotes add column if not exists deviation_justified_at timestamptz null;
alter table quotes add column if not exists deviation_rubrics jsonb null;
