import test from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import crypto from 'node:crypto';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
process.env.AURION_ENCRYPTION_KEY ||= 'local-test-encryption-key-not-for-production-32';
process.env.AURION_ENCRYPTION_KEY_VERSION ||= 'test-k1';
process.env.AURION_ENCRYPTION_KEY_PREVIOUS ||= 'old-encryption-key-only-for-rotation-test-32';
process.env.AURION_ENCRYPTION_KEY_PREVIOUS_VERSION ||= 'test-k0';
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
test('chiffrement des secrets versionné et lecture du format historique', () => {
  const enc = encryptSecret('mon mot de passe');
  assert.equal(enc.split('.')[0], 'v2');
  assert.equal(enc.split('.')[1], process.env.AURION_ENCRYPTION_KEY_VERSION);
  assert.ok(!enc.includes('mon mot'));
  assert.equal(decryptSecret(enc), 'mon mot de passe');

  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update('aurion-secrets:' + process.env.AURION_ENCRYPTION_KEY).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update('secret historique', 'utf8'), cipher.final()]);
  const v1 = ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
  assert.equal(decryptSecret(v1), 'secret historique');

  const previousKey = crypto.createHash('sha256').update('aurion-secrets:' + process.env.AURION_ENCRYPTION_KEY_PREVIOUS).digest();
  const previousIv = crypto.randomBytes(12);
  const previousCipher = crypto.createCipheriv('aes-256-gcm', previousKey, previousIv);
  const previousEncrypted = Buffer.concat([previousCipher.update('secret rotation précédente', 'utf8'), previousCipher.final()]);
  const v1Previous = ['v1', previousIv.toString('base64'), previousCipher.getAuthTag().toString('base64'), previousEncrypted.toString('base64')].join('.');
  assert.equal(decryptSecret(v1Previous), 'secret rotation précédente');
});
test('fin', () => { server.close(); });
