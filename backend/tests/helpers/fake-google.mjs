// Double local de Google OAuth + Drive v3 pour les tests (aucun appel réseau externe, aucun secret réel).
// Couvre : échange/renouvellement/révocation de jeton, recherche par appProperties, création de dossiers,
// envoi multipart/related, lecture, about.get (quota) et pannes simulées (quota, réponse perdue, jeton expiré).
import http from 'node:http';
import crypto from 'node:crypto';

export async function startFakeGoogle() {
  const state = {
    files: new Map(), seq: 0, tokens: new Map(), refresh: new Map(), revoked: new Set(), calls: [],
    quota: { limit: '1000000', usage: '100', usageInDrive: '80', usageInDriveTrash: '5' },
    quotaFull: false, dropNextUploadResponse: false, expireAccessTokens: false, failNext5xx: 0, rateLimitNext: 0,
  };
  const issue = () => { const a = 'at_' + crypto.randomBytes(8).toString('hex'); state.tokens.set(a, Date.now() + 3600_000); return a; };
  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readBody = req => new Promise(r => { const c = []; req.on('data', x => c.push(x)); req.on('end', () => r(Buffer.concat(c))); });
  const authOk = req => { const t = String(req.headers.authorization || '').replace(/^Bearer /, ''); const exp = state.tokens.get(t); return Boolean(exp) && !state.expireAccessTokens && exp > Date.now(); };
  const match = (q, f) => {
    const props = [...String(q).matchAll(/appProperties has \{ key='([^']+)' and value='((?:\\'|[^'])+)' \}/g)].map(m => [m[1], m[2].replace(/\\'/g, "'")]);
    if (/trashed=false/.test(q) && f.trashed) return false;
    const mime = /mimeType='([^']+)'/.exec(q)?.[1]; if (mime && f.mimeType !== mime) return false;
    return props.every(([k, v]) => f.appProperties?.[k] === v);
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'); const body = await readBody(req);
    state.calls.push(`${req.method} ${url.pathname}`);
    if (url.pathname === '/token') {
      const p = new URLSearchParams(body.toString());
      if (p.get('grant_type') === 'authorization_code') {
        if (p.get('code') !== 'good-code') return json(res, 400, { error: 'invalid_grant' });
        const rt = 'rt_' + crypto.randomBytes(8).toString('hex'); state.refresh.set(rt, true);
        return json(res, 200, { access_token: issue(), refresh_token: rt, expires_in: 3600, scope: p.get('scope_override') || 'https://www.googleapis.com/auth/drive.file' });
      }
      if (p.get('grant_type') === 'refresh_token') {
        if (!state.refresh.get(p.get('refresh_token')) || state.revoked.has(p.get('refresh_token'))) return json(res, 400, { error: 'invalid_grant' });
        state.expireAccessTokens = false; return json(res, 200, { access_token: issue(), expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' });
      }
      return json(res, 400, { error: 'unsupported_grant_type' });
    }
    if (url.pathname === '/revoke') { const t = new URLSearchParams(body.toString()).get('token'); state.revoked.add(t); return json(res, 200, {}); }
    if (!authOk(req)) return json(res, 401, { error: { code: 401, status: 'UNAUTHENTICATED' } });
    if (state.failNext5xx > 0) { state.failNext5xx--; return json(res, 503, { error: { code: 503 } }); }
    if (state.rateLimitNext > 0) { state.rateLimitNext--; return json(res, 403, { error: { code: 403, errors: [{ reason: 'userRateLimitExceeded' }] } }); }
    if (url.pathname === '/drive/v3/about') return json(res, 200, { user: { emailAddress: 'pro@example.test' }, storageQuota: state.quota });
    if (url.pathname === '/drive/v3/files' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      return json(res, 200, { files: [...state.files.values()].filter(f => match(q, f)).map(f => ({ id: f.id, name: f.name, md5Checksum: f.md5Checksum, size: String(f.size), version: '1', mimeType: f.mimeType, parents: f.parents })) });
    }
    if (url.pathname === '/drive/v3/files' && req.method === 'POST') {
      const meta = JSON.parse(body.toString() || '{}'); const id = 'f' + (++state.seq);
      state.files.set(id, { id, ...meta, size: 0, trashed: false }); return json(res, 200, { id, name: meta.name });
    }
    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (one && req.method === 'GET') {
      const f = state.files.get(decodeURIComponent(one[1])); if (!f) return json(res, 404, { error: { code: 404 } });
      if (url.searchParams.get('alt') === 'media') { res.writeHead(200, { 'content-type': f.mimeType }); return res.end(f.content || Buffer.alloc(0)); }
      return json(res, 200, { id: f.id, trashed: Boolean(f.trashed), mimeType: f.mimeType });
    }
    if (url.pathname === '/upload/drive/v3/files' && req.method === 'POST') {
      if (state.quotaFull) return json(res, 403, { error: { code: 403, errors: [{ reason: 'storageQuotaExceeded' }] } });
      const boundary = /boundary=([^;]+)/.exec(String(req.headers['content-type']))?.[1];
      const raw = body.toString('latin1'); const parts = raw.split(`--${boundary}`).slice(1, -1);
      const meta = JSON.parse(parts[0].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''));
      const content = Buffer.from(parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1');
      const id = 'f' + (++state.seq); const md5 = crypto.createHash('md5').update(content).digest('hex');
      state.files.set(id, { id, ...meta, content, size: content.length, md5Checksum: md5, trashed: false });
      if (state.dropNextUploadResponse) { state.dropNextUploadResponse = false; req.socket.destroy(); return; }
      return json(res, 200, { id, name: meta.name, md5Checksum: md5, size: String(content.length), version: '1' });
    }
    return json(res, 404, { error: { code: 404 } });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { state, base, close: () => new Promise(r => server.close(r)) };
}
