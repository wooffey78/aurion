import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function luminance(hex) {
  const values = hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  return 0.2126*values[0]+0.7152*values[1]+0.0722*values[2];
}
function contrast(a,b) {
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}

test('dashboard navigation has a programmatic label and announces the current page', () => {
  const dashboard=read('../../assets/js/pages/dashboard.js');
  assert.match(dashboard, /nav class="nav" aria-label="Navigation principale"/);
  assert.match(dashboard, /aria-current="\$\{k===id\?'page':'false'\}"/);
  assert.match(dashboard, /heading\.focus\(\{preventScroll:true\}\)/);
});

test('primary actions meet WCAG AA contrast and coarse-pointer targets are 44 px', () => {
  const css=read('../../assets/css/app.css');
  assert.match(css, /\.btn\.primary\{color:#fff;background:linear-gradient\(135deg,#31584e,#3f695d\)\}/);
  assert.ok(contrast('#ffffff','#31584e')>=4.5);
  assert.ok(contrast('#ffffff','#3f695d')>=4.5);
  assert.match(css, /@media \(pointer:coarse\)[\s\S]*?\.nav button,\.btn\.small,\.icon-btn\{min-height:44px\}/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /:focus-visible/);
});

test('mailbox errors are announced and password visibility exposes its state', () => {
  const mailbox=read('../../assets/js/pages/mailbox.js');
  assert.match(mailbox, /id="mb-error" class="error" role="alert" aria-live="assertive"/);
  assert.match(mailbox, /aria-pressed="false"/);
  assert.match(mailbox, /b\.setAttribute\('aria-pressed',String\(show\)\)/);
  assert.match(mailbox, /const popup=window\.open\('about:blank','_blank'\)/);
});
