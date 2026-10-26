import test from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
const mail = await import('../dist/services/mail.js');
const { buildIcs } = await import('../dist/services/ics.js');
const { encryptSecret, decryptSecret } = await import('../dist/services/secrets.js');

const received = [];
const server = new SMTPServer({
  authOptional: false, allowInsecureAuth: true, disabledCommands: ['STARTTLS'],
  onAuth(auth, _s, cb) { auth.username === 'moi@example.fr' && auth.password === 'app-password-ok' ? cb(null, { user: 1 }) : cb(new Error('Invalid login')); },
  onData(stream, _s, cb) { const c = []; stream.on('data', d => c.push(d)); stream.on('end', () => { received.push(Buffer.concat(c).toString()); cb(); }); },
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.server.address().port;
const settings = (password) => mail.normalizeSettings({ email: 'moi@example.fr', password, host: '127.0.0.1', port, security: 'none', provider: 'custom', fromName: 'Atelier Test' });

test('détection du fournisseur depuis l\'adresse', () => {
  assert.equal(mail.detectPreset('a@gmail.com').id, 'gmail');
  assert.equal(mail.detectPreset('a@hotmail.fr').id, 'outlook');
  assert.equal(mail.detectPreset('a@societe-inconnue.fr'), undefined);
});
test('connexion non chiffrée refusée hors poste local', () => {
  assert.throws(() => mail.normalizeSettings({ email: 'a@b.fr', password: 'x', host: 'smtp.exemple.fr', port: 25, security: 'none' }), /non chiffrée/);
});
test('mauvais mot de passe : message clair', async () => {
  await assert.rejects(() => mail.verifySettings(settings('mauvais')), e => e.code === 'MAIL_AUTH_FAILED');
});
test('vérification puis envoi avec pièce jointe PDF', async () => {
  const s = settings('app-password-ok');
  await mail.verifySettings(s);
  await mail.sendWithSettings(s, { to: 'client@example.fr', subject: 'Devis DEV-1', text: 'Bonjour', attachments: [{ filename: 'DEV-1.pdf', content: Buffer.from('%PDF-1.4 test') }] });
  const raw = received.at(-1);
  assert.match(raw, /Subject: Devis DEV-1/); assert.match(raw, /filename="?DEV-1\.pdf/); assert.match(raw, /Atelier Test/);
});
test('invitation agenda .ics (création puis annulation, même UID)', async () => {
  const s = settings('app-password-ok');
  const start = new Date('2026-10-01T09:00:00Z'), end = new Date('2026-10-01T10:00:00Z');
  const mk = (method, sequence) => buildIcs({ uid: 'abc@aurion.local', method, sequence, start, end, summary: 'Réparation, écran', organizer: { email: s.email }, attendees: [{ email: s.email }] });
  const ics = mk('REQUEST', 0);
  assert.match(ics, /METHOD:REQUEST/); assert.match(ics, /DTSTART:20261001T090000Z/); assert.match(ics, /SUMMARY:Réparation\\, écran/);
  await mail.sendWithSettings(s, { to: s.email, subject: 'Rendez-vous', text: 'x', icalEvent: { method: 'REQUEST', content: ics } });
  assert.match(received.at(-1), /BEGIN:VCALENDAR/);
  const cancel = mk('CANCEL', 1);
  assert.match(cancel, /STATUS:CANCELLED/); assert.match(cancel, /SEQUENCE:1/);
});
test('chiffrement des secrets', () => {
  const enc = encryptSecret('mon mot de passe');
  assert.ok(!enc.includes('mon mot')); assert.equal(decryptSecret(enc), 'mon mot de passe');
});
test('fin', () => { server.close(); });
