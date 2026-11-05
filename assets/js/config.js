// API centrale d'Aurion : le même backend sert de source de vérité pour Web, PWA,
// desktop et futurs clients mobiles. Une application native pourra remplacer cette valeur
// par sa configuration sécurisée sans changer les routes métier.
// 15.4.0 : le backend Render sert lui-même l'interface ; l'API est donc la même origine sur TOUS les services
// (Frankfurt `aurion`, Oregon `aurion-web` ou domaine personnalisé). L'URL absolue ne sert qu'aux contextes
// sans origine HTTP (fichier local, enveloppe native) : elle pointe vers le service commercial Frankfurt.
const PROD_API='https://aurion-2hye.onrender.com';
const local=['localhost','127.0.0.1'].includes(location.hostname);
const noHttpOrigin=!/^https?:$/.test(location.protocol);
window.AURION_API_URL=window.AURION_API_URL ?? (noHttpOrigin?PROD_API:(local&&location.port!=='4000'?'http://127.0.0.1:4000':''));
window.AURION_PRODUCTION_API_URL=PROD_API;
