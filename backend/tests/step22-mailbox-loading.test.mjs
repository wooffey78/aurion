import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../assets/js/pages/mailbox.js', import.meta.url), 'utf8');

function formBody() {
  const start = source.indexOf('function form(');
  assert.notEqual(start, -1, 'form() doit exister');
  const end = source.indexOf('\n}', start);
  return source.slice(start, end === -1 ? source.length : end);
}

test('étape 22: le formulaire de messagerie ne référence pas une variable companyName hors portée', () => {
  const body = formBody();
  assert.match(body, /ctx\.companyName/);
  assert.doesNotMatch(body, /\bctx\.companyName\s*=\s*companyName\b/);
});

test('étape 22: renderMailbox transmet bien companyName dans le contexte du formulaire', () => {
  assert.match(source, /const\s+ctx=\{onChange,compact,companyName\}/);
  assert.match(source, /form\(root,st,ctx\)/);
});
