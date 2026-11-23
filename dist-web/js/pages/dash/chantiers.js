// 15.4.50 — Écran « Chantiers » (B1) : regroupement d'ouvrages, rentabilité RÉELLE et dérive
// devis→facture. Le chantier référence les objets de leurs modules propriétaires (aucune
// seconde fiche). Représentation des données au choix de l'utilisateur (charts.js) : la
// répartition des coûts se lit en camembert ou barres, la comparaison devis/facturé/coûts
// en barres ou courbe — jamais l'inverse, et rien n'est inventé sans données.
import { api, getActiveActivity } from '../../core/api.js';
import { S, e, money, toast, modalForm, askConfirm } from './core.js';
import { renderChart, chartToolbar, bindChartToolbar } from '../../core/charts.js';
import { enabled, hiddenPanelMarkup } from '../../core/profile-features.js';

let selectedId = null;
let lastProfit = null;
let statusFilter = '';

const STATUS_LABELS = { active: 'Actif', completed: 'Terminé', archived: 'Archivé' };

const linkTypes = [
  { id: 'quote', label: 'Devis / facture' },
  { id: 'appointment', label: 'Rendez-vous' },
  { id: 'sav_case', label: 'SAV' },
  { id: 'time_session', label: 'Session de temps' },
  { id: 'expense', label: 'Note de frais' },
  { id: 'document', label: 'Document' },
];

function chantierCard(c) {
  const invoiced = Number(c.invoicedTotalTtc || 0), quote = Number(c.quoteTotalTtc || 0);
  const ratio = quote > 0 ? Math.round(invoiced / quote * 100) : null;
  return `<div class="list-row" data-chantier="${e(c.id)}" role="button" tabindex="0" aria-pressed="${selectedId === c.id}">
    <div><b>${e(c.name)}</b><small>${c.status && c.status !== 'active' ? `[${e(STATUS_LABELS[c.status] || c.status)}] ` : ''}${e(c.clientName || 'Client non rattaché')}${c.location ? ` · ${e(c.location)}` : ''} · ${c.linkCount} élément(s)</small></div>
    <div style="text-align:right"><b>${money(invoiced)}</b><small>${quote > 0 ? `devis ${money(quote)}${ratio != null ? ` · ${ratio} % facturé` : ''}` : 'aucun devis accepté rattaché'}</small></div>
  </div>`;
}

function view() {
  const rows = Array.isArray(S.chantiers) ? S.chantiers : [];
  const maintenanceOn = enabled('maintenance');
  return `<div class="page-head"><div><span class="eyebrow">CHANTIERS</span><h1>Chantiers et rentabilité réelle</h1>
    <p>Regroupez devis, rendez-vous, temps, SAV et factures d'un même ouvrage : Aurion calcule le coût réel, la marge réelle et signale la dérive AVANT la facturation complémentaire — depuis vos données, sans estimation inventée.</p></div>
    <div class="button-row"><button class="btn primary" id="new-chantier">+ Nouveau chantier</button>${maintenanceOn ? '<button class="btn secondary" id="new-contract">Contrat d\u2019entretien</button>' : ''}</div></div>
  <section class="panel"><div class="section-title"><h2>Mes chantiers</h2><span class="pill">${rows.length}</span>
    <select id="chantier-status-filter" aria-label="Filtrer les chantiers par statut" style="margin-left:auto;max-width:200px">
      <option value="">Tous les statuts</option>
      ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${statusFilter === v ? 'selected' : ''}>${e(l)}</option>`).join('')}
    </select></div>
    <div class="list" id="chantier-list" role="region" aria-label="Liste des chantiers">${rows.map(chantierCard).join('') || '<p class="muted">Aucun chantier. Créez un chantier puis rattachez-y vos devis et interventions existants : les objets restent la propriété de leurs modules.</p>'}</div>
    ${hiddenPanelMarkup()}
  </section>
  ${selectedId ? `<section class="panel" id="chantier-detail"><div class="section-title"><h2>Rentabilité du chantier</h2><span class="pill" id="profit-badge"></span><div class="button-row" id="chantier-status-actions" style="margin-left:auto"></div></div><div id="profit-body"><p class="muted">Chargement…</p></div></section>` : ''}`;
}

async function loadList() {
  try {
    const params = new URLSearchParams();
    const headers = {};
    if (getActiveActivity()) { params.set('activityId', getActiveActivity()); headers['x-aurion-activity-id'] = getActiveActivity(); }
    if (statusFilter) params.set('status', statusFilter);
    const res = await api.authFetch(`/chantiers${params.toString() ? `?${params.toString()}` : ''}`, { headers });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Chargement impossible.');
    const data = await res.json();
    S.chantiers = data.chantiers || [];
  } catch (x) { toast(x.message || 'Chantiers indisponibles : vérifiez la connexion.', 'error'); S.chantiers = S.chantiers || []; }
}

function costChart() {
  const p = lastProfit;
  if (!p) return null;
  const parts = [
    { label: 'Main-d\u2019œuvre valorisée', value: Number(p.laborCostTtc || 0) },
    { label: 'SAV', value: Number((p.chantier?.savTotalTtc) || 0) },
    { label: 'Frais', value: Number((p.chantier?.expensesTotalTtc) || 0) },
  ].filter(x => x.value > 0);
  if (!parts.length) return null;
  return { title: `Coûts réels — ${p.chantier?.name || ''}`, kind: 'distribution', unit: '€ TTC', series: parts, allowed: ['pie', 'bar'] };
}

function compareChart() {
  const p = lastProfit;
  if (!p) return null;
  const c = p.chantier || {};
  const series = [
    { label: 'Devis accepté', value: Number(c.quoteTotalTtc || 0) },
    { label: 'Facturé', value: Number(c.invoicedTotalTtc || 0) },
    { label: 'Coûts réels', value: Number(p.costsTtc || 0) },
  ];
  if (series.every(x => !x.value)) return null;
  return { title: `Devis / facturé / coûts — ${c.name || ''}`, kind: 'comparison', unit: '€ TTC', series, allowed: ['bar', 'line', 'candle'] };
}

async function loadProfitability() {
  const body = document.querySelector('#profit-body');
  if (!body || !selectedId) return;
  body.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const res = await api.authFetch(`/chantiers/${encodeURIComponent(selectedId)}/profitability${S.hourlyRateCents ? `?hourlyRateCents=${encodeURIComponent(S.hourlyRateCents)}` : ''}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Calcul impossible.');
    lastProfit = await res.json();
    renderProfit();
  } catch (x) {
    body.innerHTML = `<p class="error">${e(x.message)}</p>`;
  }
}

function statusActionsHtml(status) {
  const b = (to, label) => `<button type="button" class="btn secondary small" data-status-to="${to}">${e(label)}</button>`;
  if (status === 'active') return b('completed', 'Marquer terminé');
  if (status === 'completed') return b('active', 'Réouvrir') + ' ' + b('archived', 'Archiver');
  if (status === 'archived') return b('active', 'Réactiver');
  return '';
}

async function changeStatus(to) {
  if (!selectedId) return;
  try {
    const res = await api.authFetch(`/chantiers/${encodeURIComponent(selectedId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: to }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Changement de statut refusé.');
    toast(`Chantier ${(STATUS_LABELS[to] || to).toLowerCase()}.`, 'success');
    await loadList();
    const root = document.querySelector('#view');
    if (root && S.view === 'chantiers') { root.innerHTML = view(); bind(); await loadProfitability(); }
  } catch (x) { toast(x.message || 'Changement de statut impossible.', 'error'); }
}

function renderProfit() {
  const p = lastProfit;
  const body = document.querySelector('#profit-body');
  const badge = document.querySelector('#profit-badge');
  if (!p || !body) return;
  if (badge) {
    badge.textContent = p.alertLevel === 'drift' ? '🚨 Dérive' : p.alertLevel === 'watch' ? '⚠ À surveiller' : '✅ Sous contrôle';
    badge.title = p.reasons.join(' ');
  }
  const actions = document.querySelector('#chantier-status-actions');
  if (actions) {
    actions.innerHTML = statusActionsHtml(p.chantier?.status);
    actions.querySelectorAll('[data-status-to]').forEach(btn => btn.addEventListener('click', () => changeStatus(btn.dataset.statusTo)));
  }
  const kpis = [
    ['Devis accepté (TTC)', money(p.chantier?.quoteTotalTtc || 0)],
    ['Facturé (TTC)', money(p.revenueTtc)],
    ['Coûts réels (TTC)', money(p.costsTtc)],
    ['Marge réelle', `${money(p.marginTtc)}${p.marginPct != null ? ` (${p.marginPct} %)` : ''}`],
    ['Dérive vs devis', p.driftVsQuotePct != null ? `${p.driftVsQuotePct} %` : 'n/a — rattachez le devis'],
    ['Reste à facturer', p.restToInvoiceTtc != null ? money(p.restToInvoiceTtc) : 'n/a — rattachez le devis'],
    ['Encaissé', `${money(p.collectedTtc || 0)}${p.collectionPct != null ? ` (${p.collectionPct} % du facturé)` : ''}`],
    ['Budget restant', p.remainingBudgetTtc != null ? money(p.remainingBudgetTtc) : 'n/a — rattachez le devis'],
  ];
  body.innerHTML = `
    <div class="metrics" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">${kpis.map(([k, v]) => `<article class="glass" style="padding:10px;border-radius:10px"><small style="opacity:.75">${e(k)}</small><br><b>${e(v)}</b></article>`).join('')}</div>
    ${p.reasons.length ? `<ul class="muted" style="margin:10px 0 0 18px">${p.reasons.map(r => `<li>${e(r)}</li>`).join('')}</ul>` : ''}
    ${p.alertLevel === 'drift' ? `<p class="error">Dérive confirmée : vérifiez les coûts et le reste à facturer avant d'émettre une facture complémentaire. La justification est exigée par le contrôle de dérive.</p>` : ''}
    <div id="chantier-charts"></div>
    <div class="section-title" style="margin-top:14px"><h3>Éléments rattachés (${p.links?.length || 0})</h3><button class="btn secondary small" id="link-object">+ Rattacher un élément</button></div>
    <div class="list">${(p.links || []).map(l => `<div class="list-row"><div><b>${e(linkTypes.find(t => t.id === l.objectType)?.label || l.objectType)}</b><small>rattaché le ${new Date(l.createdAt).toLocaleDateString('fr-FR')}</small></div></div>`).join('') || '<p class="muted">Aucun élément rattaché.</p>'}</div>`;
  // Graphiques au choix : chaque bloc expose sa barre de types PERMIS pour ces données.
  const chartsRoot = body.querySelector('#chantier-charts');
  const blocks = [costChart(), compareChart()].filter(Boolean);
  blocks.forEach((data, i) => {
    const id = `chart-chantier-${i}`;
    const wrap = document.createElement('div');
    wrap.className = 'panel';
    wrap.style.marginTop = '12px';
    wrap.innerHTML = `<div class="section-title"><h3>${e(data.title)}</h3></div>${chartToolbar(id, data.allowed, data.allowed[0])}<div id="${id}" class="chart-container"></div>`;
    chartsRoot.appendChild(wrap);
    const render = (cid, d, type) => renderChart(cid, d, type);
    render(id, data, data.allowed[0]);
    bindChartToolbar(chartsRoot, id, data, render);
  });
}

function bind() {
  document.querySelector('#new-chantier')?.addEventListener('click', () => {
    const clientOptions = (S.clients || []).map(c => `<option value="${e(c.id)}">${e(c.name)}</option>`).join('');
    modalForm('Nouveau chantier', `
      <label>Nom du chantier<input name="name" required maxlength="200" placeholder="Ex. Rénovation salle de bain — M. Martin"></label>
      <label>Client<select name="clientId"><option value="">— Aucun —</option>${clientOptions}</select></label>
      <label>Lieu<input name="location" maxlength="300" placeholder="Adresse ou repère du chantier"></label>
      <label>Notes<textarea name="notes" maxlength="4000"></textarea></label>`,
      async (m) => {
        const fd = new FormData(m.querySelector('form'));
        const res = await api.authFetch('/chantiers', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), clientId: fd.get('clientId') || null, location: fd.get('location') || null, notes: fd.get('notes') || '', activityId: getActiveActivity() }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Création refusée.');
        const created = await res.json();
        selectedId = created.id;
        await refreshList();
      }, { done: 'Chantier créé' });
  });

  document.querySelector('#new-contract')?.addEventListener('click', () => {
    const clientOptions = (S.clients || []).map(c => `<option value="${e(c.id)}">${e(c.name)}</option>`).join('');
    modalForm('Contrat d\u2019entretien (récurrence)', `
      <p class="muted">Les rendez-vous sont PROPOSÉS à la planification — jamais créés automatiquement. Proposé car votre métier inclut l'entretien récurrent.</p>
      <label>Nom du contrat<input name="name" required maxlength="200" placeholder="Ex. Entretien chaudière — M. Martin"></label>
      <label>Client<select name="clientId" required>${clientOptions}</select></label>
      <label>Fréquence<select name="frequency"><option value="monthly">Mensuelle</option><option value="bimonthly">Bimestrielle</option><option value="quarterly" selected>Trimestrielle</option><option value="semiannual">Semestrielle</option><option value="annual">Annuelle</option></select></label>
      <label>Jour souhaité<select name="weekday">${['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map((d, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Première occurrence<input type="date" name="firstOccurrence" required value="${new Date().toISOString().slice(0, 10)}"></label>
      <label>Durée (minutes)<input type="number" name="durationMinutes" min="15" max="600" value="120"></label>`,
      async (m) => {
        const fd = new FormData(m.querySelector('form'));
        const res = await api.authFetch('/maintenance/contracts', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), clientId: fd.get('clientId'), frequency: fd.get('frequency'), weekday: Number(fd.get('weekday')), firstOccurrence: fd.get('firstOccurrence'), durationMinutes: Number(fd.get('durationMinutes') || 120) }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Création refusée.');
        toast('Contrat créé. Ouvrez l\u2019écran pour consulter les occurrences proposées.', 'success');
      }, { done: 'Contrat créé' });
  });

  document.querySelector('#chantier-status-filter')?.addEventListener('change', async ev => {
    statusFilter = ev.target.value;
    await refreshList();
  });

  document.querySelector('#link-object')?.addEventListener('click', () => {
    if (!selectedId) return;
    const quoteOptions = (S.quotes || []).slice(0, 100).map(q => `<option value="${e(q.id)}">${e(q.number || q.id)} — ${e(q.client_name || '')}</option>`).join('');
    const apptOptions = (S.appointments || []).slice(0, 100).map(a => `<option value="${e(a.id)}">${e(a.title)} — ${new Date(a.starts_at || a.startsAt || Date.now()).toLocaleDateString('fr-FR')}</option>`).join('');
    modalForm('Rattacher un élément au chantier', `
      <p class="muted">L'objet reste la propriété de son module : le chantier ne fait que le référencer.</p>
      <label>Type<select name="objectType" id="link-type">${linkTypes.map(t => `<option value="${t.id}">${e(t.label)}</option>`).join('')}</select></label>
      <label>Devis / facture<select name="quoteId" data-for="quote"><option value="">— Choisir —</option>${quoteOptions}</select></label>
      <label>Rendez-vous<select name="appointmentId" data-for="appointment"><option value="">— Choisir —</option>${apptOptions}</select></label>
      <label>Identifiant (SAV, temps, frais, document)<input name="objectId" data-for="other" placeholder="Identifiant de l'objet (visible dans son écran)"></label>`,
      async (m) => {
        const fd = new FormData(m.querySelector('form'));
        const type = String(fd.get('objectType'));
        const objectId = type === 'quote' ? fd.get('quoteId') : type === 'appointment' ? fd.get('appointmentId') : fd.get('objectId');
        if (!objectId) throw new Error('Choisissez l\u2019objet à rattacher.');
        const res = await api.authFetch(`/chantiers/${encodeURIComponent(selectedId)}/links`, { method: 'POST', body: JSON.stringify({ objectType: type, objectId }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Rattachement refusé.');
        await loadProfitability();
      }, { done: 'Élément rattaché' });
    const form = document.querySelector('#generic-form');
    form?.querySelector('#link-type')?.addEventListener('change', ev => {
      const t = ev.target.value;
      form.querySelectorAll('[data-for]').forEach(sel => {
        const show = (t === 'quote' && sel.dataset.for === 'quote') || (t === 'appointment' && sel.dataset.for === 'appointment') || (!['quote', 'appointment'].includes(t) && sel.dataset.for === 'other');
        sel.closest('label').hidden = !show;
      });
    });
    form?.querySelector('#link-type')?.dispatchEvent(new Event('change'));
  });

  // 15.4.52 — plus de re-rendu récursif : l'ancien « loadList().then(rendu + bind()) »
  // réinstallait les écouteurs à l'infini (DOM instable, clics perdus). La liste se
  // rafraîchit via refreshList(), qui ne réécrit que le bloc liste.
  refreshList();
}

/** Réattache les gestionnaires de lignes (appelé après chaque rafraîchissement de liste). */
function bindRows() {
  const list = document.querySelector('#chantier-list');
  if (!list) return;
  const open = async (row) => {
    selectedId = String(row.dataset.chantier);
    [...list.querySelectorAll('[data-chantier]')].forEach(r => r.setAttribute('aria-pressed', String(r === row)));
    const root = document.querySelector('#view');
    root.innerHTML = view();
    bind();
    await loadProfitability();
  };
  list.querySelectorAll('[data-chantier]').forEach(row => {
    row.onclick = () => open(row);
    row.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(row); } };
  });
}

/** Charge la liste puis met à jour UNIQUEMENT le bloc liste (compteur + lignes). */
async function refreshList() {
  await loadList();
  const root = document.querySelector('#view');
  if (!root || S.view !== 'chantiers') return;
  const rows = Array.isArray(S.chantiers) ? S.chantiers : [];
  const listEl = root.querySelector('#chantier-list');
  if (listEl) {
    listEl.innerHTML = rows.map(chantierCard).join('') || '<p class="muted">Aucun chantier. Créez un chantier puis rattachez-y vos devis et interventions existants : les objets restent la propriété de leurs modules.</p>';
    bindRows();
  }
  const pill = root.querySelector('.panel .section-title .pill');
  if (pill) pill.textContent = String(rows.length);
}

export const chantiers = { view, bind };
