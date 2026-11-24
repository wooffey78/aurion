import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../../assets/js/main.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../assets/css/app.css', import.meta.url), 'utf8');

test('landing download cards are rendered before the hero section', () => {
  const install = main.indexOf('class="install-grid"');
  const hero = main.indexOf('class="landing-hero');
  assert.notEqual(install, -1);
  assert.notEqual(hero, -1);
  assert.ok(install < hero);
  // 15.4.54 — l'image fidèle du tableau de bord revient sur la page d'accueil (retrait de la
  // composition « no-visual ») : texte à gauche, visuel dans la moitié droite.
  assert.doesNotMatch(main, /class="landing-hero no-visual"/);
  const heroBlock = main.split('class="landing-hero')[1].split('</section>')[0] || '';
  assert.match(heroBlock, /<figure class="landing-visual">/);
  assert.match(heroBlock, /<img[^>]*aurion-overview/);
  // Le texte précède le visuel dans le DOM : en mobile, l'image tombe juste en dessous du texte.
  const textPos = heroBlock.indexOf('<span class="eyebrow"');
  const imgPos = heroBlock.indexOf('<figure class="landing-visual"');
  assert.ok(textPos > -1 && imgPos > textPos);
});

test('landing visual : hauteur exacte du bloc texte à droite (desktop), sous le texte (mobile)', () => {
  // Desktop : alignement stretch + image remplissant le cadre (même hauteur que les textes).
  assert.match(css, /\.landing-hero\{align-items:stretch\}/);
  assert.match(css, /\.landing-visual\{position:relative/);
  assert.match(css, /\.landing-visual img\{position:absolute/);
  // Mobile/tablette : retour au flux normal (position static) → l'image suit le texte.
  assert.match(css, /@media\(max-width:1050px\)\{\s*\.landing-visual\{min-height:0/);
  assert.match(css, /\.landing-visual img\{position:static/);
  // L'ancienne composition sans image a disparu.
  assert.doesNotMatch(css, /\.landing-hero\.no-visual/);
});

test('landing download cards stay compact and images have no internal padding', () => {
  assert.match(css, /\.install-grid\{[^}]*max-width:820px[^}]*padding:0 12px/);
  assert.match(css, /\.install-card\{padding:0/);
  assert.match(css, /\.install-card img\{display:block;width:46px;height:46px/);
  assert.match(css, /\.install-card\{min-height:68px;padding:0/);
});
