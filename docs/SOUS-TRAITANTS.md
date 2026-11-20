# Sous-traitants techniques — liste réelle et modèles de clauses (bloc 20)

## Liste établie à partir de la configuration réelle

La liste publique est servie par `GET /transparency` (sans compte) et **calculée depuis la
configuration effective** (`render.yaml`, variables d'environnement) : un sous-traitant n'est
marqué « actif » que si sa configuration est réellement présente. Le test
`bloc20-transparency.test.mjs` vérifie automatiquement la cohérence entre la liste servie et
les variables réelles.

| Sous-traitant | Rôle | Région | Activation |
|---|---|---|---|
| Render | Hébergement du service applicatif (blueprint unique `aurion`) | Francfort (UE) — instance historique Oregon hors blueprint, à supprimer après bascule | permanent |
| PostgreSQL géré (Render) | Base de données | région des services | permanent |
| Google Drive | Archivage cloud personnel de l'utilisateur | région du compte de l'utilisateur | si OAuth Google configuré |
| Messagerie SMTP | Envoi des documents/relances | serveur choisi par l'utilisateur | configuration utilisateur |
| Prestataire de paiement | Règlements clients (D3) | à définir | seulement si `AURION_PAY_PROVIDER` |
| Plateforme agréée | Facturation électronique | à définir | seulement si `AURION_PA_PROVIDER` |
| Stripe | Abonnement Aurion lui-même (jamais les factures clients) | Stripe | si `STRIPE_SECRET_KEY` |

## Modèle de clauses de sous-traitance (ARTICLE 28 — PROJET)

> **AVERTISSEMENT** : ce modèle n'est PAS présenté comme conforme RGPD. Une revue juridique
> complète est obligatoire avant toute publication ou signature.

1. **Objet** : le sous-traitant traite les données pour le compte du responsable uniquement
   sur instructions documentées.
2. **Localisation** : les régions ci-dessus ; tout transfert hors UE exige des garanties
   documentées (CCT + mesures complémentaires).
3. **Sécurité** : chiffrement au repos AES-256-GCM pour les secrets, isolation par RLS,
   authentification obligatoire, journaux d'accès administrateur.
4. **Sous-sous-traitance** : autorisation écrite préalable ; liste maintenue à jour sur
   `GET /transparency`.
5. **Réversibilité** : restitution des données en formats ouvrables (CSV/JSON/fichiers
   d'origine) sans frais ; effacement à la fin du contrat avec délai de conservation
   documenté (obligations comptables).
6. **Incidents** : notification sous 48 h, sans contenu de facture ni donnée personnelle
   dans les alertes.
7. **Audit** : la matrice « Sécurité et contrôles » (`GET /transparency`) fait foi pour
   l'état réel : implémentée et testée / partielle / absente / non vérifiée.

## Durées de conservation (à faire confirmer juridiquement)

- Données actives : pendant la durée de l'abonnement.
- Fin d'abonnement → statut « expired » ; à +60 jours : lecture seule
  (`data_read_only_until`) ; les pièces comptables et factures obéissent aux obligations
  de conservation des documents commerciaux (durée exacte à confirmer juridiquement).
- Journaux techniques : rétention à définir au bloc 24 (observabilité).
