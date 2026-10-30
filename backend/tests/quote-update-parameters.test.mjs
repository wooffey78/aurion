import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');

function matchingBrace(text, start, open='[', close=']') {
  let depth = 0, quote = null, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i;
  }
  return -1;
}

function topLevelElements(arraySource) {
  let depth = 0, quote = null, escaped = false, count = arraySource.trim() ? 1 : 0;
  for (let i = 0; i < arraySource.length; i++) {
    const ch = arraySource[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return count;
}

test('PATCH /quotes/:id garde exactement autant de paramètres liés que le SQL', () => {
  const begin = source.indexOf("app.patch('/quotes/:id'");
  const sqlStart = source.indexOf('update quotes set', begin);
  const sqlEnd = source.indexOf('`', sqlStart);
  const sql = source.slice(sqlStart, sqlEnd);
  const placeholders = [...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1]));
  assert.ok(placeholders.length > 0);
  assert.equal(new Set(placeholders).size, Math.max(...placeholders));

  const arrayStart = source.indexOf('[', sqlEnd);
  const arrayEnd = matchingBrace(source, arrayStart);
  assert.ok(arrayEnd > arrayStart);
  const arrayBody = source.slice(arrayStart + 1, arrayEnd);
  assert.equal(topLevelElements(arrayBody), Math.max(...placeholders));
  assert.equal(Math.max(...placeholders), 44);
  assert.match(sql, /mileage_mode=\$8/);
  assert.doesNotMatch(arrayBody, /mileageMode\s*,[\s\S]*mileageMode/);
});
