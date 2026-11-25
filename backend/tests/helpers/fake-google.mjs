// Double local minimal de Google Drive pour les tests d'intégration PostgreSQL.
//
// Il ne remplace pas la recette réelle : il permet de vérifier le comportement du client
// (recherche par propriété applicative, création d'arborescence, upload multipart, contrôle
// MD5/taille, reprise après réponse perdue, quota, révocation). Aucun appel ne sort vers Google.
import http from 'node:http';
import crypto from 'node:crypto';

const json = (res, status, body) => {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': payload.length });
  res.end(payload);
};
const empty = (res, status = 200) => { res.writeHead(status); res.end(); };
const newId = prefix => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

export async function startFakeGoogle() {
  const state = {
    files: new Map(),
    refresh: new Map(),
    revoked: new Set(),
    dropNextUploadResponse: false,
    quotaFull: false,
    quota: { limit: '1000000', usage: '10', usageInDrive: '10', usageInDriveTrash: '0' },
    accountEmail: 'compte-test@example.invalid',
    expire: false,
  };
  let accessToken = '';
  // Le test bascule `expireAccessTokens` pour forcer un renouvellement transparent : l'ancien
  // jeton devient invalide, le refresh token reste utilisable sauf s'il a été révoqué.
  Object.defineProperty(state, 'expireAccessTokens', {
    enumerable: true,
    get: () => state.expire,
    set: value => { state.expire = Boolean(value); if (state.expire) accessToken = ''; },
  });
  const issue = () => {
    accessToken = `at_${crypto.randomBytes(12).toString('hex')}`;
    return accessToken;
  };
  const currentAuthorization = req => {
    const value = String(req.headers.authorization || '');
    return value.startsWith('Bearer ') ? value.slice(7) : '';
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);

      // OAuth : échange de code et renouvellement.
      if (url.pathname === '/token' && req.method === 'POST') {
        const form = new URLSearchParams(body.toString('utf8'));
        const grant = form.get('grant_type');
        if (grant === 'refresh_token') {
          const token = form.get('refresh_token') || '';
          if (!token || !state.refresh.has(token) || state.revoked.has(token)) {
            return json(res, 400, { error: 'invalid_grant' });
          }
          return json(res, 200, { access_token: issue(), expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' });
        }
        if (grant === 'authorization_code') {
          if (form.get('code') !== 'good-code') return json(res, 400, { error: 'invalid_grant' });
          const refresh = `rt_${crypto.randomBytes(12).toString('hex')}`;
          state.refresh.set(refresh, true);
          return json(res, 200, {
            access_token: issue(), refresh_token: refresh, expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/drive.file',
          });
        }
        return json(res, 400, { error: 'unsupported_grant_type' });
      }
      if (url.pathname === '/revoke' && req.method === 'POST') {
        const token = new URLSearchParams(body.toString('utf8')).get('token') || '';
        if (token) state.revoked.add(token);
        return empty(res);
      }

      // Toutes les routes Drive exigent le jeton courant.
      if (currentAuthorization(req) !== accessToken) {
        return json(res, 401, { error: { status: 'UNAUTHENTICATED', errors: [{ reason: 'authError' }] } });
      }

      if (url.pathname === '/drive/v3/about' && req.method === 'GET') {
        return json(res, 200, {
          user: { emailAddress: state.accountEmail },
          storageQuota: state.quota,
        });
      }

      if (url.pathname === '/drive/v3/files' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '';
        const prop = q.match(/appProperties has \{\s*key='([^']+)'\s*and\s*value='([^']*)'\s*\}/);
        const mime = q.match(/mimeType='([^']+)'/);
        const files = [...state.files.values()].filter(file => {
          if (file.trashed) return false;
          if (mime && file.mimeType !== mime[1]) return false;
          if (!prop) return true;
          return file.appProperties?.[prop[1]] === prop[2];
        });
        return json(res, 200, { files });
      }

      if (url.pathname === '/drive/v3/files' && req.method === 'POST') {
        let metadata;
        try { metadata = JSON.parse(body.toString('utf8')); } catch { return json(res, 400, { error: 'invalid_json' }); }
        const id = newId('folder');
        const file = {
          id, name: String(metadata.name || 'Sans nom'), mimeType: metadata.mimeType,
          parents: Array.isArray(metadata.parents) ? metadata.parents : [],
          appProperties: metadata.appProperties || {}, trashed: false, version: 1,
        };
        state.files.set(id, file);
        return json(res, 200, { id: file.id, name: file.name });
      }

      const fileMatch = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
      if (fileMatch && req.method === 'GET') {
        const file = state.files.get(decodeURIComponent(fileMatch[1]));
        if (!file || file.trashed) return json(res, 404, { error: { status: 'NOT_FOUND' } });
        if (url.searchParams.get('alt') === 'media') {
          const content = file.content || Buffer.alloc(0);
          res.writeHead(200, { 'content-type': file.mimeType || 'application/octet-stream', 'content-length': content.length });
          return res.end(content);
        }
        return json(res, 200, { id: file.id, name: file.name, mimeType: file.mimeType, trashed: false });
      }

      if (url.pathname === '/upload/drive/v3/files' && req.method === 'POST') {
        if (state.quotaFull) {
          return json(res, 403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } });
        }
        const contentType = String(req.headers['content-type'] || '');
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
        const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : '';
        if (!boundary) return json(res, 400, { error: 'missing_boundary' });
        const separator = Buffer.from(`--${boundary}`);
        const firstHeaderEnd = body.indexOf('\r\n\r\n');
        if (firstHeaderEnd < 0) return json(res, 400, { error: 'invalid_multipart' });
        const jsonStart = firstHeaderEnd + 4;
        const firstEnd = body.indexOf(Buffer.from(`\r\n--${boundary}`), jsonStart);
        if (firstEnd < 0) return json(res, 400, { error: 'invalid_metadata' });
        let metadata;
        try { metadata = JSON.parse(body.subarray(jsonStart, firstEnd).toString('utf8')); } catch { return json(res, 400, { error: 'invalid_metadata_json' }); }
        const binaryHeaderEnd = body.indexOf('\r\n\r\n', firstEnd + separator.length);
        if (binaryHeaderEnd < 0) return json(res, 400, { error: 'invalid_content' });
        const contentStart = binaryHeaderEnd + 4;
        const contentEnd = body.indexOf(Buffer.from(`\r\n--${boundary}--`), contentStart);
        if (contentEnd < 0) return json(res, 400, { error: 'invalid_content_end' });
        const content = body.subarray(contentStart, contentEnd);
        const id = newId('file');
        const file = {
          id, name: String(metadata.name || 'document'), mimeType: metadata.mimeType,
          parents: Array.isArray(metadata.parents) ? metadata.parents : [],
          appProperties: metadata.appProperties || {}, trashed: false, version: 1,
          content, size: content.length, md5Checksum: crypto.createHash('md5').update(content).digest('hex'),
        };
        state.files.set(id, file);
        if (state.dropNextUploadResponse) {
          // Fichier créé côté fournisseur, réponse perdue : le client doit retrouver le fichier
          // par sa propriété applicative au prochain essai, sans créer de doublon.
          state.dropNextUploadResponse = false;
          return json(res, 500, { error: { status: 'UNAVAILABLE' } });
        }
        return json(res, 200, { id, name: file.name, md5Checksum: file.md5Checksum, size: file.size, version: file.version });
      }

      return json(res, 404, { error: { status: 'NOT_FOUND', message: url.pathname } });
    } catch (error) {
      return json(res, 500, { error: { status: 'INTERNAL', message: String(error?.message || error) } });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    state,
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}
