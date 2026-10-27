# Vérification d'adresse e-mail — configuration et exploitation

## Variables requises sur Render

Dans le service backend Aurion, ouvrir **Environment** et définir les valeurs suivantes. Ne pas copier de secrets dans GitHub ni dans les journaux.

- `APP_BASE_URL`: URL HTTPS publique de l'application, sans chemin, par exemple `https://aurion-2hye.onrender.com`.
- `PLATFORM_SMTP_HOST`: serveur SMTP transactionnel.
- `PLATFORM_SMTP_PORT`: port du fournisseur SMTP (souvent 465 ou 587).
- `PLATFORM_SMTP_SECURITY`: `ssl` pour TLS implicite, `starttls` pour STARTTLS, ou `none` uniquement pour un relais interne.
- `PLATFORM_SMTP_USER` et `PLATFORM_SMTP_PASS`: identifiants SMTP si le fournisseur l'exige.
- `PLATFORM_SMTP_FROM`: adresse expéditrice autorisée par le fournisseur.

Cliquer sur **Save, rebuild, and deploy**. Tant que l'expédition SMTP ou `APP_BASE_URL` n'est pas configurée, l'inscription est refusée proprement, plutôt que de créer un compte inutilisable sans lien de vérification.

## Fonctionnement et sécurité

1. L'inscription crée un compte non vérifié et envoie un jeton aléatoire à durée de vie de 30 minutes. Seul son condensat SHA-256 est conservé en base.
2. Le mot de passe ne permet pas de se connecter avant la confirmation. Le lien affiche une page Aurion qui consomme le jeton par POST après une action explicite; les prévisualisateurs de liens n'invalident donc pas le jeton par simple lecture.
3. Les jetons sont à usage unique. Une nouvelle demande consomme les anciens jetons actifs.
4. La confirmation incrémente `session_version` et révoque les sessions de rafraîchissement existantes.
5. Si Google authentifie une adresse vérifiée correspondant à un compte Aurion non vérifié, Aurion change le hachage du mot de passe en une valeur aléatoire inutilisable, marque l'adresse vérifiée, incrémente `session_version` et révoque les sessions avant d'ouvrir l'espace. Un mot de passe qu'un tiers aurait choisi pour cette adresse ne permet donc plus de se reconnecter.
6. Si le compte possède plusieurs organisations, la connexion Google ne sélectionne plus arbitrairement la première organisation. Elle demande de passer par le chemin de connexion habituel plutôt que de donner accès à un espace choisi arbitrairement.

## Migration

Le fichier `backend/migrations/061_email_verification.sql` est une nouvelle migration additive. Ne jamais modifier les fichiers SQL déjà enregistrés dans `schema_migrations` : le moteur valide leurs sommes de contrôle et arrête le déploiement si une migration appliquée est modifiée.
