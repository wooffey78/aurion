# Guide d’identité visuelle exportée par Aurion

Aurion exporte un kit à partir des actifs et du thème enregistrés pour l’organisation authentifiée. Le bundle est produit à la demande et ne lit pas de chemins fournis par le navigateur.

## Fichiers

- `logo/logo-principal.*` : fichier PNG ou JPEG enregistré dans Aurion, lorsqu’il existe et peut être lu.
- `logo/formats/logo-*.png` et `logo/favicon.ico` : tailles PNG prêtes pour les icônes et le Web, générées depuis un PNG carré ou horizontal non entrelacé 8 bits supporté. Les variantes raster ne sont pas produites depuis un JPEG ni un PNG entrelacé ou palette.
- `logo/variantes/*.svg`, `logo/icone-carree.svg`, `favicon.svg` : présentations SVG qui incorporent l’image originale. Elles adaptent le cadre et le fond ; elles ne vectorisent pas le dessin.
- `logo/variantes/logo-monochrome-*.svg` : fournis uniquement lorsqu’un PNG non entrelacé pris en charge a des pixels alpha transparents vérifiés. Les pixels sont décodés après contrôle des CRC et des filtres PNG. Les images JPEG, les PNG entrelacés ou les autres modes couleur ne produisent pas ces variantes.
- `palette.json` : thème et palette déjà utilisés par le bundle Aurion.
- `brand/tokens.css` : variables CSS dérivées de l’accent, de la couleur sombre, de la famille typographique et du rayon de document enregistrés.
- `brand/guide-identite.html` : aperçu adaptatif et imprimable, palette avec rapports de contraste calculés, éléments réellement présents, typographie système et règles d’utilisation prudentes.
- `signature/` : signature HTML/texte enregistrée, lorsqu’elle existe.
- `brand/guide-identite.pdf` : guide d’une page prêt à partager ou imprimer, avec le logo enregistré, la palette, le thème et les règles d’usage.
- `README.md` ou `README.txt` : manifeste du contenu présent et limites des variantes.

Sans logo, Aurion conserve les guides et les tokens du thème, indique l’absence du logo dans le manifeste et ne liste pas de variantes inexistantes. La police n’est pas embarquée ; seuls des noms de familles système sont exportés. Aucune taille minimale ou zone de protection n’est inventée : elles doivent être déterminées après examen du dessin final. Le PDF est une fiche pratique ; le logo matriciel fourni n’est pas redessiné ni agrandi en vectoriel natif.

## Contrôle avant utilisation

1. Ouvrir `brand/guide-identite.html` depuis l’extraction du ZIP afin que les aperçus relatifs puissent charger les fichiers du dossier `logo/`.
2. Vérifier le contraste, le cadrage et la lisibilité des variantes à leur taille réelle, en particulier le favicon.
3. Faire créer une version vectorielle native par un graphiste si une livraison vectorielle est nécessaire.
4. Vérifier les signatures avant réutilisation dans un autre service de messagerie.

Aurion ne remplace pas automatiquement les anciens documents et ne modifie pas les devis ou factures déjà émis lorsqu’un logo est changé.
