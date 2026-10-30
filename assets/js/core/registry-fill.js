const clean = v => String(v ?? '').trim();

/** Identifiant suffisamment complet et valide pour interroger le registre public. */
export function isValidRegistryIdentifier(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 9 && digits.length !== 14) return false;
  let sum = 0;
  const parity = digits.length % 2;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[i]);
    if (i % 2 === parity) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function normalizeWebsite(value) {
  const raw = clean(value);
  if (!raw) return '';
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try { const url = new URL(candidate); if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return ''; const normalized = url.href; return url.pathname === '/' && !url.search && !url.hash ? normalized.replace(/\/$/, '') : normalized; } catch { return ''; }
}

const previousValue = (previous, key, fallback = '') => clean(previous?.[key] ?? fallback);

// L'adresse de l'entreprise est stockée séparément du code postal et de la ville.
// Lors d'une détection registre, ne conserver dans ce champ que le numéro + nom de rue.
export function normalizeStreetAddress(value, postalCode = '', city = '') {
  const raw = String(value ?? '').replace(/\r/g, '').trim();
  if (!raw) return '';
  const postal = clean(postalCode);
  const town = clean(city);
  const postalRe = postal ? new RegExp(`\\b${postal.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i') : null;
  const townRe = town ? new RegExp(`(?:^|[,;\n]\\s*)${town.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:\\s*$|[,;])`, 'i') : null;
  const lines = raw.split('\n').map(clean).filter(Boolean);
  const cleaned = lines.map(line => {
    let out = line;
    if (postalRe) out = out.replace(postalRe, ' ');
    if (townRe) out = out.replace(townRe, ' ');
    return out.replace(/\s{2,}/g, ' ').replace(/\s*,\s*$/,'').replace(/^\s*,\s*/,'').trim();
  }).filter(Boolean);
  return (cleaned[0] || '').trim();
}

/**
 * Merge public-registry data without replacing user-entered values.
 * Fields such as custom_activity are intentionally not inferred from the
 * generic registry activity label: they represent a more precise user choice.
 */
export function mergeRegistryFields(current = {}, detected = {}, previousAuto = {}) {
  const out = { ...current };
  const canFill = (key, detectedValue) => {
    const cur = clean(current[key]);
    const previous = previousValue(previousAuto, key);
    const incoming = clean(detectedValue);
    if (!incoming) return false;
    return !cur || Boolean(previous && cur === previous);
  };
  const siret = String(detected.siret ?? '').replace(/\D/g, '');
  const siren = String(detected.siren ?? '').replace(/\D/g, '');
  const identifiersValid = (!siret || isValidRegistryIdentifier(siret) && siret.length === 14)
    && (!siren || isValidRegistryIdentifier(siren) && siren.length === 9)
    && (!siret || !siren || siret.slice(0, 9) === siren);
  const detectedMap = {
    name: detected.legalName ?? detected.name,
    activity: detected.activity,
    naf_code: detected.legalActivityCode ?? detected.nafCode ?? detected.naf_code,
    siret: identifiersValid ? (siret || undefined) : undefined,
    siren: identifiersValid ? (siren || undefined) : undefined,
    legal_form: detected.legalForm ?? detected.legal_form,
    address: normalizeStreetAddress(detected.address, detected.postalCode ?? detected.postal_code, detected.city),
    postal_code: detected.postalCode ?? detected.postal_code,
    city: detected.city,
    website: normalizeWebsite(detected.website),
  };
  for (const [key, value] of Object.entries(detectedMap)) {
    if (value !== undefined && value !== null && canFill(key, value)) out[key] = clean(value);
  }
  // A registry's generic activity label is not a reliable "activité précise".
  if (current.custom_activity === undefined) out.custom_activity = clean(detected.custom_activity);
  return out;
}
