-- 15.4.67 — consignes éditeur :
-- 1) photo de fiche client : l'avatar téléversé (stockage privé, même chaîne que l'avatar du
--    compte) remplace les initiales dans la bulle à côté du nom (fiche + liste des clients).
-- 2) fenêtre de grâce des sessions de rafraîchissement : un refresh token fraîchement roté
--    reste accepté 60 secondes — deux onglets qui rafraîchissent en parallèle ne se révoquent
--    plus en chaîne (fin des déconnexions « votre session a expiré » en usage multi-onglets).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_key text;
ALTER TABLE native_sessions ADD COLUMN IF NOT EXISTS grace_until timestamptz;
