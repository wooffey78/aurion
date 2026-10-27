import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../../assets/js/pages/dashboard.js', import.meta.url), 'utf8');

test('dashboard initial load and home navigation fetch only data rendered on the home screen', () => {
  assert.match(dashboard, /home:\['clients','quotes','appointments'\]/);
  assert.match(dashboard, /const EXTRAS=\{home:\['timeMetrics','dashboardSummary'\]/);
  assert.match(dashboard, /const initialView=S\.view==='quote'\?'home':S\.view;\s*await load\(\[\.\.\.\(EXTRAS\[initialView\]\|\|\[\]\)\],initialView\)/);
  assert.doesNotMatch(dashboard, /export async function renderDashboard\(\)\{\s*await load\(null\)/);
});

test('expensive dashboard and financial polling is throttled while live time metrics remain responsive', () => {
  assert.match(dashboard, /Date\.now\(\)-lastDashboardSummaryRefreshAt>=30000/);
  assert.match(dashboard, /Date\.now\(\)-lastFinancialRefreshAt>=30000/);
  assert.match(dashboard, /window\.__aurionMetricsTimer=setInterval\(async\(\)=>\{/);
  assert.match(dashboard, /S\.timeMetrics=await api\.timeMetrics\(\)/);
  assert.match(dashboard, /\},5000\)/);
});
