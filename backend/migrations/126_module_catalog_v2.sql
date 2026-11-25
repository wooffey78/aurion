-- V2 — catalogue de modules aligné sur le parcours d'accueil.
--
-- Le parcours proposait des fonctions (SAV, agenda, comptabilité, stock, chantiers,
-- contrats d'entretien, garanties, temps, appareils, portail client, facturation
-- électronique, prévisionnel) sans que les clés correspondantes existent dans la table
-- `modules`. Les activations étaient donc silencieusement perdues.
--
-- Cette migration est strictement additive et idempotente : elle ajoute les clés manquantes
-- sans modifier les lignes existantes, sans supprimer aucun module et sans toucher aux
-- activations déjà enregistrées dans `organization_modules`.
insert into modules(key,name,description,sort_order) values
  ('stock','Stock','Pièces, fournitures et seuils d’alerte.',30),
  ('support','SAV','Garanties, dossiers SAV et suivi des réparations.',40),
  ('agenda','Agenda','Rendez-vous, interventions planifiées et rappels.',45),
  ('accounting','Comptabilité','Encaissements, dépenses, notes de frais et exports.',55),
  ('chantiers','Chantiers','Regroupement d’ouvrages, rentabilité réelle et avancement.',65),
  ('maintenance','Contrats d’entretien','Contrats récurrents, échéances et reconductions.',66),
  ('warranty','Garanties','Politiques de garantie et rappels de couverture.',67),
  ('time_tracking','Temps passé','Sessions de temps par client et par intervention.',68),
  ('devices','Appareils et véhicules','Suivi des appareils, véhicules et installations du client.',69),
  ('portal','Portail client','Consultation des devis et acceptation en ligne.',75),
  ('einvoice','Facturation électronique','Préparation UBL/CII et plateforme agréée.',80),
  ('forecast','Prévisionnel','Horizon de facturation et hypothèses de charges.',85)
on conflict(key) do nothing;
