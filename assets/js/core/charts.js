// 15.4.50 — Module de graphiques SVG déterministe (aucune bibliothèque externe, aucune IA).
// Le même jeu de données peut être lu sous plusieurs représentations : l'utilisateur CHOISIT
// le type (barres, courbe, bougies, camembert) via une barre de commutation accessible au
// clavier. Règle honnête : tous les types ne s'appliquent pas à toutes les données — une
// série temporelle n'offre jamais le camembert, une répartition n'offre jamais la courbe
// (voir monthly-report.ts suggestedTypes). Rendu : SVG inline, échelles calculées, valeurs
// lisibles, contrastes de la charte, fallback texte pour les lecteurs d'écran.
import { escapeHtml as e } from './ui.js';

export const CHART_TYPES = [
  { id: 'bar', label: 'Barres', icon: '▁▃▅' },
  { id: 'line', label: 'Courbe', icon: '⌁' },
  { id: 'candle', label: 'Bougies', icon: '▮' },
  { id: 'pie', label: 'Camembert', icon: '◕' },
];

export const SERIES_KIND = {
  bar: 'comparaison', line: 'tendance temporelle', candle: 'tendance min-max', pie: 'répartition',
};

/**
 * Barre de commutation : boutons de type (radio simulée, navigable au clavier).
 * `allowed` limite les types proposés pour CE jeu de données (honnêteté sémantique).
 */
export function chartToolbar(containerId, allowed, current, onChange) {
  const types = CHART_TYPES.filter(t => (allowed || CHART_TYPES.map(x => x.id)).includes(t.id));
  return `<div class="chart-toolbar" role="toolbar" aria-label="Type de représentation des données" data-chart="${e(containerId)}">${types.map(t =>
    `<button type="button" class="chart-type-btn ${t.id === current ? 'active' : ''}" data-type="${t.id}" aria-pressed="${t.id === current}" title="${e(t.label)} — ${e(SERIES_KIND[t.id] || '')}"><span aria-hidden="true">${t.icon}</span> ${e(t.label)}</button>`).join('')}</div>`;
}

/** Bind de la barre : bascule le rendu sans recharger les données. */
export function bindChartToolbar(root, containerId, dataset, renderChart) {
  const bar = root.querySelector(`.chart-toolbar[data-chart="${containerId}"]`);
  if (!bar) return;
  bar.querySelectorAll('.chart-type-btn').forEach(btn => {
    btn.onclick = () => {
      bar.querySelectorAll('.chart-type-btn').forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
      renderChart(containerId, dataset, btn.dataset.type);
    };
  });
}

const fmt = v => `${Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}`;

function svgOpen(width, height, label) {
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${e(label)}" preserveAspectRatio="xMidYMid meet" style="max-width:100%">`;
}

/** Données → série normalisée {labels, values, extras?, positives?}. */
function normalizeSeries(data) {
  const labels = data.series.map(s => String(s.label));
  const values = data.series.map(s => Number(s.value || 0));
  const extras = data.series.map(s => s.extra == null ? null : Number(s.extra));
  return { labels, values, extras };
}

function barChart(data, width, height) {
  const { labels, values } = normalizeSeries(data);
  const max = Math.max(1, ...values.map(Math.abs));
  const pad = 34, gap = 8;
  const bw = Math.max(6, (width - pad * 2 - gap * (values.length - 1)) / Math.max(1, values.length));
  const base = height - 26;
  let out = svgOpen(width, height, `Graphique en barres : ${e(data.title || '')}. ${values.map((v, i) => `${labels[i]} : ${fmt(v)}`).join(', ')}`);
  out += `<line x1="${pad}" y1="${base}" x2="${width - pad}" y2="${base}" stroke="var(--line,#9fbde0)" stroke-width="1"/>`;
  values.forEach((v, i) => {
    const h = Math.max(2, Math.abs(v) / max * (base - 30));
    const x = pad + i * (bw + gap), y = v >= 0 ? base - h : base;
    out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="var(--accent,#0f2aa6)"><title>${e(labels[i])} : ${fmt(v)}</title></rect>`;
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${height - 10}" font-size="10" text-anchor="middle" fill="currentColor" opacity="0.75">${e(labels[i].slice(0, 7))}</text>`;
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.85">${e(fmt(v))}</text>`;
  });
  return out + '</svg>';
}

function lineChart(data, width, height) {
  const { labels, values, extras } = normalizeSeries(data);
  // Correctif 15.4.50-r2 : casts TypeScript « as number[] » invalides en JavaScript navigateur
  // — ils empêchaient le parse du module, donc le démarrage complet de l'application
  // (chaîne d'import main.js → dashboard.js → other.js → charts.js) et rendaient tous les
  // boutons inertes. Le filtrage suffit : les valeurs sont déjà des nombres (normalizeSeries).
  const observed = extras.filter(x => x != null);
  const max = Math.max(1, ...values, ...observed);
  const min = Math.min(0, ...values, ...observed);
  const pad = 40;
  const plotW = width - pad * 2, plotH = height - 46;
  const px = i => pad + (values.length <= 1 ? plotW / 2 : i * plotW / (values.length - 1));
  const py = v => height - 26 - ((v - min) / Math.max(1e-9, max - min)) * plotH;
  let out = svgOpen(width, height, `Graphique en courbe : ${e(data.title || '')}. ${values.map((v, i) => `${labels[i]} : ${fmt(v)}`).join(', ')}`);
  out += `<line x1="${pad}" y1="${py(0)}" x2="${width - pad}" y2="${py(0)}" stroke="var(--line,#9fbde0)" stroke-width="1"/>`;
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  out += `<path d="${path}" fill="none" stroke="var(--accent,#0f2aa6)" stroke-width="2.5" stroke-linejoin="round"/>`;
  values.forEach((v, i) => {
    out += `<circle cx="${px(i).toFixed(1)}" cy="${py(v).toFixed(1)}" r="3.5" fill="var(--accent,#0f2aa6)"><title>${e(labels[i])} : ${fmt(v)}</title></circle>`;
    out += `<text x="${px(i).toFixed(1)}" y="${height - 10}" font-size="10" text-anchor="middle" fill="currentColor" opacity="0.75">${e(labels[i].slice(0, 7))}</text>`;
  });
  if (extras.some(x => x != null)) {
    const path2 = extras.map((v, i) => v == null ? '' : `${i && extras[i - 1] != null ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
    out += `<path d="${path2}" fill="none" stroke="var(--accent-2,#166534)" stroke-width="2" stroke-dasharray="4 3"/>`;
    extras.forEach((v, i) => { if (v != null) out += `<circle cx="${px(i).toFixed(1)}" cy="${py(v).toFixed(1)}" r="3" fill="var(--accent-2,#166534)"><title>${e(labels[i])} (secondaire) : ${fmt(v)}</title></circle>`; });
    out += `<text x="${pad}" y="14" font-size="10" fill="currentColor" opacity="0.7">Ligne pleine : valeur principale · pointillés : valeur secondaire</text>`;
  }
  return out + '</svg>';
}

/**
 * Bougies : pour chaque période, mèche min→max et corps principal→secondaire (ex. facturé vs
 * encaissé). Convention assumée : corps = valeur principale, mèche = enveloppe min-max des
 * valeurs observées — ce ne sont PAS des bougies de marché financier, et l'étiquette le dit.
 */
function candleChart(data, width, height) {
  const { labels, values, extras } = normalizeSeries(data);
  const all = [...values, ...extras.filter(x => x != null)];
  const max = Math.max(1, ...all), min = Math.min(0, ...all);
  const pad = 40;
  const plotW = width - pad * 2;
  const cw = Math.max(8, Math.min(26, plotW / Math.max(1, values.length) * 0.55));
  const step = plotW / Math.max(1, values.length);
  const py = v => height - 26 - ((v - min) / Math.max(1e-9, max - min)) * (height - 46);
  let out = svgOpen(width, height, `Graphique en bougies (enveloppe min-max) : ${e(data.title || '')}. ${values.map((v, i) => `${labels[i]} : principal ${fmt(v)}${extras[i] != null ? `, secondaire ${fmt(extras[i])}` : ''}`).join(', ')}`);
  out += `<line x1="${pad}" y1="${py(0)}" x2="${width - pad}" y2="${py(0)}" stroke="var(--line,#9fbde0)" stroke-width="1"/>`;
  values.forEach((v, i) => {
    const cx = pad + step * i + step / 2;
    const second = extras[i] != null ? extras[i] : v;
    const wickLow = Math.min(v, second), wickHigh = Math.max(v, second);
    const bodyTop = py(wickHigh), bodyBottom = py(wickLow);
    out += `<line x1="${cx.toFixed(1)}" y1="${py(wickLow).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${py(wickHigh).toFixed(1)}" stroke="var(--line,#9fbde0)" stroke-width="1"/>`;
    const y = Math.min(bodyTop, bodyBottom), h = Math.max(2, Math.abs(bodyBottom - bodyTop));
    out += `<rect x="${(cx - cw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="var(--accent,#0f2aa6)" opacity="0.85"><title>${e(labels[i])} : principal ${fmt(v)}${extras[i] != null ? `, secondaire ${fmt(extras[i])}` : ''}</title></rect>`;
    out += `<text x="${cx.toFixed(1)}" y="${height - 10}" font-size="10" text-anchor="middle" fill="currentColor" opacity="0.75">${e(labels[i].slice(0, 7))}</text>`;
  });
  out += `<text x="${pad}" y="14" font-size="10" fill="currentColor" opacity="0.7">Corps : valeur principale · mèche : enveloppe des valeurs observées (pas des bougies financières)</text>`;
  return out + '</svg>';
}

// 15.4.53 — palette de répartition issue de la charte claire (bleu fonctionnel, vert,
// or foncé, violet, sauge, rouge) : lisibles sur fond clair, aucune couleur hors charte.
const PIE_COLORS = ['#0f2aa6', '#166534', '#b98a2f', '#4c627f', '#6f9b91', '#a61b1b'];

function pieChart(data, width, height) {
  const { labels, values } = normalizeSeries(data);
  const total = values.reduce((s, v) => s + Math.abs(v), 0);
  const cx = width / 2, cy = height / 2, r = Math.min(width, height) / 2 - 40;
  let angle = -Math.PI / 2;
  let out = svgOpen(width, height, `Graphique camembert (répartition) : ${e(data.title || '')}. ${labels.map((l, i) => `${l} : ${fmt(values[i])}`).join(', ')}`);
  values.forEach((v, i) => {
    const abs = Math.abs(v);
    if (total > 0 && abs / total < 0.0005) return;
    const frac = total > 0 ? abs / total : 0;
    const end = angle + frac * Math.PI * 2;
    const large = end - angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    if (frac >= 0.9999) {
      out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PIE_COLORS[i % PIE_COLORS.length]}"><title>${e(labels[i])} : ${fmt(v)} (100 %)</title></circle>`;
    } else {
      out += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${PIE_COLORS[i % PIE_COLORS.length]}"><title>${e(labels[i])} : ${fmt(v)} (${(frac * 100).toFixed(1)} %)</title></path>`;
    }
    angle = end;
  });
  out += `<circle cx="${cx}" cy="${cy}" r="${(r * 0.55).toFixed(1)}" fill="var(--panel,#eaf3fd)" opacity="0.92"/>`;
  out += `<text x="${cx}" y="${cy - 4}" font-size="13" text-anchor="middle" fill="currentColor">${e(fmt(total))}</text>`;
  out += `<text x="${cx}" y="${cy + 12}" font-size="10" text-anchor="middle" fill="currentColor" opacity="0.7">${e(data.unit || '')}</text>`;
  out += '</svg>';
  // Légende à côté du camembert (couleurs + valeurs) — lisible au clavier et aux lecteurs d'écran.
  out += `<ul class="chart-legend" aria-label="Légende du graphique">${labels.map((l, i) =>
    `<li><span class="legend-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}" aria-hidden="true"></span>${e(l)} — ${e(fmt(values[i]))}${total > 0 ? ` (${(Math.abs(values[i]) / total * 100).toFixed(0)} %)` : ''}</li>`).join('')}</ul>`;
  return out;
}

/**
 * Rend le graphique dans le conteneur `containerId`. Fonction unique d'entrée du module.
 * Types non applicables → message explicite plutôt qu'un rendu mensonger.
 */
export function renderChart(containerId, data, type = 'bar') {
  const root = document.getElementById(containerId);
  if (!root) return;
  const width = 560, height = 240;
  if (!data?.series?.length) {
    root.innerHTML = '<p class="muted">Aucune donnée à représenter pour cette période : rien d\u2019inventé.</p>';
    return;
  }
  if (type === 'pie' && data.kind === 'timeseries') {
    root.innerHTML = '<p class="muted">Un camembert ne représente pas une série temporelle : choisissez barres, courbe ou bougies.</p>';
    return;
  }
  const renderer = { bar: barChart, line: lineChart, candle: candleChart, pie: pieChart }[type] || barChart;
  const html = renderer(data, width, height);
  root.innerHTML = type === 'pie'
    ? `<div class="chart-pie-wrap">${html}</div>`
    : `<div class="chart-wrap" style="color:inherit">${html}</div>`;
  root.dataset.chartType = type;
}
