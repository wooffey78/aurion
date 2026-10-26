// API centrale d'Aurion : le même backend sert de source de vérité pour Web, PWA,
// desktop et futurs clients mobiles. Une application native pourra remplacer cette valeur
// par sa configuration sécurisée sans changer les routes métier.
const PROD_API='https://aurion-pt0l.onrender.com';
const local=['localhost','127.0.0.1'].includes(location.hostname);
window.AURION_API_URL=window.AURION_API_URL ?? (local?'http://127.0.0.1:4000':(location.hostname==='aurion-pt0l.onrender.com'?'':PROD_API));
window.AURION_PRODUCTION_API_URL=PROD_API;
