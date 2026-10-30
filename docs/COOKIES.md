# Politique relative aux cookies et stockages du navigateur — Aurion

> **PROJET DE DOCUMENT — NE PAS UTILISER POUR UNE COMMERCIALISATION.** Inventaire établi à partir du code du dépôt 15.3.16 le 30 octobre 2026. Vérifier les cookies réellement émis, les scripts tiers et les choix par navigateur sur le site de production avant publication.

**Éditeur : {{AURION_LEGAL_PUBLISHER_NAME}} — Contact : {{AURION_PRIVACY_CONTACT_EMAIL}} — Version projet : 2.1**

## 1. Cookies nécessaires

Le code examiné utilise les cookies suivants pour l’authentification et la protection de compte :

| Nom | Fonction | Durée technique maximale observée | Accès |
| --- | --- | --- | --- |
| aurion_session | Maintenir la session Aurion | 30 minutes | HttpOnly; Secure si la configuration l’active; SameSite=Strict |
| aurion_refresh | Renouveler une session native | 30 jours | HttpOnly; Secure si la configuration l’active; SameSite=Strict; chemin /auth |
| aurion_google_login | Protéger une transaction de connexion Google contre la falsification | 10 minutes | HttpOnly; Secure selon configuration; SameSite=Lax; chemin de rappel Google |

Ces cookies sont utilisés pour fournir une fonction expressément demandée et sécuriser l’accès. Leur blocage ou leur suppression peut déconnecter l’utilisateur ou empêcher la connexion.

## 2. Stockage local dans le navigateur

Le dépôt utilise aussi le stockage local du navigateur pour mémoriser notamment l’adresse e-mail du dernier compte utilisé, l’activité sélectionnée, la préférence d’affichage de la proposition de clé d’accès et une révision de synchronisation. Ces éléments ne sont pas des cookies et restent sur le terminal, jusqu’à leur suppression par l’utilisateur ou le navigateur. Effacer le stockage local peut réinitialiser les préférences ou demander une nouvelle connexion.

Aurion peut être installable comme application web progressive. Le fonctionnement hors ligne et les éléments mis en cache doivent être vérifiés sur la version réellement déployée.

## 3. Mesure d’audience, publicité et intégrations

L’examen du dépôt n’a pas révélé de bibliothèque de mesure d’audience ou de publicité. Cette vérification du code ne garantit pas l’absence d’un traceur ajouté par une configuration de production, un contenu externe ou une mise à jour. L’éditeur doit exécuter un contrôle navigateur de production avant publication et après toute modification d’intégration.

Tout traceur qui n’est pas strictement nécessaire doit être bloqué avant le consentement. Le visiteur doit pouvoir accepter, refuser aussi simplement, connaître les finalités et retirer son choix avec une facilité équivalente. Le consentement est enregistré selon les règles applicables.

## 4. Gérer ou supprimer les données

L’utilisateur peut supprimer les cookies et données de site dans les réglages de son navigateur. La suppression peut le déconnecter et effacer ses préférences locales. Les réglages du navigateur ne suppriment pas les données hébergées sur le compte Aurion.

Pour les demandes relatives aux données personnelles : {{AURION_PRIVACY_CONTACT_EMAIL}}. Les choix concernant des traceurs non essentiels, s’ils sont ajoutés, devront être disponibles depuis un lien de gestion accessible à tout moment.
