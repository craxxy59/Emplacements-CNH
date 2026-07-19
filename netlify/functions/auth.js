const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'cnh-marina-auth';
const KEY = 'password-record';

const DEFAULT_HASHES = {
  readonly: '273ab832692e54bed7d1f368383fbce7ab6ed96d7483b1a043c4d129aea373e4',
  manager: '7ca7991ff7b32be24a58293e79e479b50089e87e140084bb861ff28d32d4aaeb',
  admin: 'cd057980c403b7ab2f03e22c1557e518270031a81487a6117acc19611dd72b6b'
};
const DEBUG_HASH = 'c8104025419867191ab0ee142df9195d21d07675da50d9afe3e6f24d60104575';
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = new Set([
  'https://emplacements-cnh.netlify.app',
  'https://emplacements-cnh.vercel.app',
  'http://localhost:3000'
]);

const attempts = new Map();

function getClientIp(event) {
  const headers = event.headers || {};
  const xf = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '';
  if (xf) return String(xf).split(',')[0].trim();
  return headers['x-nf-client-connection-ip'] || headers['client-ip'] || 'unknown';
}
function checkRateLimit(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec) {
    attempts.set(ip, { count: 0, firstAt: now, blockedUntil: 0 });
    return { allowed: true };
  }
  if (rec.blockedUntil && rec.blockedUntil > now) return { allowed: false, retryAfter: Math.ceil((rec.blockedUntil - now) / 1000) };
  if (now - rec.firstAt > 5 * 60 * 1000) { rec.count = 0; rec.firstAt = now; }
  if (rec.count >= 8) { rec.blockedUntil = now + 15 * 60 * 1000; return { allowed: false, retryAfter: 900 }; }
  return { allowed: true };
}
function recordFail(ip) { const rec = attempts.get(ip) || { count: 0, firstAt: Date.now(), blockedUntil: 0 }; rec.count += 1; attempts.set(ip, rec); }
function recordSuccess(ip) { attempts.delete(ip); }

function getCorsOrigin(event) {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  return null;
}

function jsonResponse(event, body, statusCode = 200) {
  const origin = getCorsOrigin(event);
  const baseHeaders = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'vary': 'Origin',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://emplacements-cnh.netlify.app https://emplacements-cnh.vercel.app; font-src 'self'; frame-ancestors 'none'"
  };
  if (origin) {
    baseHeaders['access-control-allow-origin'] = origin;
  }
  return {
    statusCode,
    headers: baseHeaders,
    body: JSON.stringify(body)
  };
}


function sha256Legacy(v) { return crypto.createHash('sha256').update(String(v || ''), 'utf8').digest('hex'); }
function hashSecure(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(pwd), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}
function verifySecure(pwd, stored) {
  if (!stored || typeof stored !== 'string') return false;
  if (stored.includes(':')) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    try {
      const derived = crypto.scryptSync(String(pwd), salt, 64).toString('hex');
      const a = Buffer.from(hash, 'hex');
      const b = Buffer.from(derived, 'hex');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (_) { return false; }
  }
  return sha256Legacy(pwd) === stored;
}

function getSecret() { return process.env.CNH_AUTH_SECRET || process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_SITE_ID || 'cnh-dev-secret'; }
function sign(payload) { return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex'); }
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
    if (!parsed.iat || Date.now() - parsed.iat > TOKEN_MAX_AGE_MS) return null;
    return parsed;
  } catch (_) { return null; }
}

function getBlobStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
  return getStore(STORE_NAME);
}

async function getPasswordRecord() {
  const store = getBlobStore();
  const saved = await store.get(KEY, { type: 'json' });
  if (saved?.hashes) {
    return { hashes: { readonly: saved.hashes.readonly || DEFAULT_HASHES.readonly, manager: saved.hashes.manager || DEFAULT_HASHES.manager, admin: saved.hashes.admin || DEFAULT_HASHES.admin } };
  }
  return { hashes: { ...DEFAULT_HASHES } };
}
async function savePasswordRecord(hashes) {
  const store = getBlobStore();
  const record = { version: 3, hashes, updatedAt: new Date().toISOString() };
  await store.setJSON(KEY, record);
  return record;
}
function assertAdmin(token) { const auth = verifyToken(token); return auth && ['admin', 'debug'].includes(auth.role) ? auth : null; }
function getTokenFromEvent(event, body) {
  if (body?.token) return String(body.token);
  const headers = event.headers || {};
  const h = headers.authorization || headers.Authorization || '';
  if (h) return String(h).replace(/^Bearer\s+/i, '').trim();
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse(event, { ok: false, error: 'CORS non autorisé' }, 403);
    }
    return jsonResponse(event, { ok: true });
  }
  if (event.httpMethod !== 'POST') return jsonResponse(event, { ok: false, error: 'Méthode non autorisée' }, 405);

  const ip = getClientIp(event);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) return jsonResponse(event, { ok: false, error: 'Trop de tentatives', message: `Réessaie dans ${rl.retryAfter}s` }, 429);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return jsonResponse(event, { ok: false, error: 'JSON invalide' }, 400); }

  if (body.action === 'login') {
    const pwd = String(body.password || '');
    if (sha256Legacy(pwd) === DEBUG_HASH) { recordSuccess(ip); return jsonResponse(event, { ok: true, user: { name: 'Debug / Super admin', role: 'debug' }, token: createToken('debug') }); }
    const record = await getPasswordRecord();
    if (verifySecure(pwd, record.hashes.readonly)) { recordSuccess(ip); return jsonResponse(event, { ok: true, user: { name: 'Consultation CNH', role: 'lecture' }, token: createToken('lecture') }); }
    if (verifySecure(pwd, record.hashes.manager)) { recordSuccess(ip); return jsonResponse(event, { ok: true, user: { name: 'Modification CNH', role: 'manager' }, token: createToken('manager') }); }
    if (verifySecure(pwd, record.hashes.admin)) { recordSuccess(ip); return jsonResponse(event, { ok: true, user: { name: 'Administration CNH', role: 'admin' }, token: createToken('admin') }); }
    recordFail(ip);
    return jsonResponse(event, { ok: false, error: 'Mot de passe incorrect' }, 401);
  }

  if (body.action === 'validate' || body.action === 'me') {
    const token = getTokenFromEvent(event, body);
    const auth = verifyToken(token);
    if (!auth) return jsonResponse(event, { ok: false, error: 'Session expirée' }, 401);
    const names = { lecture: 'Consultation CNH', manager: 'Modification CNH', admin: 'Administration CNH', debug: 'Debug / Super admin' };
    return jsonResponse(event, { ok: true, user: { name: names[auth.role] || auth.role, role: auth.role } });
  }

  if (body.action === 'get-passwords') {
    const token = getTokenFromEvent(event, body);
    if (!assertAdmin(token)) return jsonResponse(event, { ok: false, error: 'Accès administrateur requis' }, 403);
    // F1 critique : ne jamais renvoyer en clair
    return jsonResponse(event, { ok: true, passwords: { readonly: '', manager: '', admin: '' }, message: 'Mots de passe hachés non récupérables. Utilise réinitialisation.' });
  }

  if (body.action === 'update-passwords') {
    const token = getTokenFromEvent(event, body);
    if (!assertAdmin(token)) return jsonResponse(event, { ok: false, error: 'Accès administrateur requis' }, 403);
    const current = await getPasswordRecord();
    const input = body.passwords || {};
    const newHashes = { ...current.hashes };
    const toUpdate = {};
    if (String(input.readonly || '').trim()) toUpdate.readonly = String(input.readonly).trim();
    if (String(input.manager || '').trim()) toUpdate.manager = String(input.manager).trim();
    if (String(input.admin || '').trim()) toUpdate.admin = String(input.admin).trim();
    if (Object.keys(toUpdate).length === 0) return jsonResponse(event, { ok: false, error: 'Renseigne au moins un nouveau mot de passe à réinitialiser.' }, 400);
    if (toUpdate.readonly && toUpdate.readonly.length < 3) return jsonResponse(event, { ok: false, error: 'Mot de passe consultation trop court' }, 400);
    if (toUpdate.manager && toUpdate.manager.length < 3) return jsonResponse(event, { ok: false, error: 'Mot de passe modification trop court' }, 400);
    if (toUpdate.admin && toUpdate.admin.length < 4) return jsonResponse(event, { ok: false, error: 'Mot de passe administration trop court' }, 400);
    const plainList = [toUpdate.readonly, toUpdate.manager, toUpdate.admin].filter(Boolean);
    if (plainList.some(p => sha256Legacy(p) === DEBUG_HASH)) return jsonResponse(event, { ok: false, error: 'Ne doit pas être égal au mot de passe debug' }, 400);
    if (new Set(plainList).size !== plainList.length) return jsonResponse(event, { ok: false, error: 'Les nouveaux mots de passe doivent être différents entre eux' }, 400);
    if (toUpdate.readonly) newHashes.readonly = hashSecure(toUpdate.readonly);
    if (toUpdate.manager) newHashes.manager = hashSecure(toUpdate.manager);
    if (toUpdate.admin) newHashes.admin = hashSecure(toUpdate.admin);
    await savePasswordRecord(newHashes);
    return jsonResponse(event, { ok: true, message: 'Mots de passe réinitialisés avec hachage sécurisé.' });
  }

  return jsonResponse(event, { ok: false, error: 'Action inconnue' }, 400);
};
