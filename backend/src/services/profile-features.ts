// 15.4.50 (modularité demandée) — Fonctionnalités proposées selon le MÉTIER de l'activité.
// Le moteur rend explicite la cohérence métier : une fonctionnalité n'est PROPOSÉE que si
// elle a du sens pour le profil de l'activité active (modules du profil = déclarés dans
// services/profiles.ts, catalogue versionné 2026.11). Déterministe, testé, sans IA :
// l'appariement repose sur les modules du profil et des mots-clés de son libellé, avec un
// comportement sûr par défaut (fonctionnalités core toujours disponibles, extensions gated).
import { profileFor, PROFILE_CODES } from './profiles.js';

export type FeatureKey =
  | 'chantiers'            // regroupement d'ouvrages et rentabilité réelle (B1)
  | 'maintenance'          // contrats d'entretien récurrents (B2)
  | 'stock_locations'      // emplacements atelier/camion (A6)
  | 'client_portal'        // portail client et acceptation de devis (A1/A2)
  | 'warranty_workflows'   // rappels de garanties et SAV
  | 'time_tracking'        // sessions de temps par intervention
  | 'device_tracking';     // appareils/véhicules/installations du client

export interface ProfileFeatures {
  profileCode: string;
  profileTitle: string;
  features: Record<FeatureKey, boolean>;
  /** Ce qui est masqué et pourquoi — affiché honnêtement plutôt que silencieux. */
  hidden: Array<{ key: FeatureKey; reason: string }>;
}

const CORE: FeatureKey[] = ['client_portal', 'chantiers'];

/** Appariement déterministe documenté. Fonction PURE — testée sans base. */
export function featuresForProfile(profileCode: string): ProfileFeatures {
  // profileFor est un détecteur par nom : le CODE est passé en override pour lire la
  // définition exacte du catalogue (title + modules), sans réinférer un profil.
  let profile: ReturnType<typeof profileFor> | null = null;
  try { profile = profileFor(profileCode, '', profileCode); } catch { profile = null; }
  if (!profile || profile.code !== profileCode) {
    // Profil inconnu : comportement sûr — core seul, tout le reste masqué avec raison.
    const features = Object.fromEntries(
      ['maintenance', 'stock_locations', 'warranty_workflows', 'time_tracking', 'device_tracking'].map(k => [k, false]),
    ) as Record<FeatureKey, boolean>;
    features.client_portal = true;
    features.chantiers = true; // 15.4.59 — capacité core, même pour un profil non reconnu.
    return { profileCode, profileTitle: '', features, hidden: [] };
  }
  const title = String(profile.title || '').toLowerCase();
  const modules = (profile.modules || []).map((m: string) => String(m).toLowerCase());
  const has = (needle: string) => modules.some(m => m.includes(needle)) || title.includes(needle);

  // 15.4.59 — Chantiers redevient une capacité CORE (demande utilisateur) : la rentabilité
  // réelle par ouvrage est proposée quel que soit le métier ; elle n'apparaît plus dans la
  // liste « ce que ce métier n'affiche pas ». (Ancien appariement par mots-clés retiré.)
  const chantiers = true;
  // Maintenance : métiers d'entretien récurrent identifiés par mots-clés du libellé.
  const maintenance = /chauffage|plomberie|clim|cvc|entretien|jardin|piscine|serrure|vitrerie|nettoyage|informatique|domotique|bronch|ramonage/.test(title);
  const stockLocations = has('pièce') || has('piece') || has('matériel') || has('materiel') || has('composant');
  const warranty = has('garantie');
  const timeTracking = has('installation') || has('véhicule') || has('intervention') || has('prestation') || has('projets');
  const deviceTracking = has('appareil') || has('véhicule') || has('installation') || has('ordinateur') || has('matériel') || has('materiel') || has('fiche de suivi');

  const features: Record<FeatureKey, boolean> = {
    chantiers, maintenance, stock_locations: stockLocations,
    client_portal: true, warranty_workflows: warranty, time_tracking: timeTracking, device_tracking: deviceTracking,
  };
  const labels: Record<FeatureKey, string> = {
    chantiers: 'Chantiers et rentabilité réelle',
    maintenance: 'Contrats d\'entretien récurrents',
    stock_locations: 'Emplacements de stock (atelier, camion)',
    client_portal: 'Portail client',
    warranty_workflows: 'Suivi des garanties',
    time_tracking: 'Temps passé par intervention',
    device_tracking: 'Suivi d\'appareils/véhicules client',
  };
  const hidden = (Object.keys(features) as FeatureKey[])
    .filter(k => !features[k] && !CORE.includes(k))
    .map(k => ({ key: k, reason: `Non proposé pour le métier « ${profile.title} » : la fonction « ${labels[k]} » n'a pas de sens pour ses modules (${(profile.modules || []).join(', ') || 'aucun'}).` }));
  return { profileCode, profileTitle: profile.title, features, hidden };
}

/** Codes de profils couverts (réexport stable pour les tests et les routes). */
export const FEATURE_PROFILE_CODES = PROFILE_CODES;
