# CHANGELOG — 15.4.61

## Les 10 évolutions et corrections demandées

### 1 · Compteur de temps économisé — démarrage automatique partout
- La création d'une fiche client déclenche désormais le compteur **dans toutes les voies** : liste clients (déjà le cas) **et création directe dans un devis/facture** (`createClientForDocument` insère la session « running », estimation de la fiche si renseignée). Toast informatif après création ; badge de fiche inchangé (état réel, pause ⇄ relance).

### 2 · Prévision de facturation — comportement corrigé
- **« 1 mois » ne compte plus tous les devis ouverts comme signés le mois suivant** (l'ancien `month1 = devis ouverts` gonflait artificiellement la projection) : réalisé du mois + moyenne historique HT. Les horizons 3/6 mois et année conservent les devis ouverts comme potentiel, affiché séparément en trésorerie.
- La moyenne historique **croise paiements détaillés et factures payées** (voir 9) : elle n'est plus à 0 pour les activités dont les factures sont marquées payées sans ligne de paiement.

### 3 · Pièce proposée automatiquement — modifiable et supprimable
- Les redraws périodiques (détection de prestation, 350 ms) **préservent les saisies non validées** (synchronisation DOM → état avant reconstruction) : les quantités/coûts saisis ne sont plus écrasés.
- Une pièce retirée n'est **plus ré-ajoutée** automatiquement au changement de prestation.

### 4 · Carrousel des modèles — espacement desktop plus conséquent
- Anneau plus profond (rz plafonné à 400px) et cartes plus écartées latéralement (rx plafonné à 280px, coefficient 1.35) : plus d'air entre les cartes sur grand écran, plans conservés sur mobile.

### 5 · Aperçu taille réelle — débloqué
- Cause : CSP globale `frame-ancestors 'none'` bloquait l'intégration du PDF même en même origine (« aurion-2hye.onrender.com n'autorise pas la connexion »). Passée à **`'self'`** (les iframes tiers restent interdits) sur la CSP globale et sur le PDF généré. La modale utilise désormais un **iframe** + un bouton **« Ouvrir dans un onglet »** (repli garanti) + téléchargement + validation.

### 6 · Administration → Invitation — design Aurion
- Le champ e-mail de l'invité est un vrai champ Aurion (label.field, autocomplete, ligne flex alignée avec le bouton).

### 7 · Menu déroulant des prestations — repli garanti
- Le focus (re-rendu, clavier) ne rouvre plus une valeur venant d'être choisie ; **Entrée sans option active replie la liste** (et ne soumet plus le formulaire par inadvertance) ; le commit sans sélection (flou) replie.

### 8 · Téléversement de modèles personnels — supprimé
- Les sections « Modèles personnels » et « Modèles personnels actifs », les handlers, les méthodes API (`uploadTemplate`, `deleteTemplate`, `templateStatus`, `documentTemplates`) et les 4 routes serveur (`GET/POST /document-templates*`, `DELETE /document-templates/:id`) sont retirés. **Les modèles déjà téléversés restent rendus** côté serveur (table conservée) ; l'anneau des 8 modèles natifs est la seule mise en page proposée.

### 9 · Comptabilité — moteur croisé, encarts remplis
- Cause racine 1 : le moteur de trésorerie ne lisait que `invoice_payments` — les factures marquées payées **sans ligne de paiement** (saisie directe, import de données Excel) pesaient 0 €. Le moteur mensuel **unionne** désormais paiements détaillés ∪ factures payées (montant `amount_paid`, date `paid_at` → repli `updated_at/created_at`), sans double comptage. Encaissements HT, TVA encaissée, Cotisations estimées, Factures encaissées, Kilométrage sur factures se remplissent ; les exports comptables (CSV, FEC, livre de recettes) héritent du même moteur.
- Cause racine 2 : la resynchronisation des encarts (`account-sync`) appelait `/accounting/summary` **sans l'en-tête d'activité** — les encarts étaient écrasés par les chiffres d'une autre activité (souvent 0). L'activité sélectionnée est désormais transmise.

### 10 · Chantiers filtrés par métier (retour) + Stripe/Tiime en pied de page
- Retour au fonctionnement **antérieur à 15.4.59** (demande utilisateur : le masquage était « finalement une bonne chose ») : l'entrée Chantiers est masquée quand le catalogue profile-features la déclare hors cœur (appariement par mots-clés rétabli, repli hors connexion et liste « ce que ce métier n'affiche pas » conformes).
- **Pied de page global sur toutes les pages** (hors conteneur SPA, visible y compris sur la landing et les pages légales) : liens Documents légaux, Conditions de vente, Transparence & réversibilité, et les partenaires **Facturation électronique : Tiime** (lien officiel tiime.fr) et **Paiements sécurisés : Stripe** — mention discrète au design Aurion (prompt maître §17).

### Version
- **15.4.61** harmonisé (VERSION.txt, backend/VERSION.txt, manifestes, lockfiles, sw.js, index.html). Aucune migration SQL ; aucune donnée détruite ; base de publication : 15.4.60 (`a2a8e65`).
