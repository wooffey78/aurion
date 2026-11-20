// API centrale d'Aurion : le même backend sert de source de vérité pour Web, PWA, desktop et
// clients natifs. Bloc 1 : plus aucune URL de production codée en dur dans les sources — l'URL
// canonique vient de l'environnement serveur (APP_BASE_URL injectée dans <meta name="aurion-api-base">).
// Ordre de résolution :
//   1. window.AURION_API_URL posé AVANT ce script par une enveloppe native (Capacitor) ou un test ;
//   2. <meta name="aurion-api-base"> injectée par le backend (cf. backend/src/app.ts, APP_BASE_URL) ;
//   3. même origine — navigation http(s) : l'interface et l'API partagent le domaine
//      (OVHcloud Francfort en production, Render gratuit temporaire en démonstration) ;
//   4. repli documenté pour les contextes sans origine HTTP (ouverture directe du fichier) sans
//      configuration injectée : l'URL de démonstration Render actuelle — valeur provisoire tant que
//      le domaine OVH n'est pas provisionné (docs/MIGRATION-RENDER-OVH.md). Ne jamais y mettre de
//      nouvelle URL sans provisionnement réel.
const DEMO_FALLBACK_API='https://aurion-2hye.onrender.com';
const local=['localhost','127.0.0.1'].includes(location.hostname);
const noHttpOrigin=!/^https?:$/.test(location.protocol);
const metaBase=document.querySelector('meta[name="aurion-api-base"]')?.content?.trim()||'';
window.AURION_API_URL=window.AURION_API_URL ?? (noHttpOrigin?(metaBase||DEMO_FALLBACK_API):(local&&location.port!=='4000'?'http://127.0.0.1:4000':''));
window.AURION_PRODUCTION_API_URL=metaBase||DEMO_FALLBACK_API;
