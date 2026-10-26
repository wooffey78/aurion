/**
 * Moteur de mentions légales. Chaque mention porte sa PROVENANCE :
 *  - provided           : saisie par l'utilisateur (paramètres de l'activité / de l'entreprise) ;
 *  - detected           : déjà présente dans le modèle fourni par l'utilisateur ;
 *  - auto               : ajoutée automatiquement à partir des paramètres ou d'une formulation légale générale ;
 *  - needs_confirmation : information juridique propre à l'entreprise MANQUANTE : jamais inventée, à renseigner par l'utilisateur.
 */
export type MentionSource = 'provided' | 'detected' | 'auto' | 'needs_confirmation';
export interface Mention { key: string; text: string; source: MentionSource; note?: string }

const GOODS = ['smartphone-repair', 'computer-repair', 'plumbing', 'electrical', 'auto', 'building'];
const WORKS = ['plumbing', 'electrical', 'building', 'auto'];
const CONSUMER = ['smartphone-repair', 'computer-repair', 'plumbing', 'electrical', 'auto', 'building', 'beauty', 'cleaning'];
export const DEFAULT_PAYMENT_TERMS = 'Paiement à réception de facture. En cas de retard de paiement : pénalités au taux de trois fois le taux d’intérêt légal et indemnité forfaitaire de recouvrement de 40 € (clients professionnels).';

export interface MentionCtx {
  kind: 'quote' | 'invoice'; profileCode: string;
  company: { name: string; siret?: string | null; siren?: string | null };
  activity: { legal_form?: string | null; payment_terms?: string | null; insurance_info?: string | null; mediator_info?: string | null; legal_notes?: string | null; quote_validity_days?: number | null; vat_rate?: number | string | null };
  existingText?: string;   // texte d'un modèle utilisateur : sert à détecter ce qui est déjà présent
}
const has = (text: string | undefined, re: RegExp) => !!text && re.test(text);

export function computeMentions(c: MentionCtx): Mention[] {
  const out: Mention[] = [];
  const t = c.existingText;
  const push = (key: string, text: string, source: MentionSource, note?: string, presentRe?: RegExp) => out.push({ key, text, source: presentRe && has(t, presentRe) ? 'detected' : source, note });

  const ident = [c.activity.legal_form, c.company.name, c.company.siren ? `SIREN ${c.company.siren}` : '', c.company.siret ? `SIRET ${c.company.siret}` : ''].filter(Boolean).join(' · ');
  if (c.company.siret || c.company.siren) push('identity', ident, 'provided', undefined, /SIRE[NT]/i);
  else out.push({ key: 'identity', text: '', source: 'needs_confirmation', note: 'SIRET / SIREN non renseigné : à saisir dans Paramètres → Identité légale.' });

  const rate = Number(c.activity.vat_rate ?? 20);
  if (rate > 0) push('vat', `Montants exprimés en euros TTC (TVA ${rate.toLocaleString('fr-FR')} %).`, 'auto', undefined, /TVA|T\.V\.A/i);
  else push('vat', 'TVA non applicable, article 293 B du CGI.', 'auto', 'À confirmer : cette mention suppose que vous relevez de la franchise en base de TVA.', /293\s*B|TVA non applicable/i);

  if (c.kind === 'quote') {
    const d = Number(c.activity.quote_validity_days || 30);
    push('validity', `Devis valable ${d} jours à compter de sa date d’émission.`, c.activity.quote_validity_days ? 'provided' : 'auto', undefined, /valable|validité/i);
  } else {
    const pt = (c.activity.payment_terms || '').trim();
    push('payment', pt || DEFAULT_PAYMENT_TERMS, pt ? 'provided' : 'auto', pt ? undefined : 'Formulation générale : à adapter dans Paramètres → Mentions légales si besoin.', /paiement|règlement|échéance|pénalités/i);
  }
  if (GOODS.includes(c.profileCode))
    push('legal-warranty', 'Garantie légale de conformité (articles L217-3 et suivants du Code de la consommation) et garantie des vices cachés (articles 1641 et suivants du Code civil) applicables à la vente de biens.', 'auto', undefined, /vices cachés|garantie légale/i);
  const ins = (c.activity.insurance_info || '').trim();
  if (ins) push('insurance', ins, 'provided', undefined, /assur/i);
  else if (WORKS.includes(c.profileCode)) out.push({ key: 'insurance', text: '', source: 'needs_confirmation', note: 'Assurance professionnelle / décennale non renseignée (assureur, n° de contrat, couverture géographique) : à saisir, Aurion n’invente pas cette information.' });
  const med = (c.activity.mediator_info || '').trim();
  if (med) push('mediator', med, 'provided', undefined, /médiat/i);
  else if (CONSUMER.includes(c.profileCode)) out.push({ key: 'mediator', text: '', source: 'needs_confirmation', note: 'Médiateur de la consommation non renseigné : obligatoire pour les clients particuliers, à saisir.' });
  const notes = (c.activity.legal_notes || '').trim();
  if (notes) push('notes', notes, 'provided');
  return out;
}
export const mentionLines = (m: Mention[]) => m.filter(x => x.text && x.source !== 'detected').map(x => x.text);
