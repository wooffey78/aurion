import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=p=>fs.readFileSync(new URL(`../../${p}`,import.meta.url),'utf8');
const back=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('étape 20: reset PostgreSQL explicitement protégé',()=>{
  const ps=back('scripts/reset-test-data.ps1');
  const sql=back('scripts/reset-test-data.sql');
  assert.match(ps,/AURION_ALLOW_DATA_RESET=true/);
  assert.match(ps,/AURION_ENV -eq 'production'/);
  assert.match(ps,/DATABASE_URL/);
  assert.match(sql,/TRUNCATE TABLE public\.%I RESTART IDENTITY CASCADE/);
  assert.match(sql,/NOT IN \('schema_migrations'\)/);
});

test('étapes 21-22: les changements d’action ne forcent pas le haut, une nouvelle section oui',()=>{
  const dash=root('assets/js/pages/dashboard.js');
  assert.match(dash,/const previous=S\.view/);
  assert.match(dash,/if\(previous!==id\)/);
  assert.match(dash,/window\.scrollTo\(0,0\)/);
});

test('étape 23: compte admin et invités sont réservés à l’administration',()=>{
  const cli=back('src/create-admin.ts');
  const admin=back('src/routes/admin.ts');
  assert.match(cli,/platform_admins/);
  assert.match(admin,/isAdmin\(request\.auth!\.userId\)/);
  assert.match(admin,/admin_guest_invites/);
  assert.match(admin,/vip_guest_accounts/);
});

test('étape 24: sidebar, scrollbar et recherches utilisent la charte Aurion',()=>{
  const css=root('assets/css/app.css');
  assert.match(css,/--aurion-card-gap/);
  assert.match(css,/::-webkit-scrollbar/);
  assert.match(css,/\.dashboard-shell\{grid-template-columns:220px 1fr\}/);
  assert.match(css,/\.client-toolbar input/);
  assert.match(css,/\.doc-search input/);
});

test('étape 25: le journal affiche le rappel de messagerie demandé',()=>{
  const other=root('assets/js/pages/dash/other.js');
  const business=root('backend/src/routes/business.ts');
  assert.match(business,/kind:'mail',[\s\S]*Connectez votre messagerie \(une seule fois\) pour envoyer vos devis et factures et mettre votre agenda à jour\./);
  assert.match(business,/action:'settings'/);
  assert.match(other,/data-go="settings">Configurer maintenant/);
});
