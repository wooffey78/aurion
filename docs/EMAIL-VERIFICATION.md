# Vérification d’adresse e-mail — fonctionnalité désactivée

Le flux de vérification d’adresse e-mail a été retiré de l’application dans Aurion 15.2.50 à la demande du propriétaire du projet.

- Les inscriptions et connexions utilisent de nouveau le flux antérieur, sans confirmation par e-mail.
- La migration historique `061_email_verification.sql` est conservée inchangée pour respecter les sommes de contrôle des migrations déjà appliquées.
- La migration additive `062_disable_email_verification.sql` retire la table et la colonne temporaires créées par la migration 061.
- Aucune variable SMTP propre à ce flux n’est requise pour les inscriptions.

Ne pas réactiver ce flux ni réintroduire ses schémas sans demande explicite.
