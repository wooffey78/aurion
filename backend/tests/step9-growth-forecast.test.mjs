import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../assets/js/pages/dash/other.js', import.meta.url), 'utf8');

// Exigence 9: prévision repliée par défaut, mois courant seul visible,
// puis ouverture/fermeture au clic successif sur « Détail ».
assert.match(source, /<div id="forecast-more" hidden class="metrics">/);
assert.match(source, /<span>Mois en cours<\/span>/);
assert.match(source, /<button class="link-btn" id="forecast-detail">Détail<\/button>/);
assert.match(source, /document\.querySelector\('#forecast-detail'\)\?\.addEventListener\('click',\(\)=>\{const x=document\.querySelector\('#forecast-more'\);if\(x\)x\.hidden=!x\.hidden\}\)/);

// Les horizons supplémentaires doivent être contenus dans le bloc repliable,
// afin de ne jamais apparaître par défaut.
const hiddenBlock = source.match(/<div id="forecast-more" hidden class="metrics">([\s\S]*?)<\/div><p class="help">/);
assert.ok(hiddenBlock, 'Le bloc étendu de prévision doit rester caché par défaut.');
assert.match(hiddenBlock[1], /3 mois/);
assert.match(hiddenBlock[1], /6 mois/);
assert.match(hiddenBlock[1], /Année en cours/);

console.log('Step 9 growth forecast: 5/5 assertions passed.');
