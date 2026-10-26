import crypto from 'node:crypto';
import { query } from '../db.js';

export interface Theme { accent: string; dark: string; font: 'sans' | 'serif'; radius: 'round' | 'square'; customized: boolean }

// Palette d'accents sobres et lisibles à l'impression. L'accent par défaut dépend de l'entreprise : deux entreprises n'ont pas le même document.
const ACCENTS = ['#0b63ce', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#0369a1', '#4d7c0f', '#c2410c', '#6d28d9', '#0e7490', '#a21caf', '#1d4ed8'];
const mix = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v * (1 - t) + pb[i]! * t).toString(16).padStart(2, '0')).join('');
};
export const darkOf = (accent: string) => mix(accent, '#0b1220', 0.82);
export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);

export function defaultTheme(orgId: string): Theme {
  const h = crypto.createHash('sha256').update('aurion-theme:' + orgId).digest();
  const accent = ACCENTS[h[0]! % ACCENTS.length]!;
  return { accent, dark: darkOf(accent), font: h[1]! % 3 === 0 ? 'serif' : 'sans', radius: h[2]! % 4 === 0 ? 'square' : 'round', customized: false };
}

export async function getTheme(orgId: string): Promise<Theme> {
  const r = (await query('select accent,dark,font,radius,customized from document_themes where organization_id=$1', [orgId])).rows[0];
  return r ? { accent: r.accent, dark: r.dark, font: r.font, radius: r.radius, customized: r.customized } : defaultTheme(orgId);
}
export async function saveTheme(orgId: string, t: Partial<Theme>) {
  const cur = await getTheme(orgId);
  const accent = isHex(t.accent) ? t.accent.toLowerCase() : cur.accent;
  const next = { accent, dark: isHex(t.dark) ? t.dark.toLowerCase() : darkOf(accent), font: t.font === 'serif' ? 'serif' : t.font === 'sans' ? 'sans' : cur.font, radius: t.radius === 'square' ? 'square' : t.radius === 'round' ? 'round' : cur.radius };
  await query(`insert into document_themes(organization_id,accent,dark,font,radius,customized) values($1,$2,$3,$4,$5,true)
    on conflict(organization_id) do update set accent=excluded.accent,dark=excluded.dark,font=excluded.font,radius=excluded.radius,customized=true,updated_at=now()`, [orgId, next.accent, next.dark, next.font, next.radius]);
  return { ...next, customized: true } as Theme;
}
export async function resetTheme(orgId: string) { await query('delete from document_themes where organization_id=$1', [orgId]); return defaultTheme(orgId); }
