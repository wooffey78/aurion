import { api } from '../core/api.js';
import { mergeRegistryFields } from '../core/registry-fill.js';
import { S, e, toast, askConfirm } from './dash/core.js';

let latestResults = [];
let activeSearch = 0;

const text = value => String(value ?? '').trim();
const displayName = company => text(company?.legalName || company?.name) || 'Entreprise sans dénomination disponible';
const addressLine = company => [company?.address, company?.postalCode, company?.city].map(text).filter(Boolean).join(', ');

function resultCard(company, index) {
  const activity = text(company.activity);
  const legalForm = text(company.legalForm || company.legal_form);
  const identifier = [company.siren ? 'SIREN ' + company.siren : '', company.siret ? 'SIRET ' + company.siret : ''].filter(Boolean).join(' · ');
  const html = [];
  html.push('<article class="company-lookup-result"><header><div><h3>' + e(displayName(company)) + '</h3><p>' + e([legalForm, activity].filter(Boolean).join(' · ') || 'Activité non renseignée') + '</p></div><span class="company-lookup-source">Registre public</span></header>');
  html.push('<dl class="company-lookup-details">');
  if (identifier) html.push('<div><dt>Identifiants</dt><dd>' + e(identifier) + '</dd></div>');
  if (addressLine(company)) html.push('<div><dt>Siège</dt><dd>' + e(addressLine(company)) + '</dd></div>');
  if (company.website) html.push('<div><dt>Site internet</dt><dd>' + e(company.website) + '</dd></div>');
  html.push('</dl><div class="button-row"><button type="button" class="btn secondary small" data-company-apply="' + index + '">Compléter ma fiche entreprise avec ces données</button></div></article>');
  return html.join('');
}

export const companyLookup = {
  view() {
    return '<div class="page-head"><div><span class="eyebrow">REGISTRE PUBLIC DES ENTREPRISES</span><h1>Recherche d’entreprise</h1><p>Recherchez une entreprise par son nom ou sa dénomination. Cette recherche est indépendante de la configuration initiale et des paramètres SIRET/SIREN.</p></div></div>' +
      '<section class="panel company-lookup-panel"><form id="company-lookup-form" class="company-lookup-form" role="search">' +
      '<label class="field" for="company-lookup-query"><span>Nom ou dénomination de l’entreprise</span><input id="company-lookup-query" type="search" minlength="2" maxlength="160" autocomplete="organization" placeholder="Ex. Atelier Martin, Société Exemple" required></label>' +
      '<button class="btn primary" id="company-lookup-submit" type="submit">Rechercher</button></form>' +
      '<p class="help">La recherche consulte le registre public. Elle ne modifie aucune donnée tant que vous n’avez pas choisi explicitement un résultat.</p>' +
      '<p class="company-lookup-status" id="company-lookup-status" role="status" aria-live="polite">Saisissez au moins deux caractères pour commencer.</p>' +
      '<div class="company-lookup-results" id="company-lookup-results" aria-live="polite"></div></section>';
  },
  bind() {
    const form = document.querySelector('#company-lookup-form');
    const input = document.querySelector('#company-lookup-query');
    const submit = document.querySelector('#company-lookup-submit');
    const status = document.querySelector('#company-lookup-status');
    const results = document.querySelector('#company-lookup-results');
    if (!form || !input || !submit || !status || !results) return;

    const renderResults = () => {
      results.innerHTML = latestResults.length ? latestResults.map(resultCard).join('') : '<p class="empty">Aucun résultat à afficher.</p>';
      results.querySelectorAll('[data-company-apply]').forEach(button => {
        button.addEventListener('click', () => applyCompanyResult(Number(button.dataset.companyApply), button));
      });
    };

    const applyCompanyResult = async (index, button) => {
      const candidate = latestResults[index];
      if (!candidate) return;
      const current = S.company || await api.organization();
      const currentValues = {
        name: current.name || '', activity: current.activity || '', custom_activity: current.custom_activity || '',
        siren: current.siren || '', siret: current.siret || '', legal_form: current.legal_form || '',
        address: current.address || '', postal_code: current.postal_code || '', city: current.city || '', website: current.website || '',
      };
      const merged = mergeRegistryFields(currentValues, candidate, {});
      const keys = ['name','activity','siren','siret','legal_form','address','postal_code','city','website'];
      const changed = keys.filter(key => text(merged[key]) && text(merged[key]) !== text(currentValues[key]));
      if (!changed.length) {
        toast('Aucune donnée nouvelle : les informations déjà présentes ont été conservées.', 'info');
        return;
      }
      const labels = {name:'Dénomination',activity:'Activité',siren:'SIREN',siret:'SIRET',legal_form:'Forme juridique',address:'Adresse',postal_code:'Code postal',city:'Ville',website:'Site internet'};
      const summary = changed.map(key => (labels[key] || key) + ' : ' + merged[key]).join('\n');
      if (!await askConfirm({
        title: 'Compléter la fiche de l’entreprise ?',
        message: 'Seuls les champs vides ou non renseignés par l’utilisateur seront complétés. Les valeurs déjà saisies seront conservées.\n\n' + summary,
        confirmLabel: 'Appliquer les données',
      })) return;
      button.disabled = true;
      try {
        const updated = await api.updateOrganization({
          name: merged.name || current.name || '',
          activity: merged.activity || current.activity || '',
          customActivity: current.custom_activity || '',
          siren: merged.siren || current.siren || '',
          siret: merged.siret || current.siret || '',
          legalForm: merged.legal_form || current.legal_form || '',
          address: merged.address || current.address || '',
          postalCode: merged.postal_code || current.postal_code || '',
          city: merged.city || current.city || '',
          website: merged.website || current.website || '',
          configurationData: current.configuration_data || undefined,
          configurationIncomplete: current.configuration_incomplete === true,
        });
        S.company = updated;
        status.textContent = 'Fiche entreprise complétée. Les données manuelles préexistantes ont été conservées.';
        toast('Les champs disponibles ont été reportés dans la fiche entreprise.', 'success');
      } catch (error) {
        toast(error.message || 'Impossible de mettre à jour la fiche entreprise.', 'error');
      } finally {
        button.disabled = false;
      }
    };

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const query = text(input.value);
      if (query.length < 2) {
        status.textContent = 'Saisissez au moins deux caractères.';
        input.focus();
        return;
      }
      const requestId = ++activeSearch;
      submit.disabled = true;
      status.textContent = 'Recherche dans le registre public…';
      results.innerHTML = '';
      latestResults = [];
      try {
        const response = await api.companySearch(query);
        if (requestId !== activeSearch) return;
        latestResults = Array.isArray(response?.companies) ? response.companies.slice(0, 10) : [];
        status.textContent = latestResults.length
          ? latestResults.length + ' résultat(s). Vérifiez la dénomination et les identifiants avant toute mise à jour.'
          : 'Aucune entreprise correspondante n’a été trouvée.';
        renderResults();
      } catch (error) {
        if (requestId !== activeSearch) return;
        status.textContent = error.message || 'La recherche est momentanément indisponible.';
        results.innerHTML = '';
        toast(status.textContent, 'error');
      } finally {
        if (requestId === activeSearch) submit.disabled = false;
      }
    });
  },
};
