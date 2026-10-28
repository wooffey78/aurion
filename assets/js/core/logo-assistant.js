const ASSISTANTS = Object.freeze({
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/app' },
  claude: { name: 'Claude', url: 'https://claude.ai/new' },
  grok: { name: 'Grok', url: 'https://grok.com/' }
});

const clean = value => String(value ?? '').trim() || 'Non précisé';

export function logoAssistantUrl(provider) {
  return ASSISTANTS[provider]?.url || ASSISTANTS.chatgpt.url;
}

export function normalizeLogoAssistant(provider) {
  return Object.prototype.hasOwnProperty.call(ASSISTANTS, provider) ? provider : 'chatgpt';
}

export function buildLogoPrompt(profile = {}, { mode = 'new', adjustment = '', variation = 1, hasReference = false } = {}) {
  const isAdjustment = mode === 'adjust';
  const labels = {
    positioning: { accessible: 'Accessible et pratique', premium: 'Premium', expert: 'Technique / expert', friendly: 'Proche et convivial', institutional: 'Institutionnel' },
    clients: { individuals: 'Particuliers', businesses: 'Professionnels', both: 'Particuliers et professionnels' },
    tone: { professional: 'Professionnel', warm: 'Chaleureux', technical: 'Technique', minimal: 'Minimaliste', bold: 'Dynamique' }
  };
  const label = (group, value) => labels[group]?.[value] || clean(value);
  const sections = [
    'Tu es un directeur artistique spécialisé en identité de marque et en conception de logos professionnels.',
    isAdjustment
      ? 'MISSION : produire une version révisée du logo existant, en conservant les éléments forts déjà validés et en appliquant précisément les ajustements ci-dessous.'
      : `MISSION : créer une nouvelle proposition de logo originale. Variante de génération : ${Math.max(1, Number(variation) || 1)}. Cette variante doit être distincte des propositions précédentes, sans sacrifier la cohérence de marque.`,
    '',
    'CONTEXTE DE MARQUE (informations collectées par Aurion) :',
    `Nom de l’entreprise / marque : ${clean(profile.name)}`,
    `Activité principale : ${clean(profile.activity)}`,
    `Activité détaillée : ${clean(profile.customActivity)}`,
    `Précisions métier : ${clean(profile.activityDetails)}`,
    `Mode d’organisation : ${clean(profile.workers)}`,
    `Activité issue d’une détection récente (non confirmée si elle n’a pas été appliquée) : ${clean(profile.detectedActivity)}`,
    `Secteur : ${clean(profile.sector)}`,
    `Forme juridique : ${clean(profile.legalForm)}`,
    `Positionnement : ${label('positioning', profile.positioning)}`,
    `Clientèle : ${label('clients', profile.clients)}`,
    `Ton de communication : ${label('tone', profile.tone)}`, 
    `Zone géographique : ${clean(profile.region)}`,
    `Ville : ${clean(profile.city)}`,
    `Site internet : ${clean(profile.website)}`,
    '',
    'DIRECTION VISUELLE :',
    `Couleur d’accent souhaitée : ${clean(profile.accent)}`,
    `Couleur sombre souhaitée : ${clean(profile.dark)}`,
    `Typographie : ${profile.font === 'serif' ? 'sérif' : profile.font === 'sans' ? 'sans sérif' : clean(profile.font)}`,
    `Formes : ${profile.radius === 'square' ? 'angulaires / carrées' : profile.radius === 'round' ? 'arrondies' : clean(profile.radius)}`,
    '',
    'LIVRABLE VISUEL :',
    'Génère directement une image de logo exploitable, pas seulement une description. Composition unique, logo centré, formes nettes et lisibles en petit format, contraste maîtrisé, rendu professionnel et reconnaissable. Prévois un fond transparent si possible, sinon un fond uni neutre facile à retirer. Ne présente pas le logo sur une carte de visite, une façade, un écran, un vêtement ou une maquette. Aucun filigrane, aucune signature, aucune icône de marque tierce, aucun slogan inventé. Respecte exactement l’orthographe du nom fourni ; si un texte fiable ne peut pas être rendu, privilégie un symbole graphique et un espace de logotype propre plutôt qu’un faux texte.',
    'Évite les clichés graphiques génériques et les détails trop fins. Le résultat doit rester utilisable sur un site, une facture, un devis et les réseaux sociaux. Ne prétends pas avoir vérifié la disponibilité juridique de ce logo.',
    hasReference && isAdjustment
      ? 'Une image de référence existe : demande-toi de l’utiliser comme image jointe. Si elle n’est pas jointe à cette conversation, demande à l’utilisateur de la joindre avant de modifier le dessin.'
      : '',
    adjustment.trim() ? `AJUSTEMENT DEMANDÉ PAR L’UTILISATEUR : ${adjustment.trim()}` : '',
    '',
    'Retourne le visuel généré, puis indique brièvement les choix graphiques effectués. Ne remplace pas le visuel par une explication textuelle.'
  ];
  return sections.filter((line, index) => line || sections[index - 1] !== '').join('\n').trim();
}
