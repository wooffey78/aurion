const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 700);
const list = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : clean(value).split(/[\n,;]/).map(clean).filter(Boolean);

const namingModes = Object.freeze({
  initials: 'Respecter les initiales demandées et expliquer si elles sont visibles, combinées à un terme ou utilisées comme principe de création.',
  required_word: 'Inclure chacun des mots imposés. Respecter exactement leur orthographe, sauf si la règle choisie autorise explicitement une variante.',
  free: 'Créer librement à partir du contexte confirmé, sans réutiliser d’anciennes initiales ou contraintes propres à un autre mode.'
});
const initialsUsageLabels = Object.freeze({
  visible: 'les initiales doivent apparaître dans le nom',
  monogram: 'les initiales inspirent un monogramme',
  combined: 'combiner les initiales avec un terme',
  inspiration: 'les initiales inspirent un mot-valise'
});
const profileLabels = Object.freeze({
  customers: { individuals: 'particuliers', businesses: 'entreprises et associations', public: 'organismes publics', mixed: 'plusieurs types de clients', unknown: 'non déterminée' },
  positioning: { accessible: 'accessible et pratique', premium: 'premium', expert: 'technique et expert', friendly: 'proche et convivial', institutional: 'institutionnel', artisan: 'artisanal et authentique', innovative: 'innovant', natural: 'naturel et apaisant', local: 'ancré localement', luxury: 'raffiné', playful: 'ludique', responsible: 'responsable et durable' },
  tone: { professional: 'professionnel', warm: 'chaleureux', technical: 'technique', minimal: 'minimaliste', bold: 'dynamique', reassuring: 'rassurant', elegant: 'élégant', playful: 'enjoué', natural: 'naturel', confident: 'affirmé', human: 'humain et accessible', premium: 'haut de gamme' },
  language: { fr: 'français', en: 'anglais', mixed: 'français ou international', local: 'langue locale ou régionale' },
  length: { short: 'court', medium: 'moyen', free: 'sans préférence' },
  style: { descriptive: 'descriptif', evocative: 'évocateur', invented: 'inventé mais prononçable', composed: 'nom composé', acronym: 'acronyme', local: 'ancré localement', technical: 'technique', premium: 'premium', friendly: 'convivial' }
});
const profileLabel = (group, value) => profileLabels[group]?.[clean(value)] || clean(value);

export function buildBusinessNamePrompt(profile = {}, options = {}) {
  const mode = options.mode || 'free';
  const sections = [
    'Tu es spécialiste du naming, de la stratégie de marque et de l’identité verbale pour les petites entreprises.',
    mode === 'keep'
      ? 'Ne propose aucun nouveau nom et ne modifie pas le nom choisi. Reprends-le exactement comme élément de départ de l’identité visuelle.'
      : 'Propose 8 à 12 noms distinctifs, prononçables et adaptés à une utilisation professionnelle. Chaque idée doit avoir un lien intelligible avec l’activité ou le positionnement, sans dépendre d’un cliché sectoriel.',
    '',
    'CONTEXTE CONFIRMÉ',
    ...[
      ['Activité principale', profile.activity], ['Précisions métier et prestations', profile.details],
      ['Clientèle', profileLabel('customers', profile.customers)], ['Zone pertinente', profile.location],
      ['Positionnement', profileLabel('positioning', profile.positioning)], ['Personnalité de marque', profile.personality],
      ['Ton', profileLabel('tone', profile.tone)], ['Langue souhaitée', profileLabel('language', profile.language)],
      ['Longueur souhaitée', profileLabel('length', profile.length)], ['Style verbal', profileLabel('style', profile.style)],
      ['Nom de départ souhaité', profile.startingName]
    ].filter(([, value]) => clean(value)).map(([label, value]) => `${label} : ${clean(value)}`),
    '',
    'MODE DE CRÉATION',
    mode === 'keep'
      ? `Conserver le nom actuel : « ${clean(profile.startingName) || '[nom à confirmer]'} ». Ne génère pas d’alternative.`
      : mode === 'initials'
      ? `${namingModes.initials}\nInitiales fournies par l’utilisateur : ${list(options.initials).join(', ') || '[à compléter]'}\nUsage souhaité : ${initialsUsageLabels[clean(options.initialsUsage)] || clean(options.initialsUsage) || 'à préciser'}`
      : mode === 'required_word'
        ? `${namingModes.required_word}\nMots obligatoires : ${list(options.requiredWords).join(', ') || '[à compléter]'}\nRègle : ${options.wordRule === 'variant' ? 'variantes et flexions acceptées' : 'orthographe exacte'}`
        : namingModes.free,
    list(options.avoid).length ? `Mots, clichés ou connotations à éviter : ${list(options.avoid).join(', ')}` : '',
    '',
    mode === 'keep' ? '' : 'Pour chaque proposition, fournis le nom exact, une justification liée à l’activité et aux clients, le principe de construction, le ton, une indication de prononciation, un avis qualitatif sur la mémorisation et l’orthographe, ainsi que les ambiguïtés ou connotations à vérifier.',
    mode === 'keep' ? '' : 'Écarte les noms interchangeables, les clichés de secteur, les suites de lettres difficiles à prononcer, les répétitions superficielles, les promesses invérifiables et les marques connues reprises explicitement. Si le contexte manque, annonce l’hypothèse au lieu d’inventer une activité ou une clientèle.',
    'Avertissement obligatoire : aucune disponibilité au registre, à l’INPI, à l’AFNIC, sur un domaine ou au titre du droit des marques n’a été vérifiée. Ne présente aucune proposition comme libre, protégée ou juridiquement validée.',
    mode === 'keep' ? 'Confirme uniquement la reprise du nom indiqué et précise qu’aucune disponibilité juridique n’a été contrôlée.' : 'Présente les résultats dans un tableau lisible et termine par les trois pistes les plus cohérentes, sans décider à la place de l’utilisateur.'
  ];
  return sections.filter(Boolean).join('\n').trim();
}
