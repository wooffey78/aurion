import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/060_activity_forecast_assumptions.sql', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../../assets/js/pages/dash/catalog.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../assets/css/app.css', import.meta.url), 'utf8');

test('les hypothèses prévisionnelles sont validées, persistées et cloisonnées par activité', () => {
  assert.match(route, /forecastAssumptionsInputSchema/);
  assert.match(route, /app\.get\('\/forecast\/assumptions'/);
  assert.match(route, /app\.put\('\/forecast\/assumptions'/);
  assert.match(route, /where organization_id=\$1 and activity_id=\$2/);
  assert.match(route, /where activity_forecast_assumptions\.organization_id=excluded\.organization_id/);
  for (const column of ['potential_clients_per_month','average_ticket_ttc','variable_cost_per_repair','fixed_monthly_costs','reserve_percent']) assert.ok(migration.includes(column));
  assert.match(migration, /references activities\(id\) on delete cascade/);
  assert.match(route, /potentialClientsPerMonth/);
});

test('les catégories du catalogue sont repliées au chargement et leur état est accessible', () => {
  assert.match(catalog, /aria-expanded="false" aria-controls="cat-content-\$\{c\.id\}"/);
  assert.match(catalog, /data-category-content hidden/);
  assert.match(catalog, /function expandCategory/);
  assert.match(catalog, /aria-expanded/);
  assert.match(catalog, /if\(term&&local>0\)expandCategory\(sec,true\)/);
  assert.match(css, /\.catalog-category-toggle/);
});
