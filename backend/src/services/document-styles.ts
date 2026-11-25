/**
 * Catalogue unique des styles natifs de devis et de factures.
 *
 * Cette liste est la seule source autorisée :
 * - `routes/documents.ts` l'expose au navigateur et valide les choix enregistrés ;
 * - `services/document-renderer.ts` en déduit le thème réellement appliqué au PDF/DOCX/ODT.
 *
 * Ajouter un style sans l'ajouter ici est donc impossible : l'API le refusera et le rendu
 * retombera sur le style classique. Les identifiants sont stables et ne doivent jamais être
 * renommés (ils sont stockés dans `document_themes`).
 */
export type DocumentStyleFont = 'sans' | 'serif';
export type DocumentStyleRadius = 'round' | 'square';
export type DocumentStyleVariant = 'classic' | 'minimal' | 'signature';

export interface DocumentStyle {
  id: string;
  label: string;
  description: string;
  accent: string;
  dark: string;
  font: DocumentStyleFont;
  radius: DocumentStyleRadius;
  /** Structure de mise en page réellement utilisée par les moteurs PDF/DOCX/ODT. */
  variant: DocumentStyleVariant;
}

export const DEFAULT_DOCUMENT_STYLE = 'aurion-classic';

export const DOCUMENT_STYLES: readonly DocumentStyle[] = Object.freeze([
  {
    id: 'aurion-classic',
    label: 'Classique',
    description: 'Équilibré · signature visuelle Aurion',
    accent: '#0b63ce',
    dark: '#0b1220',
    font: 'sans',
    radius: 'round',
    variant: 'classic',
  },
  {
    id: 'aurion-minimal',
    label: 'Minimal',
    description: 'Très épuré · lignes droites · lecture rapide',
    accent: '#155e75',
    dark: '#111827',
    font: 'sans',
    radius: 'square',
    variant: 'minimal',
  },
  {
    id: 'aurion-signature',
    label: 'Signature',
    description: 'Chaleureux · typographie serif · rendu premium',
    accent: '#a16207',
    dark: '#2b1f14',
    font: 'serif',
    radius: 'round',
    variant: 'signature',
  },
  {
    id: 'aurion-horizon',
    label: 'Horizon',
    description: 'Teal profond · angles nets · présence discrète',
    accent: '#0d9488',
    dark: '#042f2e',
    font: 'sans',
    radius: 'square',
    variant: 'classic',
  },
  {
    id: 'aurion-orchidee',
    label: 'Orchidée',
    description: 'Violet lumineux · serif · élégance marquée',
    accent: '#a855f7',
    dark: '#2e1065',
    font: 'serif',
    radius: 'round',
    variant: 'signature',
  },
  {
    id: 'aurion-encre',
    label: 'Encre',
    description: 'Monochrome · sobre · administratif',
    accent: '#374151',
    dark: '#111827',
    font: 'sans',
    radius: 'square',
    variant: 'minimal',
  },
  {
    id: 'aurion-corail',
    label: 'Corail',
    description: 'Rose chaleureux · angles nets · distinctif',
    accent: '#f43f5e',
    dark: '#4c0519',
    font: 'sans',
    radius: 'square',
    variant: 'classic',
  },
  {
    id: 'aurion-glacier',
    label: 'Glacier',
    description: 'Bleu froid · arrondi · lumineux',
    accent: '#0369a1',
    dark: '#0c4a6e',
    font: 'sans',
    radius: 'round',
    variant: 'minimal',
  },
  {
    id: 'aurion-ardoise',
    label: 'Ardoise',
    description: 'Gris minéral · sobre · intemporel',
    accent: '#475569',
    dark: '#1f2937',
    font: 'sans',
    radius: 'square',
    variant: 'classic',
  },
  {
    id: 'aurion-azur',
    label: 'Azur',
    description: 'Bleu ciel · arrondi · dynamique',
    accent: '#0284c7',
    dark: '#0c4a6e',
    font: 'sans',
    radius: 'round',
    variant: 'classic',
  },
  {
    id: 'aurion-terracotta',
    label: 'Terracotta',
    description: 'Terre cuite · serif · artisanal',
    accent: '#c2410c',
    dark: '#431407',
    font: 'serif',
    radius: 'round',
    variant: 'signature',
  },
  {
    id: 'aurion-foret',
    label: 'Forêt',
    description: 'Vert profond · angles nets · naturel',
    accent: '#15803d',
    dark: '#052e16',
    font: 'sans',
    radius: 'square',
    variant: 'minimal',
  },
  // V2 — huit ambiances supplémentaires : le catalogue passe de 12 à 20 modèles.
  // Chaque entrée reste une variante réelle du moteur (classic / minimal / signature),
  // avec sa propre palette et sa typographie : ajouter un style ici l'expose à l'API,
  // au carrousel et aux trois moteurs PDF/DOCX/ODT sans autre modification.
  {
    id: 'aurion-ivoire',
    label: 'Ivoire',
    description: 'Ivoire chaud · serif · élégance discrète',
    accent: '#8a6a2f',
    dark: '#3b2f1b',
    font: 'serif',
    radius: 'round',
    variant: 'signature',
  },
  {
    id: 'aurion-ocean',
    label: 'Océan',
    description: 'Bleu profond · arrondi · professionnel',
    accent: '#0e7490',
    dark: '#082f49',
    font: 'sans',
    radius: 'round',
    variant: 'classic',
  },
  {
    id: 'aurion-menthe',
    label: 'Menthe',
    description: 'Vert menthe · angles nets · frais',
    accent: '#0f766e',
    dark: '#042f2e',
    font: 'sans',
    radius: 'square',
    variant: 'minimal',
  },
  {
    id: 'aurion-bordeaux',
    label: 'Bordeaux',
    description: 'Bordeaux profond · serif · prestige',
    accent: '#9f1239',
    dark: '#4c0519',
    font: 'serif',
    radius: 'round',
    variant: 'signature',
  },
  {
    id: 'aurion-indigo',
    label: 'Indigo',
    description: 'Indigo · angles nets · contemporain',
    accent: '#4338ca',
    dark: '#1e1b4b',
    font: 'sans',
    radius: 'square',
    variant: 'classic',
  },
  {
    id: 'aurion-ambre',
    label: 'Ambre',
    description: 'Ambre chaud · serif · artisanal',
    accent: '#b45309',
    dark: '#431407',
    font: 'serif',
    radius: 'round',
    variant: 'signature',
  },
  {
    id: 'aurion-rubis',
    label: 'Rubis',
    description: 'Rubis · arrondi · affirmé',
    accent: '#be123c',
    dark: '#4c0519',
    font: 'sans',
    radius: 'round',
    variant: 'classic',
  },
  {
    id: 'aurion-carbone',
    label: 'Carbone',
    description: 'Carbone · angles nets · technique',
    accent: '#334155',
    dark: '#0f172a',
    font: 'sans',
    radius: 'square',
    variant: 'minimal',
  },
]);

export const DOCUMENT_STYLE_IDS: readonly string[] = Object.freeze(DOCUMENT_STYLES.map(style => style.id));

const STYLE_BY_ID = new Map(DOCUMENT_STYLES.map(style => [style.id, style]));

export function isDocumentStyle(value: unknown): value is string {
  return typeof value === 'string' && STYLE_BY_ID.has(value);
}

/**
 * Thème de rendu d'un style enregistré. Une valeur inconnue (ancienne sauvegarde, import,
 * requête forgée) ne casse jamais la génération : elle retombe sur le style classique.
 */
export function themeForDocumentStyle(value: unknown) {
  const style = STYLE_BY_ID.get(String(value || '')) || STYLE_BY_ID.get(DEFAULT_DOCUMENT_STYLE)!;
  return {
    accent: style.accent,
    dark: style.dark,
    font: style.font,
    radius: style.radius,
    variant: style.variant,
    customized: false,
  };
}
