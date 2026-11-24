// Corps de calibrage : combinaisons nom/description/NAF courantes du micro-entrepreneur.
// Source unique partagée par le contrat backend/tests/v2-profile-calibration.contract.test.mjs
// et l'outil tools/calibration-replay.mjs (chantier 3, 15.4.44) — 15.4.55 : fixture restaurée
// après perte lors d'un packaging (le corpus documenté en CHANGELOG-15.4.46 est rejoué à
// l'identique : chaque cas vérifie la proposition de métier en tête et, le cas échéant,
// son niveau de confiance et le rapprochement du code NAF).
//
// Format CASES : [id, nom, description, code NAF (null si inconnu), profil attendu, confiances acceptées ?]
// Format NAF_HINT_CASES / NAF_HINT_STABLE_CASES : [code APE/NAF, profil attendu].

export const CASES = [
  ['r01', 'Réparation d’écrans de smartphones', 'Remplacement d’écrans, batteries et connecteurs de charge, vente d’accessoires', '95.25A', 'smartphone-repair', ['tres-eleve', 'eleve']],
  ['r02', 'Atelier info 44', 'Dépannage et maintenance d’ordinateurs, récupération de données', '95.11Z', 'computer-repair', ['tres-eleve', 'eleve']],
  ['r03', 'Plomberie Durand', 'Réparation de fuites, remplacement de chauffe-eau et robinetterie', '43.22A', 'plumbing', ['tres-eleve', 'eleve']],
  ['r04', 'Élec-Rénov', 'Installation électrique, mise aux normes NF C 15-100, domotique', '43.21Z', 'electrical', ['tres-eleve', 'eleve']],
  ['r05', 'Toiture du Sud', 'Couverture, rénovation de toiture et zinguerie', '43.91A', 'building', ['tres-eleve', 'eleve']],
  ['r06', 'Carrelage & Faïence', 'Pose de carrelage et revêtement de sols et murs', '43.33B', 'building', null],
  ['r07', 'Garage Méca-Plus', 'Mécanique et réparation de véhicules, vidange, distribution', '45.20A', 'auto', ['tres-eleve', 'eleve']],
  ['r08', 'Taxi Amélie', 'Transport de voyageurs en taxi et VTC', '49.32A', 'transport', ['tres-eleve', 'eleve']],
  ['r09', 'Rapid Colis', 'Transport routier de marchandises et livraison', '49.41B', 'transport', ['tres-eleve', 'eleve']],
  ['r10', 'Studio Coiffure', 'Coiffure, coloration et soins de beauté', '96.02A', 'beauty', ['tres-eleve', 'eleve']],
  ['r11', 'Institut Équilibre', 'Soins esthétiques, épilation et maquillage', '96.04B', 'beauty', ['eleve', 'moyen']],
  ['r12', 'Propreté Services', 'Nettoyage courant des bâtiments et vitrerie', '81.21Z', 'cleaning', ['tres-eleve', 'eleve']],
  ['r13', 'Jardins Fleury', 'Aménagement paysager et entretien d’espaces verts', '81.30C', 'cleaning', ['tres-eleve', 'eleve', 'moyen']],
  ['r14', 'Web Atelier', 'Création de sites internet, développement web et SaaS', '62.01Z', 'web-development', ['tres-eleve', 'eleve']],
  ['r15', 'Maintenance Soft', 'Maintenance et gestion d’infrastructures informatiques', '62.09A', 'web-development', null],
  ['r16', 'Objectif Photo', 'Photographie de portraits, mariages et reportages', '74.20Z', 'creative', ['tres-eleve', 'eleve']],
  ['r17', 'Son & Lumière', 'Sonorisation et éclairage de concerts et soirées', '90.01A', 'music-audio', ['eleve', 'moyen']],
  ['r18', 'Mots & Langues', 'Traduction et interprétation français-anglais', '74.30A', 'writing', ['eleve', 'moyen']],
  ['r19', 'Délices Traiteur', 'Traiteur, buffets et cocktails pour événements', '56.21Z', 'catering', ['tres-eleve', 'eleve']],
  ['r20', 'La Cantine Mobile', 'Restauration rapide et food truck', '56.10A', 'catering', ['eleve', 'moyen']],
  ['r21', 'Coach Vitalité', 'Coach sportif, remise en forme et préparation physique', '93.19Z', 'sport', ['eleve', 'moyen']],
  ['r22', 'Cours à Domicile 17', 'Cours de soutien scolaire et tutorat à domicile', '85.32A', 'lessons', null],
  ['r23', 'Ferme du Verger', 'Maraîchage et vente directe de légumes', '01.13Z', 'agriculture', null],
  ['r24', 'Domaine des Vignes', 'Chambres d’hôtes et location saisonnière de meublés', '55.20A', 'hospitality', null],
];

/** Hints NAF ajoutés (15.4.36) : résolution directe depuis le code du registre. */
export const NAF_HINT_CASES = [
  ['88.10', 'home-care'],
  ['01.13', 'agriculture'],
  ['55.20', 'hospitality'],
  ['68.31', 'real-estate'],
  ['80.10', 'security'],
  ['90.01', 'music-audio'],
  ['47.91', 'retail'],
  ['74.30', 'writing'],
  ['31.09', 'handcraft'],
];

/** Hints déjà couverts par les versions antérieures : stabilité (aucune régression). */
export const NAF_HINT_STABLE_CASES = [
  ['95.11', 'computer-repair'],
  ['43.22', 'plumbing'],
  ['43.21', 'electrical'],
  ['96.02', 'beauty'],
  ['96.01', 'cleaning'],
  ['62.01', 'web-development'],
  ['74.20', 'creative'],
  ['56.21', 'catering'],
  ['85.59', 'lessons'],
  ['49.32', 'transport'],
];
