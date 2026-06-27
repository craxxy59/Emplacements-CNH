const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'cnh-marina-auth';
const KEY = 'password-hashes';

// Mots de passe par défaut stockés uniquement sous forme d'empreintes SHA-256.
// Aucun mot de passe en clair n'est présent dans app.js.
const DEFAULT_HASHES = {
  readonly: '7ca7991ff7b32be24a58293e79e479b50089e87e140084bb861ff28d32d4aaeb',
  manager: '00bbc646708559a07900e8e7b341d34f9a9fd44c3fd20b659ff8059e425f3527',
  admin: 'b92a5740ce59817cf38b088d15f652a498156e431631ba9982936ec14dfc4699'
};

// Mot de passe debug/super admin fixe, non modifiable par l'administrateur.
const DEBUG_HASH = 'c8104025419867191ab0ee142df9195d21d07675da50d9afe3e6f24d60104575';

function jsonResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization'
    },
    body: JSON.stringify(body)
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function getSecret() {
  return process.env.CNH_AUTH_SECRET || process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_SITE_ID || 'cnh-dev-secret';
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

function createToken(role) {
  const payload = Buffer.from(JSON.stringify({ role, iat: Date.now() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (sign(payload) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.role) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function getBlobStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
  return getStore(STORE_NAME);
}

async function getPasswordHashes() {
  const store = getBlobStore();
  const saved = await store.get(KEY, { type: 'json' });
  return {
    readonly: saved?.readonly || DEFAULT_HASHES.readonly,
    manager: saved?.manager || DEFAULT_HASHES.manager,
    admin: saved?.admin || DEFAULT_HASHES.admin
  };
}

async function setPasswordHashes(hashes) {
  const store = getBlobStore();
  await store.setJSON(KEY, hashes);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({ ok: true });
  if (event.httpMethod !== 'POST') return jsonResponse({ ok: false, error: 'Méthode non autorisée' }, 405);

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return jsonResponse({ ok: false, error: 'JSON invalide' }, 400);
  }

  if (body.action === 'login') {
    const hash = sha256(body.password || '');
    const hashes = await getPasswordHashes();

    if (hash === DEBUG_HASH) {
      return jsonResponse({ ok: true, user: { name: 'Debug / Super admin', role: 'debug' }, token: createToken('debug') });
    }
    if (hash === hashes.readonly) {
      return jsonResponse({ ok: true, user: { name: 'Consultation CNH', role: 'lecture' }, token: createToken('lecture') });
    }
    if (hash === hashes.manager) {
      return jsonResponse({ ok: true, user: { name: 'Modification CNH', role: 'manager' }, token: createToken('manager') });
    }
    if (hash === hashes.admin) {
      return jsonResponse({ ok: true, user: { name: 'Administration CNH', role: 'admin' }, token: createToken('admin') });
    }
    return jsonResponse({ ok: false, error: 'Mot de passe incorrect' }, 401);
  }

  if (body.action === 'update-passwords') {
    const auth = verifyToken(body.token || event.headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (!auth || !['admin', 'debug'].includes(auth.role)) {
      return jsonResponse({ ok: false, error: 'Accès administrateur requis' }, 403);
    }

    const readonly = String(body.passwords?.readonly || '').trim();
    const manager = String(body.passwords?.manager || '').trim();
    const admin = String(body.passwords?.admin || '').trim();
    if (readonly.length < 3 || manager.length < 3 || admin.length < 4) {
      return jsonResponse({ ok: false, error: 'Les mots de passe sont trop courts' }, 400);
    }

    const hashes = { readonly: sha256(readonly), manager: sha256(manager), admin: sha256(admin) };
    if (new Set([hashes.readonly, hashes.manager, hashes.admin, DEBUG_HASH]).size < 4) {
      return jsonResponse({ ok: false, error: 'Les mots de passe doivent être différents du debug et entre eux' }, 400);
    }

    await setPasswordHashes(hashes);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: 'Action inconnue' }, 400);
};
