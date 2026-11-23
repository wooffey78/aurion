-- 120 — 15.4.53 (PROMPT C2) — Instantané des mentions légales appliquées à l'émission.
-- Additive et idempotente. À chaque émission de facture réussie, le tableau de mentions
-- calculé (provenance incluse) est sérialisé en JSONB : la facture émise reste reproductible
-- à l'identique même si les paramètres de l'entreprise évoluent ensuite. Grandfathering :
-- les documents émis avant 15.4.53 n'ont pas d'instantané (colonne NULL, aucun re-contrôle).
alter table quotes add column if not exists mentions_snapshot jsonb null;
