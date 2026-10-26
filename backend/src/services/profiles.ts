/**
 * Profils métier Aurion : « à chaque métier son Aurion ».
 * Un profil fixe : le vocabulaire (devis, documents), le catalogue proposé (prestations avec durées, pièces),
 * la forme du calculateur, et le vocabulaire des dossiers (appareils, véhicules, chantiers…).
 */
export interface Profile {
  code: string; title: string; summary: string;
  clientLabel: string; itemLabel: string; serviceLabel: string; deviceLabel: string; quoteLabel: string;
  modules: string[]; suggestedParts: string[]; suggestedServices: string[]; serviceMinutes: Record<string, number>;
  doc: { interventionLabel: string; itemsLabel: string; quantityLabel: string; quoteTitle: string; invoiceTitle: string };
  calc: { items: boolean; itemsTitle: string; itemPlaceholder: string; shipping: boolean; shippingLabel: string; hint: string };
  warranty: string[];
}
type Def = {
  title: string; summary: string; item: string; service: string; device: string; quote: string; modules: string[];
  services: [string, number][]; parts: string[]; warranty: string[];
  doc: [interventionLabel: string, itemsLabel: string, quoteTitle: string, invoiceTitle: string, qty?: string];
  calc: { items: boolean; title: string; placeholder: string; shipping: string | false; hint: string };
};

const DEFS: Record<string, Def> = {
  'smartphone-repair': {
    title: 'Réparation smartphone / tablette', summary: 'Écrans, batteries, connectique, IMEI et garanties.', item: 'Pièces détachées', service: 'Réparations', device: 'Appareils / Dossiers', quote: 'Devis de réparation',
    modules: ['Clients', 'Appareils / Dossiers', 'Pièces', 'Fournisseurs', 'Garanties'],
    services: [['Diagnostic', 20], ['Remplacement écran', 45], ['Remplacement batterie', 30], ['Remplacement connecteur de charge', 45], ['Remplacement vitre arrière', 45], ['Remplacement caméra', 40], ['Réparation micro / haut-parleur', 40], ['Réparation après oxydation', 90], ['Réparation carte mère (microsoudure)', 120], ['Transfert de données', 45], ['Configuration / déblocage', 30], ['SAV / reprise sous garantie', 30]],
    parts: ['Écran', 'Batterie', 'Connecteur de charge', 'Vitre arrière', 'Adhésif écran', 'Caméra arrière', 'Caméra avant', 'Nappe bouton / volume', 'Haut-parleur', 'Micro', 'Vitre de protection'],
    warranty: ['Garantie 3 mois', 'Garantie 6 mois', 'Garantie 12 mois'],
    doc: ['Type de réparation', 'Pièces', 'DEVIS DE RÉPARATION', 'FACTURE DE RÉPARATION'],
    calc: { items: true, title: 'Pièces nécessaires', placeholder: 'Ex. Écran iPhone 13', shipping: 'Livraison des pièces (HT)', hint: 'Indiquez le coût d’achat de chaque pièce : il reste interne, le client ne voit que la pièce et la quantité.' },
  },
  'computer-repair': {
    title: 'Dépannage informatique', summary: 'Ordinateurs, réseaux, sauvegardes, installation et maintenance.', item: 'Composants & licences', service: 'Interventions', device: 'Ordinateurs / matériel', quote: 'Devis informatique',
    modules: ['Clients', 'Matériel', 'Composants', 'Fournisseurs', 'Garanties'],
    services: [['Diagnostic matériel / logiciel', 30], ['Nettoyage virus / malwares', 60], ['Réinstallation du système', 90], ['Remplacement disque SSD', 60], ['Extension mémoire (RAM)', 30], ['Remplacement écran portable', 60], ['Récupération de données', 120], ['Installation réseau / Wi-Fi', 90], ['Configuration messagerie / sauvegardes', 60], ['Formation utilisateur', 60], ['Contrat de maintenance', 60]],
    parts: ['Disque SSD', 'Barrette RAM', 'Écran portable', 'Batterie portable', 'Chargeur', 'Licence Windows', 'Antivirus (licence)', 'Câble / connectique', 'Routeur / borne Wi-Fi'],
    warranty: ['Garantie 3 mois', 'Garantie 6 mois', 'Garantie 12 mois'],
    doc: ['Type d’intervention', 'Composants & licences', 'DEVIS INFORMATIQUE', 'FACTURE INFORMATIQUE'],
    calc: { items: true, title: 'Composants et licences', placeholder: 'Ex. SSD 500 Go', shipping: 'Livraison du matériel (HT)', hint: 'Le prix d’achat reste interne : le client voit le composant et la quantité.' },
  },
  plumbing: {
    title: 'Plomberie / chauffage', summary: 'Fuites, sanitaire, chauffe-eau, chauffage et dépannage.', item: 'Matériel', service: 'Interventions', device: 'Installations', quote: 'Devis plomberie',
    modules: ['Clients', 'Matériel', 'Fournisseurs', 'Installations', 'Agenda', 'Garanties'],
    services: [['Recherche de fuite', 60], ['Réparation de fuite', 60], ['Débouchage canalisation', 60], ['Remplacement mécanisme de chasse d’eau', 45], ['Remplacement robinetterie', 60], ['Installation sanitaire (WC, lavabo, douche)', 180], ['Remplacement chauffe-eau', 180], ['Entretien chaudière', 60], ['Remplacement radiateur', 120], ['Dépannage urgent', 60], ['Mise en service / SAV', 45]],
    parts: ['Tube PVC', 'Tube cuivre', 'Raccord', 'Mécanisme de chasse d’eau', 'Robinetterie', 'Mitigeur', 'Siphon', 'Joint / flexible', 'Chauffe-eau', 'Radiateur', 'Colle / téflon'],
    warranty: ['Garantie 1 an pièces et main-d’œuvre', 'Garantie décennale (travaux concernés)'],
    doc: ['Type d’intervention', 'Matériel fourni', 'DEVIS D’INTERVENTION', 'FACTURE D’INTERVENTION'],
    calc: { items: true, title: 'Matériel fourni', placeholder: 'Ex. Robinet mitigeur', shipping: 'Transport du matériel (HT)', hint: 'Le prix d’achat du matériel reste interne : le client voit le matériel et la quantité.' },
  },
  electrical: {
    title: 'Électricité / domotique', summary: 'Installation, mise aux normes, dépannage et domotique.', item: 'Matériel électrique', service: 'Prestations', device: 'Installations', quote: 'Devis électricité',
    modules: ['Clients', 'Matériel', 'Fournisseurs', 'Installations', 'Agenda', 'Garanties'],
    services: [['Diagnostic électrique', 60], ['Dépannage panne de courant', 60], ['Remplacement tableau électrique', 300], ['Mise aux normes NF C 15-100', 480], ['Installation prises / interrupteurs', 90], ['Installation éclairage', 120], ['Installation borne de recharge', 240], ['Installation VMC', 240], ['Installation domotique / alarme', 180], ['Contrôle et attestation', 90]],
    parts: ['Câble électrique', 'Prise / interrupteur', 'Disjoncteur', 'Tableau électrique', 'Luminaire / spot', 'Gaine / goulotte', 'Borne de recharge', 'Détecteur / capteur'],
    warranty: ['Garantie 1 an pièces et main-d’œuvre', 'Garantie décennale (travaux concernés)'],
    doc: ['Type de prestation', 'Matériel fourni', 'DEVIS ÉLECTRICITÉ', 'FACTURE ÉLECTRICITÉ'],
    calc: { items: true, title: 'Matériel fourni', placeholder: 'Ex. Disjoncteur 20 A', shipping: 'Transport du matériel (HT)', hint: 'Le coût d’achat reste interne : le client voit le matériel et la quantité.' },
  },
  auto: {
    title: 'Mécanique / carrosserie auto-moto', summary: 'Entretien, réparation, pneus, carrosserie et contrôle.', item: 'Pièces auto', service: 'Interventions', device: 'Véhicules', quote: 'Devis atelier',
    modules: ['Clients', 'Véhicules', 'Pièces', 'Fournisseurs', 'Garanties'],
    services: [['Diagnostic électronique', 45], ['Vidange + filtre à huile', 60], ['Remplacement plaquettes de frein', 90], ['Remplacement disques et plaquettes', 150], ['Remplacement batterie', 30], ['Remplacement pneus (montage / équilibrage)', 60], ['Distribution / courroie', 300], ['Embrayage', 360], ['Climatisation (recharge)', 60], ['Carrosserie / débosselage', 180], ['Préparation contrôle technique', 60]],
    parts: ['Huile moteur', 'Filtre à huile', 'Filtre à air', 'Plaquettes de frein', 'Disques de frein', 'Batterie', 'Pneu', 'Kit de distribution', 'Bougies', 'Liquide de refroidissement'],
    warranty: ['Garantie 6 mois pièces et main-d’œuvre', 'Garantie 12 mois pièces et main-d’œuvre'],
    doc: ['Type d’intervention', 'Pièces', 'DEVIS ATELIER', 'FACTURE ATELIER'],
    calc: { items: true, title: 'Pièces et fournitures', placeholder: 'Ex. Plaquettes avant', shipping: 'Livraison des pièces (HT)', hint: 'Le prix d’achat reste interne : le client voit la pièce et la quantité.' },
  },
  'web-development': {
    title: 'Développement web / logiciel', summary: 'Sites, e-commerce, applications, SaaS, maintenance.', item: 'Services & ressources', service: 'Prestations', device: 'Projets', quote: 'Devis développement',
    modules: ['Clients', 'Projets', 'Prestations', 'Agenda', 'Documents'],
    services: [['Site vitrine', 480], ['E-commerce', 720], ['Application web', 960], ['Application mobile', 1200], ['SaaS', 1600], ['Refonte de site', 480], ['Référencement (SEO)', 240], ['Formation / accompagnement', 120], ['Maintenance / support', 120], ['Audit technique', 240]],
    parts: ['Nom de domaine', 'Hébergement', 'Licence logicielle', 'API / service tiers', 'Maintenance technique', 'Certificat SSL'],
    warranty: ['Garantie de conformité 3 mois', 'Garantie de conformité 6 mois'],
    doc: ['Prestation', 'Services & ressources', 'DEVIS', 'FACTURE'],
    calc: { items: true, title: 'Services tiers et ressources', placeholder: 'Ex. Hébergement annuel', shipping: false, hint: 'Renseignez uniquement les coûts de tiers (domaine, hébergement, licences) ; votre temps de travail constitue la marge.' },
  },
  creative: {
    title: 'Graphisme / photo / vidéo / communication', summary: 'Identité visuelle, supports, reportages, montage et contenus.', item: 'Licences & frais', service: 'Prestations', device: 'Projets', quote: 'Devis création',
    modules: ['Clients', 'Projets', 'Prestations', 'Agenda', 'Documents'],
    services: [['Logo et identité visuelle', 480], ['Charte graphique', 600], ['Flyer / affiche / carte de visite', 180], ['Reportage photo', 240], ['Photo produit', 180], ['Montage vidéo', 300], ['Gestion de réseaux sociaux (mois)', 600], ['Retouche / détourage', 60], ['Maquette de site', 360]],
    parts: ['Banque d’images / licence', 'Impression', 'Typographie / licence', 'Location de matériel', 'Déplacement'],
    warranty: ['Cession de droits incluse'],
    doc: ['Prestation', 'Licences & frais', 'DEVIS', 'FACTURE'],
    calc: { items: true, title: 'Licences et frais externes', placeholder: 'Ex. Impression 100 flyers', shipping: false, hint: 'Ne saisissez que les frais externes : votre temps de création constitue la marge.' },
  },
  beauty: {
    title: 'Coiffure / esthétique / bien-être', summary: 'Soins, coupes, colorations, massages et forfaits.', item: 'Produits', service: 'Prestations', device: 'Fiches de suivi', quote: 'Devis prestation',
    modules: ['Clients', 'Prestations', 'Produits', 'Agenda', 'Fiches de suivi'],
    services: [['Coupe femme', 60], ['Coupe homme', 30], ['Coloration', 90], ['Balayage / mèches', 150], ['Brushing', 45], ['Soin du visage', 60], ['Épilation', 30], ['Manucure / pose de vernis', 45], ['Pose de gel / capsules', 90], ['Massage bien-être', 60], ['Forfait mariage', 240]],
    parts: ['Coloration', 'Soin capillaire', 'Produit de soin visage', 'Vernis / gel', 'Cire d’épilation'],
    warranty: ['Reprise offerte sous 7 jours'],
    doc: ['Prestation', 'Produits fournis', 'DEVIS', 'FACTURE'],
    calc: { items: true, title: 'Produits utilisés (facultatif)', placeholder: 'Ex. Coloration 60 ml', shipping: false, hint: 'Indiquez les produits facturés : leur coût d’achat reste interne.' },
  },
  cleaning: {
    title: 'Nettoyage / jardinage / entretien', summary: 'Ménage, vitres, espaces verts, entretien de locaux.', item: 'Fournitures', service: 'Prestations', device: 'Sites / interventions', quote: 'Devis entretien',
    modules: ['Clients', 'Sites', 'Prestations', 'Agenda', 'Documents'],
    services: [['Ménage (à l’heure)', 60], ['Nettoyage de fin de chantier', 240], ['Nettoyage de vitres', 90], ['Entretien de locaux (forfait mensuel)', 120], ['Tonte de pelouse', 90], ['Taille de haies', 120], ['Élagage', 180], ['Entretien de jardin (forfait)', 180], ['Débroussaillage', 180]],
    parts: ['Produits d’entretien', 'Sacs et consommables', 'Évacuation des déchets verts', 'Location de matériel', 'Déplacement'],
    warranty: ['Reprise offerte sous 48 h'],
    doc: ['Type de prestation', 'Fournitures & frais', 'DEVIS ENTRETIEN', 'FACTURE ENTRETIEN'],
    calc: { items: true, title: 'Fournitures et frais', placeholder: 'Ex. Évacuation déchets verts', shipping: 'Déplacement (HT)', hint: 'Les coûts restent internes : le client voit la fourniture et la quantité.' },
  },
  consulting: {
    title: 'Conseil / formation / coaching', summary: 'Missions, ateliers, audits, accompagnements.', item: 'Frais', service: 'Missions', device: 'Missions', quote: 'Devis mission',
    modules: ['Clients', 'Missions', 'Prestations', 'Agenda', 'Documents'],
    services: [['Audit / diagnostic', 180], ['Mission de conseil (journée)', 420], ['Atelier / séance de coaching', 90], ['Formation (demi-journée)', 210], ['Formation (journée)', 420], ['Accompagnement mensuel', 120], ['Intervention en conférence', 120]],
    parts: ['Frais de déplacement', 'Supports pédagogiques', 'Location de salle'],
    warranty: [],
    doc: ['Mission', 'Frais', 'DEVIS MISSION', 'FACTURE MISSION'],
    calc: { items: false, title: '', placeholder: '', shipping: 'Frais de déplacement (HT)', hint: '' },
  },
  building: {
    title: 'Bâtiment / rénovation (maçonnerie, peinture, menuiserie)', summary: 'Chantiers de rénovation, second œuvre et finitions.', item: 'Matériaux', service: 'Travaux', device: 'Chantiers', quote: 'Devis travaux',
    modules: ['Clients', 'Chantiers', 'Matériaux', 'Fournisseurs', 'Agenda', 'Documents'],
    services: [['Diagnostic / visite technique', 60], ['Peinture intérieure (pièce)', 480], ['Peinture extérieure / façade', 960], ['Pose de carrelage', 480], ['Pose de parquet / sol', 480], ['Cloison / plâtrerie', 480], ['Isolation', 480], ['Menuiserie (pose fenêtre / porte)', 240], ['Petite maçonnerie', 480], ['Réparation / rebouchage', 120], ['Nettoyage de chantier', 120]],
    parts: ['Peinture', 'Enduit', 'Carrelage', 'Colle / joint', 'Plaque de plâtre', 'Isolant', 'Bois / panneau', 'Quincaillerie', 'Consommables'],
    warranty: ['Garantie de parfait achèvement 1 an', 'Garantie décennale (travaux concernés)'],
    doc: ['Type de travaux', 'Matériaux', 'DEVIS TRAVAUX', 'FACTURE TRAVAUX'],
    calc: { items: true, title: 'Matériaux', placeholder: 'Ex. Peinture acrylique 10 L', shipping: 'Transport des matériaux (HT)', hint: 'Le coût d’achat des matériaux reste interne : le client voit le matériau et la quantité.' },
  },
  'generic-services': {
    title: 'Services professionnels', summary: 'Catalogue libre : prestations et articles personnalisables.', item: 'Articles / ressources', service: 'Prestations', device: 'Dossiers', quote: 'Devis',
    modules: ['Clients', 'Catalogue', 'Prestations', 'Agenda', 'Documents'],
    services: [['Prestation', 60], ['Diagnostic', 30], ['Maintenance', 60], ['SAV', 30]],
    parts: [], warranty: ['Garantie 3 mois', 'Garantie 12 mois'],
    doc: ['Prestation', 'Articles', 'DEVIS', 'FACTURE'],
    calc: { items: true, title: 'Articles / fournitures', placeholder: 'Ex. Fourniture', shipping: 'Frais annexes (HT)', hint: 'Les coûts d’achat restent internes : le client voit l’article et la quantité.' },
  },
};

const RULES: [string, RegExp][] = [
  ['smartphone-repair', /smartphone|mobile|téléphone|telephone|iphone|android|easyfixit|tablette/],
  ['computer-repair', /informatique|ordinateur|\bpc\b|laptop|portable|dépannage pc|réseau informatique/],
  ['plumbing', /plomb|sanitaire|chauffage|climatisation|chauffe-eau/],
  ['electrical', /électric|electric|domotique/],
  ['auto', /\bauto\b|voiture|véhicule|vehicule|garage|mécanique|mecanique|carrosserie|\bmoto\b/],
  ['web-development', /web|développe|develop|saas|logiciel|application|digital|easyweb/],
  ['creative', /graph|design|photo|vidéo|video|logo|illustration|communication|marketing/],
  ['beauty', /coiff|beaut|esthét|esthet|massage|bien-être|bien-etre|ongl|barber|manucure|\bspa\b/],
  ['cleaning', /nettoy|ménage|menage|jardin|paysag|entretien|espaces verts/],
  ['consulting', /conseil|formation|coach|consult|audit|expert/],
  ['building', /artisan|bâtiment|batiment|construction|maçon|macon|peintre|peinture|menuis|carrel|rénov|renov|toiture|couvreur/],
];

export const PROFILE_CODES = Object.keys(DEFS);
export function listProfiles() { return PROFILE_CODES.map(c => ({ code: c, title: DEFS[c]!.title, summary: DEFS[c]!.summary })); }

export function profileFor(name: string, description: string = '', override?: string | null): Profile {
  const s = (name + ' ' + description).toLowerCase();
  let code = override && DEFS[override] ? override : (RULES.find(([, re]) => re.test(s))?.[0] || 'generic-services');
  const d = DEFS[code]!;
  return {
    code, title: code === 'generic-services' && name ? name : d.title, summary: d.summary,
    clientLabel: 'Clients', itemLabel: d.item, serviceLabel: d.service, deviceLabel: d.device, quoteLabel: d.quote, modules: d.modules,
    suggestedParts: d.parts, suggestedServices: d.services.map(x => x[0]), serviceMinutes: Object.fromEntries(d.services), warranty: d.warranty,
    doc: { interventionLabel: d.doc[0], itemsLabel: d.doc[1], quantityLabel: d.doc[4] || 'Qté', quoteTitle: d.doc[2], invoiceTitle: d.doc[3] },
    calc: { items: d.calc.items, itemsTitle: d.calc.title, itemPlaceholder: d.calc.placeholder, shipping: d.calc.shipping !== false, shippingLabel: d.calc.shipping || '', hint: d.calc.hint },
  };
}

export function defaultCgvFor(code: string, title: string, legalForm = '') {
  const smart = `Conditions applicables aux réparations et ventes de pièces. Le devis accepté vaut accord sur les prestations et fournitures décrites. Les pièces, garanties et exclusions sont celles indiquées sur le document. Toute intervention complémentaire fait l'objet d'un accord préalable. Les appareils confiés restent sous la responsabilité du client pour les sauvegardes et données. Les délais annoncés peuvent varier selon la disponibilité des pièces. Réclamation et SAV : contacter l'entreprise avec le numéro du document et, lorsque concerné, l'IMEI de l'appareil.`;
  const digital = `Conditions applicables aux prestations numériques. Le périmètre, les livrables, délais et modalités de recette sont ceux du devis accepté. Toute évolution hors périmètre fait l'objet d'un chiffrage complémentaire. Les abonnements, hébergements, licences et services tiers sont facturés selon les conditions indiquées. Le client reste responsable des contenus, droits et accès qu'il fournit.`;
  const works = `Conditions applicables aux prestations d'installation, réparation et maintenance. Le devis accepté définit les travaux et fournitures prévus. Toute prestation supplémentaire nécessite un accord préalable. Les délais peuvent dépendre de l'accès au chantier, de la disponibilité des matériaux et de contraintes techniques. Les garanties et exclusions figurent sur le devis ou la facture.`;
  const person = `Conditions applicables aux prestations de service à la personne. Le rendez-vous est confirmé à l'acceptation du devis ; toute annulation moins de 24 h avant la prestation peut être facturée. Les garanties de reprise sont celles indiquées sur le document.`;
  const advice = `Conditions applicables aux missions de conseil et de formation. Le périmètre, le calendrier et les livrables sont ceux du devis accepté. Toute demande complémentaire fait l'objet d'un avenant. Les frais de déplacement et de supports sont facturés selon les conditions indiquées.`;
  const withLegalForm=(text: string)=>legalForm?`${text} Forme juridique déclarée : ${legalForm}.`:text;
  if (code === 'smartphone-repair' || code === 'computer-repair') return withLegalForm(code === 'computer-repair' ? smart.replace(/IMEI de l'appareil/, 'numéro de série du matériel').replace('réparations et ventes de pièces', 'interventions et ventes de matériel') : smart);
  if (code === 'web-development' || code === 'creative') return withLegalForm(digital);
  if (code === 'plumbing' || code === 'electrical' || code === 'building' || code === 'cleaning' || code === 'auto') return withLegalForm(works);
  if (code === 'beauty') return withLegalForm(person);
  if (code === 'consulting') return withLegalForm(advice);
  return withLegalForm(`Conditions générales applicables aux prestations de ${title}. Le devis accepté définit le périmètre, les fournitures, les prestations, les prix et les délais. Toute modification hors périmètre fait l'objet d'un accord complémentaire. Les garanties applicables sont celles indiquées sur le document.`);
}
