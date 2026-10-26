import assert from 'node:assert/strict';
import fs from 'node:fs';

const other = fs.readFileSync('assets/js/pages/dash/other.js','utf8');
const business = fs.readFileSync('backend/src/routes/business.ts','utf8');

assert.doesNotMatch(other, /<[^>]*(?:h1|h2|h3|span|small)[^>]*>\s*Prochain rendez-vous\s*<\//i);
assert.doesNotMatch(other, /Prochain rendez-vous/i);
assert.match(other, /Les prochains rendez-vous sont désormais suivis dans le Journal de bord\./);
assert.match(business, /starts_at>now\(\) order by starts_at asc limit 5/);
assert.match(business, /journal\.push\(\{kind:'appointment'/);

console.log('step8: 5/5');
