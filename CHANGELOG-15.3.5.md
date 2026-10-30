# Aurion 15.3.5

## Améliorations

- Le tutoriel de création propose désormais un vrai choix « Je ne sais pas encore » et un parcours de préparation plus détaillé pour une création future, avec date envisagée, clients, lieu d’exercice et estimation de ressources.
- Ajout d’un diagnostic des clés IA au parcours. Il indique quelles intégrations sont activées côté serveur, sans afficher les secrets ni faire d’appel fournisseur payant.
- La configuration Google vérifie maintenant la présence de l’ID, du secret OAuth, de l’URL de retour et de la clé de chiffrement avant d’annoncer le service prêt. Les erreurs indiquent les noms des variables à compléter.
- Le kit d’identité visuelle inclut un guide PDF d’une page conçu à partir du logo et du thème réellement enregistrés, aussi dans l’export global des données.
- Les logos PNG supportés reçoivent des variantes 512/256/128/64/32 px et un favicon ICO contenant le même dessin redimensionné ; les JPEG gardent le fichier original et les adaptations SVG/PDF.
- Correction du texte de confidentialité SMTP : le mot de passe est transmis puis chiffré dans la base du serveur et n’est pas conservé uniquement sur l’appareil.
- Ajout d’une fiche de préparation au processus Android/Play Store et mise à jour du cache PWA.

## Limites d’activation

Les clés API, les identifiants Google OAuth, les comptes SMTP, le domaine de production, le compte Play Console et les clés de signature appartiennent à l’éditeur. Cette archive n’en invente ni n’en embarque aucun. Une présence de variable ne garantit pas la validité de la clé ou l’accès au fournisseur. Les envois et la lecture Gmail doivent être validés avec des comptes de recette avant commercialisation. Le dépôt ne produit pas encore un paquet Android `.aab` signé ; voir [la préparation Play Store](docs/PREPARATION-PLAY-STORE.md).
