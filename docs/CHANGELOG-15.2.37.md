# Aurion 15.2.37

- Séparation réelle du prix de vente main-d’œuvre et du coût interne dans le formulaire devis/facture.
- Le coût interne est enregistré dans le brouillon et transmis au backend sans modifier le TTC client.
- Test de non-régression : le coût interne réduit la marge, mais pas le TTC fixé.
