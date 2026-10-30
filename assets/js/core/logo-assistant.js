const ASSISTANTS = Object.freeze({
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/app' },
  claude: { name: 'Claude', url: 'https://claude.ai/new' },
  grok: { name: 'Grok', url: 'https://grok.com/' }
});

const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 1200);
const list = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : clean(value).split(/[\n,;]/).map(clean).filter(Boolean);
const labels = Object.freeze({
  positioning: {
    accessible: 'accessible et pratique', premium: 'premium', expert: 'technique et expert', friendly: 'proche et convivial', institutional: 'institutionnel',
    artisan: 'artisan et authentique', innovative: 'innovant et tourné vers l’avenir', natural: 'naturel et apaisant', local: 'ancré localement', luxury: 'haut de gamme et raffiné', playful: 'ludique et expressif', responsible: 'responsable et durable'
  },
  clients: {
    individuals: 'particuliers', businesses: 'professionnels', both: 'particuliers et professionnels', associations: 'associations', public: 'organismes publics', families: 'familles', creators: 'indépendants et créateurs', local: 'clientèle locale', mixed: 'publics variés'
  },
  tone: {
    professional: 'professionnel', warm: 'chaleureux', technical: 'technique', minimal: 'minimaliste', bold: 'dynamique', reassuring: 'rassurant', elegant: 'élégant', playful: 'enjoué', natural: 'naturel', confident: 'affirmé', human: 'humain et accessible', premium: 'haut de gamme'
  },
  font: {
    sans: 'sans sérif', serif: 'sérif classique', geometric: 'sans sérif géométrique', humanist: 'sans sérif humaniste', grotesque: 'sans sérif grotesque', editorial: 'sérif éditoriale', slab: 'sérif slab robuste', mono: 'monospace technique', rounded: 'sans sérif arrondie', display: 'typographie display à fort caractère', handwritten: 'manuscrite sobre'
  },
  graphicStyle: {
    minimal: 'minimal et épuré', geometric: 'géométrique et structuré', organic: 'organique et naturel', line_art: 'dessin au trait', monogram: 'monogramme construit', emblem: 'emblème contemporain', typographic: 'typographique', abstract: 'abstrait mais lisible', heritage: 'héritage artisanal', technology: 'technologique sobre', craft: 'artisan et matière', editorial: 'éditorial et élégant'
  },
  composition: {
    horizontal: 'symbole à gauche et nom sur une ligne', vertical: 'symbole au-dessus du nom', symbol_only: 'symbole seul, aucun nom ni texte dans l’image', wordmark: 'logotype typographique, nom lisible en priorité', monogram: 'monogramme composé uniquement des lettres fournies', badge: 'emblème compact contenu dans une forme simple'
  },
  complexity: { simple: 'très simple, peu de formes', balanced: 'équilibre entre simplicité et caractère', detailed: 'détails limités et maîtrisés' },
  symbols: { include: 'un symbole graphique pertinent est souhaité', optional: 'proposer un symbole seulement s’il apporte une idée distinctive', avoid: 'aucun symbole graphique, privilégier le travail typographique', symbol_only: 'symbole seul' },
  personality: { confident: 'sûre et experte', welcoming: 'accueillante', precise: 'précise et rigoureuse', optimistic: 'optimiste', calm: 'calme', bold: 'audacieuse', reliable: 'fiable', creative: 'créative' },
  uses: { web: 'site web et application', documents: 'devis et factures', social: 'réseaux sociaux', print: 'impression', signage: 'signalétique', small: 'icône et petit format' }
});

const palettes = Object.freeze({
  ocean: 'Océan profond — bleu #174A72, bleu clair #62A5C8, ivoire #F4F7F8',
  forest: 'Forêt — vert #245B45, sauge #A4B9A0, crème #F3F0E6',
  terracotta: 'Terre cuite — terracotta #B85C43, sable #E5C9A5, encre #382F2B',
  midnight: 'Minuit — bleu nuit #17233D, bleu acier #607C9C, blanc #F6F7FB',
  citrus: 'Agrumes — citron #D5A928, vert feuille #486C4B, crème #FBF7E9',
  lavender: 'Lavande — violet #685486, lilas #B3A3C9, gris clair #F4F1F7',
  monochrome: 'Noir et blanc — noir #17191C, gris #737A82, blanc #FFFFFF',
  coral: 'Corail — corail #D66C63, rose pâle #F2C9C2, prune #503A4A',
  sand: 'Sable et minéral — sable #C8AA7C, argile #857763, ardoise #34414B',
  cyan: 'Cyan contemporain — bleu #246B8F, cyan #59B9C4, charbon #26333B'
});

export function logoAssistantUrl(provider) {
  return ASSISTANTS[provider]?.url || ASSISTANTS.chatgpt.url;
}

export function normalizeLogoAssistant(provider) {
  return Object.prototype.hasOwnProperty.call(ASSISTANTS, provider) ? provider : 'chatgpt';
}

function label(group, value) {
  const key = clean(value);
  return labels[group]?.[key] || key;
}

export function buildLogoPrompt(profile = {}, { mode = 'new', adjustment = '', variation = 1, hasReference = false } = {}) {
  const isAdjustment = mode === 'adjust';
  const composition = profile.composition || '';
  const isSymbolOnly = composition === 'symbol_only';
  const isMonogram = composition === 'monogram';
  const sections = [
    'Tu es directeur artistique spécialisé en stratégie de marque et identité visuelle pour des entreprises réelles. Crée un logo professionnel, distinctif, durable et techniquement exploitable.',
    isAdjustment
      ? 'MISSION : faire évoluer le logo de référence en conservant ses éléments déjà validés. Appliquer les ajustements demandés sans recommencer arbitrairement la marque.'
      : `MISSION : créer une proposition de logo originale. Variante ${Math.max(1, Number(variation) || 1)} : explorer une piste réellement distincte, cohérente avec le brief.`,
    '', 'BRIEF DE MARQUE',
    profile.brandName ? `Nom de marque confirmé à utiliser : « ${clean(profile.brandName)} »` : clean(profile.name) ? `Nom à reprendre comme identité visuelle : « ${clean(profile.name)} »` : '',
    clean(profile.activity) ? `Activité : ${clean(profile.activity)}` : '',
    clean(profile.customActivity) ? `Prestations et activité détaillée : ${clean(profile.customActivity)}` : '',
    clean(profile.activityDetails) ? `Détails métier confirmés : ${clean(profile.activityDetails)}` : '',
    clean(profile.workers) ? `Organisation : ${clean(profile.workers)}` : '',
    clean(profile.sector) ? `Secteur : ${clean(profile.sector)}` : '',
    clean(profile.positioning) ? `Positionnement : ${label('positioning', profile.positioning)}` : '',
    clean(profile.clients) ? `Clientèle : ${label('clients', profile.clients)}` : '',
    clean(profile.tone) ? `Ton de communication : ${label('tone', profile.tone)}` : '',
    clean(profile.region) ? `Ancrage géographique : ${clean(profile.region)}` : '',
    clean(profile.personality) ? `Personnalité de marque : ${label('personality', profile.personality)}` : '',
    '', 'DIRECTION GRAPHIQUE',
    clean(profile.positioning) ? `Univers de positionnement : ${label('positioning', profile.positioning)}` : '',
    clean(profile.graphicStyle) ? `Style graphique : ${label('graphicStyle', profile.graphicStyle)}` : '',
    clean(composition) ? `Composition : ${label('composition', composition)}` : '',
    clean(profile.symbolHandling) ? `Usage du symbole : ${label('symbols', profile.symbolHandling)}` : '',
    clean(profile.symbolIdea) ? `Idée de symbole souhaitée : ${clean(profile.symbolIdea)}` : '',
    list(profile.avoidSymbols).length ? `Symboles ou clichés à éviter : ${list(profile.avoidSymbols).join(', ')}` : '',
    clean(profile.complexity) ? `Niveau de détail : ${label('complexity', profile.complexity)}` : '',
    list(profile.uses).length ? `Usages prioritaires : ${list(profile.uses).map(value => label('uses', value)).join(', ')}` : '',
    clean(profile.palette) && palettes[profile.palette] ? `Palette choisie : ${palettes[profile.palette]}` : '',
    clean(profile.accent) ? `Couleur d’accent personnalisée : ${clean(profile.accent)}` : '',
    clean(profile.dark) ? `Couleur sombre personnalisée : ${clean(profile.dark)}` : '',
    clean(profile.font) ? `Direction typographique : ${label('font', profile.font)}` : '',
    profile.radius === 'square' ? 'Formes : angles plus nets et géométriques.' : profile.radius === 'round' ? 'Formes : contours doux et arrondis.' : '',
    '', 'RÈGLES DE COMPOSITION ET DE PRODUCTION',
    'En cas de contraintes incompatibles, applique cet ordre : composition choisie, traitement du nom confirmé, interdictions explicites de symboles, puis style décoratif. Une composition « symbole seul » impose un visuel graphique sans texte ; « monogramme » n’autorise que les lettres fournies. Si les symboles sont interdits, ne pas en ajouter, sauf si la composition « symbole seul » est prioritaire.',
    clean(profile.accent) || clean(profile.dark)
      ? 'Les couleurs personnalisées renseignées sont des contraintes exactes à respecter ; utilise la palette nommée comme inspiration complémentaire seulement si elle ne les contredit pas.'
      : 'Respecte la palette sélectionnée et maintiens un contraste suffisant sur fond clair et fond sombre.',
    isSymbolOnly
      ? 'La composition est un symbole seul : ne dessine aucun nom, mot, lettre, slogan ou texte.'
      : isMonogram
        ? `La composition est un monogramme. N’utilise que les lettres explicitement fournies : ${clean(profile.initials) || '[lettres à demander]'} ; n’invente aucune initiale.`
        : 'Respecte exactement l’orthographe du nom de marque confirmé. N’ajoute aucun slogan et ne transforme pas la raison sociale en texte de marque sans instruction explicite.',
    'Créer une composition unique et lisible à petite taille, avec une hiérarchie maîtrisée, un contraste vérifié et un dessin vectoriel en esprit. Éviter les détails fins, les effets 3D, les ombres lourdes, les dégradés décoratifs et les clichés de secteur.',
    'Génère directement une image de logo, pas seulement une description. Logo centré, isolé et prêt à être utilisé sur facture, devis, site web et réseaux sociaux. Fond transparent si possible, sinon fond uni neutre. Ne montre pas de maquette, carte de visite, façade, écran, vêtement ou objet. Aucun filigrane, signature ou icône de marque tierce.',
    hasReference && isAdjustment ? 'Utilise l’image jointe comme référence et conserve son identité. Si elle n’est pas jointe, demande qu’elle soit fournie avant toute retouche.' : '',
    clean(adjustment) ? `AJUSTEMENT DEMANDÉ : ${clean(adjustment)}` : '',
    'Ne prétends pas que la marque, le nom, le domaine ou le dessin ont fait l’objet d’une vérification juridique ou de disponibilité.',
    'Retourne le visuel généré. Une brève note sur les choix visuels peut accompagner l’image, mais ne remplace jamais le logo.'
  ];
  return sections.filter(Boolean).join('\n').trim();
}
